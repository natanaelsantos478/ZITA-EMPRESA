/**
 * ia-dispatcher — Roteia mensagens do chat através do Zeus (hub central)
 *
 * Fluxo:
 *  1. Valida JWT
 *  2. Busca agente-alvo e Zeus da empresa
 *  3. Se agente-alvo NÃO é Zeus E Zeus tem URL configurada:
 *       → POST para Flowise/Zeus com { question, history, agentContext }
 *       Zeus decide o fluxo, quem responde, quem só visualiza
 *  4. Caso contrário (chat direto com Zeus, ou Zeus sem URL):
 *       → Chama a LLM configurada no agente-alvo diretamente
 *         (anthropic / gemini / openai / flowise / custom / webhook)
 *       → Se nenhuma key de agente configurada, tenta Gemini da empresa (company-level key)
 *  5. Insere resposta em ia_mensagens via service_role
 *
 * Configuração por agente:
 *  Zeus:   integracao_tipo = flowise|custom|webhook, integracao_url, integracao_config.api_key
 *  Outros: integracao_tipo = anthropic|gemini|openai
 *          integracao_config.model          = modelo específico
 *          integracao_config.api_key        = chave Anthropic/OpenAI
 *          integracao_config.gemini_api_key = chave Gemini individual do agente
 *  System prompt: personalidade.prompt_sistema
 *
 * Fallback Gemini: quando o agente não tem key configurada, o dispatcher busca
 * a Gemini API Key criptografada da empresa (companies.gemini_api_key_enc),
 * descriptografa em memória via AES-256-GCM e usa diretamente.
 * A key NUNCA é logada nem retornada ao frontend.
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

type HistMsg = { role: 'user' | 'assistant'; content: string }

// ── AES-256-GCM decrypt (mesma lógica do company-settings) ───────────────────

async function decryptKey(encrypted: string, keyStr: string): Promise<string> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt'])
  const buf = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(pt)
}

// ── Busca a Gemini Key da empresa (fallback quando agente não tem key própria) ─

async function getCompanyGeminiKey(
  sb: ReturnType<typeof createClient>,
  company_id: string,
): Promise<{ key: string; modelo: string } | null> {
  const encKeyStr = Deno.env.get('ENCRYPTION_KEY')
  if (!encKeyStr) return null

  const { data } = await sb
    .from('companies')
    .select('gemini_api_key_enc, gemini_modelo')
    .eq('id', company_id)
    .single()

  const enc    = (data as Record<string, unknown> | null)?.gemini_api_key_enc as string | undefined
  const modelo = ((data as Record<string, unknown> | null)?.gemini_modelo as string) || 'gemini-2.0-flash'

  if (!enc) return null

  try {
    const key = await decryptKey(enc, encKeyStr)
    return { key, modelo }
  } catch {
    return null
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // ── 1. Validar JWT ────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Token de autenticação não fornecido.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Token inválido ou expirado.' }, 401)

    // ── 2. Ler payload ────────────────────────────────────────────────────────
    const { conversa_id, agent_id, mensagem, company_id } = await req.json() as {
      conversa_id: string; agent_id: string; mensagem: string; company_id: string
    }
    if (!conversa_id || !agent_id || !mensagem || !company_id) {
      return json({ error: 'conversa_id, agent_id, mensagem e company_id são obrigatórios.' }, 400)
    }

    // ── 3. Buscar agente-alvo e Zeus em paralelo ──────────────────────────────
    const [agentRes, zeusRes] = await Promise.all([
      sb.from('ia_agents')
        .select('id, nome, tipo, funcao, integracao_tipo, integracao_url, integracao_config, personalidade')
        .eq('id', agent_id)
        .single(),
      sb.from('ia_agents')
        .select('id, integracao_url, integracao_config')
        .eq('company_id', company_id)
        .eq('tipo', 'zeus')
        .maybeSingle(),
    ])

    if (agentRes.error || !agentRes.data) return json({ error: 'Agente não encontrado.' }, 404)
    const agent = agentRes.data
    const zeus  = zeusRes.data

    // ── 4. Histórico das últimas mensagens ────────────────────────────────────
    const { data: historico } = await sb
      .from('ia_mensagens')
      .select('remetente_tipo, conteudo')
      .eq('conversa_id', conversa_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const history: HistMsg[] = (historico ?? [])
      .reverse()
      .filter((m: { remetente_tipo: string; conteudo: string }) => m.conteudo !== mensagem)
      .map((m: { remetente_tipo: string; conteudo: string }) => ({
        role:    m.remetente_tipo === 'humano' ? 'user' : 'assistant',
        content: m.conteudo,
      }))

    // ── 5. Configuração do agente-alvo ────────────────────────────────────────
    const config        = (agent.integracao_config ?? {}) as Record<string, unknown>
    const personalidade = (agent.personalidade     ?? {}) as Record<string, unknown>
    const apiKey        = (config.api_key           ?? '') as string
    const geminiKey     = (config.gemini_api_key    ?? '') as string
    const tipo          = (agent.integracao_tipo    ?? '') as string
    const url           = (agent.integracao_url     ?? '') as string
    const systemPrompt  = (personalidade.prompt_sistema ?? '') as string
    const temperatura   = (personalidade.temperatura    ?? 0.7) as number
    const maxTokens     = (personalidade.max_tokens      ?? 1024) as number
    const model         = (config.model             ?? '') as string

    // ── 6. Decidir rota ───────────────────────────────────────────────────────
    const isZeusTarget = agent.tipo === 'zeus'
    const zeusUrl      = (zeus?.integracao_url ?? '') as string
    const zeusApiKey   = ((zeus?.integracao_config as Record<string, unknown> | undefined)?.api_key ?? '') as string
    const routeViaZeus = !isZeusTarget && !!zeusUrl

    let respostaTexto = ''

    // ── 6a. Via Zeus — todos os agentes não-Zeus passam por ele ──────────────
    if (routeViaZeus) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (zeusApiKey) headers['Authorization'] = zeusApiKey.startsWith('Bearer ') ? zeusApiKey : `Bearer ${zeusApiKey}`

      const res = await fetch(zeusUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: mensagem,
          history,
          agentContext: {
            nome:            agent.nome,
            funcao:          (agent as unknown as Record<string, unknown>).funcao ?? '',
            prompt_sistema:  systemPrompt,
            integracao_tipo: tipo,
          },
        }),
      })

      if (!res.ok) {
        const t = await res.text()
        respostaTexto = `Erro ao contatar Zeus (${res.status}): ${t.slice(0, 200)}`
      } else {
        const r = await res.json() as Record<string, unknown>
        respostaTexto = ((r.text ?? r.answer ?? r.output ?? r.response ?? '') as string) || JSON.stringify(r)
      }
    }

    // ── 6b. Flowise / webhook / custom (Zeus direto ou sem Zeus configurado) ──
    else if (tipo === 'flowise' || tipo === 'custom' || tipo === 'webhook' || (tipo === '' && url)) {
      if (!url) {
        respostaTexto = `${agent.nome} não tem URL de integração configurada.`
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (apiKey) headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
        const res = await fetch(url, {
          method: 'POST', headers,
          body: JSON.stringify({ question: mensagem, history }),
        })
        if (!res.ok) {
          const t = await res.text()
          respostaTexto = `Erro ao contatar ${agent.nome} (${res.status}): ${t.slice(0, 200)}`
        } else {
          const r = await res.json() as Record<string, unknown>
          respostaTexto = ((r.text ?? r.answer ?? r.output ?? r.response ?? '') as string) || JSON.stringify(r)
        }
      }
    }

    // ── 6c. Anthropic / Claude ────────────────────────────────────────────────
    else if (tipo === 'anthropic' || tipo === 'claude' || (tipo === '' && apiKey && !geminiKey)) {
      if (!apiKey) {
        respostaTexto = `Configure a API Key da Anthropic nas configurações de ${agent.nome}.`
      } else {
        const mdl = model || 'claude-haiku-4-5-20251001'
        const messages: HistMsg[] = [...history, { role: 'user', content: mensagem }]
        const body: Record<string, unknown> = { model: mdl, max_tokens: maxTokens, messages }
        if (systemPrompt) body.system = systemPrompt
        body.temperature = temperatura

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const t = await res.text()
          respostaTexto = `Erro na API Anthropic (${res.status}): ${t.slice(0, 200)}`
        } else {
          const r = await res.json() as { content?: { type: string; text: string }[] }
          respostaTexto = r.content?.find((c) => c.type === 'text')?.text ?? ''
        }
      }
    }

    // ── 6d. Gemini ────────────────────────────────────────────────────────────
    else if (tipo === 'gemini' || (tipo === '' && geminiKey)) {
      // Prioridade: key do agente → key da empresa
      let key   = geminiKey || apiKey
      let mdl   = model || 'gemini-1.5-flash'

      if (!key) {
        const companyKey = await getCompanyGeminiKey(sb, company_id)
        if (companyKey) {
          key = companyKey.key
          mdl = model || companyKey.modelo
        }
      }

      if (!key) {
        respostaTexto = `Configure a API Key do Gemini nas configurações de ${agent.nome} ou na aba IA & Modelos da empresa.`
      } else {
        const contents = [
          ...history.map((m) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: mensagem }] },
        ]
        const bodyG: Record<string, unknown> = {
          contents,
          generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens },
        }
        if (systemPrompt) bodyG.system_instruction = { parts: [{ text: systemPrompt }] }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyG) }
        )
        if (!res.ok) {
          const t = await res.text()
          respostaTexto = `Erro na API Gemini (${res.status}): ${t.slice(0, 200)}`
        } else {
          const r = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
          respostaTexto = r.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        }
      }
    }

    // ── 6e. OpenAI / GPT ──────────────────────────────────────────────────────
    else if (tipo === 'openai' || tipo === 'gpt') {
      if (!apiKey) {
        respostaTexto = `Configure a API Key da OpenAI nas configurações de ${agent.nome}.`
      } else {
        const mdl = model || 'gpt-4o-mini'
        const messages: { role: string; content: string }[] = []
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
        history.forEach((m) => messages.push({ role: m.role, content: m.content }))
        messages.push({ role: 'user', content: mensagem })

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: mdl, messages, temperature: temperatura, max_tokens: maxTokens }),
        })
        if (!res.ok) {
          const t = await res.text()
          respostaTexto = `Erro na API OpenAI (${res.status}): ${t.slice(0, 200)}`
        } else {
          const r = await res.json() as { choices?: { message?: { content?: string } }[] }
          respostaTexto = r.choices?.[0]?.message?.content ?? ''
        }
      }
    }

    // ── 6f. Sem integração — tenta Gemini da empresa como padrão ─────────────
    else {
      const companyKey = await getCompanyGeminiKey(sb, company_id)

      if (companyKey) {
        const mdl  = model || companyKey.modelo
        const sp   = systemPrompt || `Você é ${agent.nome}, assistente de IA. Responda em português brasileiro.`
        const contents = [
          ...history.map((m) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: mensagem }] },
        ]
        const bodyG: Record<string, unknown> = {
          contents,
          generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens },
          system_instruction: { parts: [{ text: sp }] },
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${companyKey.key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyG) }
        )
        if (!res.ok) {
          const t = await res.text()
          respostaTexto = `Erro na API Gemini (${res.status}): ${t.slice(0, 200)}`
        } else {
          const r = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
          respostaTexto = r.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        }
      } else {
        respostaTexto = `${agent.nome} ainda não tem integração configurada. Acesse Configurações → IA & Modelos e adicione a Gemini API Key da empresa, ou edite o agente e defina o Provedor e a API Key.`
      }
    }

    // ── 7. Inserir resposta ───────────────────────────────────────────────────
    const { error: insertErr } = await sb.from('ia_mensagens').insert({
      conversa_id, company_id,
      remetente_tipo: 'ia',
      remetente_nome: agent.nome,
      conteudo:       respostaTexto || '…',
      conteudo_tipo:  'text',
      metadados:      { tipo_integracao: tipo || 'auto', via_zeus: routeViaZeus },
      tokens_prompt:  0,
      tokens_resposta: 0,
    })
    if (insertErr) return json({ error: `Falha ao salvar resposta: ${insertErr.message}` }, 500)

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
