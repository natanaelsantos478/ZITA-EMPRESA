/**
 * whatsapp-gateway — Recebe mensagens do Z-API e responde via Gemini
 *
 * Fluxo:
 *  1. Recebe webhook do Z-API
 *  2. Ignora mensagens enviadas pela própria instância (fromMe: true)
 *  3. Identifica o agente responsável via ia_agents.integracao_config.connections.whatsapp.instance_id
 *  4. Busca ou cria conversa em ia_conversas
 *  5. Obtém a Gemini API Key da empresa (descriptografada em memória)
 *  6. Busca histórico das últimas 20 mensagens da conversa
 *  7. Chama o Gemini com systemPrompt + histórico + nova mensagem
 *  8. Salva resposta em ia_mensagens
 *  9. Envia resposta via Z-API
 *
 * Variáveis de ambiente obrigatórias:
 *  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Zapi-Token',
}

// ── Crypto ────────────────────────────────────────────────────────────────────

async function importKey(keyStr: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
}

async function decrypt(encrypted: string, keyStr: string): Promise<string> {
  const key = await importKey(keyStr)
  const buf = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(pt)
}

// ── Gemini ────────────────────────────────────────────────────────────────────

type HistMsg = { role: 'user' | 'model'; conteudo: string }

async function chamarGemini(
  mensagem:   string,
  historico:  HistMsg[],
  systemPrompt: string,
  apiKey:     string,
  modelo:     string,
): Promise<string> {
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`

  const contents = [
    ...historico.map((m) => ({ role: m.role, parts: [{ text: m.conteudo }] })),
    { role: 'user', parts: [{ text: mensagem }] },
  ]

  const body: Record<string, unknown> = {
    contents,
    generation_config: { temperature: 0.7, max_output_tokens: 2048 },
  }
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`)
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// ── Z-API send ────────────────────────────────────────────────────────────────

async function enviarZApi(
  zapiUrl:    string,
  instanceId: string,
  token:      string,
  phone:      string,
  message:    string,
): Promise<void> {
  const base = zapiUrl.replace(/\/$/, '')
  await fetch(`${base}/instances/${instanceId}/token/${token}/send-text`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone, message }),
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Apenas POST.' }, 405)

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const ENC_KEY = Deno.env.get('ENCRYPTION_KEY') ?? ''

    // ── 1. Payload Z-API ──────────────────────────────────────────────────────
    const payload = await req.json() as {
      instanceId?: string
      phone?:      string
      body?:       string
      fromMe?:     boolean
      type?:       string
      messageId?:  string
    }

    // Ignorar mensagens enviadas pela própria instância ou sem conteúdo
    if (payload.fromMe)                         return json({ ok: true, skip: 'fromMe' })
    if (!payload.phone || !payload.body?.trim()) return json({ ok: true, skip: 'empty' })
    if (payload.type && payload.type !== 'chat') return json({ ok: true, skip: 'non-chat' })

    const instanceId = payload.instanceId ?? ''
    const phone      = payload.phone
    const mensagem   = payload.body.trim()

    // ── 2. Identificar agente via instance_id ─────────────────────────────────
    // O agente Zeus armazena o config do Z-API em integracao_config.connections.whatsapp
    const { data: agents } = await sb
      .from('ia_agents')
      .select('id, nome, company_id, tipo, personalidade, integracao_config')

    const agentMatch = (agents ?? []).find((a: Record<string, unknown>) => {
      const cfg = (a.integracao_config as Record<string, unknown> | null) ?? {}
      const conn = (cfg.connections as Record<string, unknown> | null) ?? {}
      const wa   = (conn.whatsapp  as Record<string, unknown> | null) ?? {}
      return wa.instance_id === instanceId || wa.instanceId === instanceId
    }) as Record<string, unknown> | undefined

    if (!agentMatch) return json({ ok: true, skip: 'no_agent_for_instance' })

    const agent_id   = agentMatch.id as string
    const company_id = agentMatch.company_id as string
    const agentNome  = agentMatch.nome as string
    const personalidade = (agentMatch.personalidade as Record<string, unknown>) ?? {}
    const systemPrompt  = (personalidade.prompt_sistema as string | undefined)
      ?? `Você é ${agentNome}, assistente de IA. Responda em português brasileiro.`

    // Z-API credentials do agente
    const cfg  = (agentMatch.integracao_config as Record<string, unknown>) ?? {}
    const conn = (cfg.connections as Record<string, unknown>) ?? {}
    const wa   = (conn.whatsapp  as Record<string, unknown>) ?? {}
    const zapiUrl    = (wa.url       as string) ?? 'https://api.z-api.io'
    const zapiToken  = (wa.token     as string) ?? ''

    // ── 3. Buscar/criar conversa ──────────────────────────────────────────────
    let conversa_id: string

    const { data: existingConversa } = await sb
      .from('ia_conversas')
      .select('id')
      .eq('company_id', company_id)
      .eq('agent_id',   agent_id)
      .contains('metadados', { phone })
      .eq('status', 'ativa')
      .maybeSingle()

    if (existingConversa?.id) {
      conversa_id = existingConversa.id
    } else {
      const { data: novaConversa, error: convErr } = await sb
        .from('ia_conversas')
        .insert({
          company_id,
          agent_id,
          status:   'ativa',
          canal:    'whatsapp',
          metadados: { phone, instance_id: instanceId },
        })
        .select('id')
        .single()

      if (convErr || !novaConversa) {
        return json({ error: `Falha ao criar conversa: ${convErr?.message}` }, 500)
      }
      conversa_id = novaConversa.id
    }

    // ── 4. Salvar mensagem do usuário ─────────────────────────────────────────
    await sb.from('ia_mensagens').insert({
      conversa_id,
      company_id,
      remetente_tipo: 'humano',
      remetente_nome: phone,
      conteudo:       mensagem,
      conteudo_tipo:  'text',
      metadados:      { phone, message_id: payload.messageId },
      tokens_prompt:  0,
      tokens_resposta: 0,
    })

    // ── 5. Gemini API Key da empresa (descriptografada apenas em memória) ─────
    if (!ENC_KEY) {
      return json({ error: 'ENCRYPTION_KEY não configurada no servidor.' }, 500)
    }

    const { data: company } = await sb
      .from('companies')
      .select('gemini_api_key_enc, gemini_modelo')
      .eq('id', company_id)
      .single()

    if (!(company as Record<string, unknown>)?.gemini_api_key_enc) {
      return json({ error: 'Gemini API Key não configurada para esta empresa.' }, 400)
    }

    const geminiKey = await decrypt(
      (company as Record<string, unknown>).gemini_api_key_enc as string,
      ENC_KEY,
    )
    const modelo = ((company as Record<string, unknown>).gemini_modelo as string) || 'gemini-2.0-flash'

    // ── 6. Histórico da conversa (últimas 20 mensagens) ───────────────────────
    const { data: historico } = await sb
      .from('ia_mensagens')
      .select('remetente_tipo, conteudo')
      .eq('conversa_id', conversa_id)
      .order('created_at', { ascending: false })
      .limit(20)

    const histMsg: HistMsg[] = (historico ?? [])
      .reverse()
      .filter((m: { remetente_tipo: string; conteudo: string }) => m.conteudo !== mensagem)
      .map((m: { remetente_tipo: string; conteudo: string }) => ({
        role:     m.remetente_tipo === 'ia' ? 'model' : 'user',
        conteudo: m.conteudo,
      })) as HistMsg[]

    // ── 7. Chamar Gemini ──────────────────────────────────────────────────────
    const inicio = Date.now()
    let respostaTexto: string

    try {
      respostaTexto = await chamarGemini(mensagem, histMsg, systemPrompt, geminiKey, modelo)
    } catch (err) {
      respostaTexto = `Erro ao processar sua mensagem. Tente novamente em instantes.`
      console.error('[whatsapp-gateway] Gemini error:', String(err))
    }

    const latencia = Date.now() - inicio

    // ── 8. Salvar resposta da IA ──────────────────────────────────────────────
    await sb.from('ia_mensagens').insert({
      conversa_id,
      company_id,
      remetente_tipo:  'ia',
      remetente_nome:  agentNome,
      conteudo:        respostaTexto || '…',
      conteudo_tipo:   'text',
      metadados:       { modelo_usado: modelo, canal: 'whatsapp' },
      modelo_usado:    modelo,
      latencia_ms:     latencia,
      tokens_prompt:   0,
      tokens_resposta: 0,
    })

    // ── 9. Enviar resposta via Z-API ──────────────────────────────────────────
    if (zapiToken && respostaTexto) {
      try {
        await enviarZApi(zapiUrl, instanceId, zapiToken, phone, respostaTexto)
      } catch (err) {
        console.error('[whatsapp-gateway] Z-API send error:', String(err))
      }
    }

    return json({ ok: true })

  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
