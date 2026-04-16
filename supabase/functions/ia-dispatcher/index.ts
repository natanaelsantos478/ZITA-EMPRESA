/**
 * ia-dispatcher — Roteia mensagens do chat para o backend de IA do agente
 *
 * Body: { conversa_id, agent_id, mensagem, company_id }
 *
 * Integração por integracao_tipo:
 *  - flowise / custom / webhook → POST direto para integracao_url
 *  - anthropic / claude         → Claude API (api.anthropic.com)
 *  - openai / gpt               → OpenAI Chat API
 *  - gemini                     → Gemini API (generativelanguage.googleapis.com)
 *  - null / não configurado     → tenta anthropic se tiver api_key, gemini se tiver gemini_api_key
 *
 * API keys: integracao_config.api_key (anthropic/openai) ou integracao_config.gemini_api_key
 * System prompt: personalidade.prompt_sistema
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

type HistMsg = { role: 'user' | 'assistant'; content: string }

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

    // ── 3. Buscar agente ──────────────────────────────────────────────────────
    const { data: agent, error: agentErr } = await sb
      .from('ia_agents')
      .select('id, nome, integracao_tipo, integracao_url, integracao_config, personalidade')
      .eq('id', agent_id)
      .single()
    if (agentErr || !agent) return json({ error: 'Agente não encontrado.' }, 404)

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

    // ── 5. Extrair configuração ───────────────────────────────────────────────
    const config      = (agent.integracao_config ?? {}) as Record<string, unknown>
    const personalidade = (agent.personalidade   ?? {}) as Record<string, unknown>
    const apiKey      = (config.api_key          ?? '') as string
    const geminiKey   = (config.gemini_api_key   ?? '') as string
    const tipo        = (agent.integracao_tipo   ?? '') as string
    const url         = (agent.integracao_url    ?? '') as string
    const systemPrompt = (personalidade.prompt_sistema ?? '') as string
    const temperatura  = (personalidade.temperatura    ?? 0.7) as number
    const maxTokens    = (personalidade.max_tokens      ?? 1024) as number

    let respostaTexto = ''

    // ── 6. Rotear por tipo ────────────────────────────────────────────────────

    // ── 6a. Flowise / webhook / custom ────────────────────────────────────────
    if (tipo === 'flowise' || tipo === 'custom' || tipo === 'webhook' || (tipo === '' && url)) {
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

    // ── 6b. Anthropic / Claude ────────────────────────────────────────────────
    else if (tipo === 'anthropic' || tipo === 'claude' || (tipo === '' && apiKey && !geminiKey)) {
      if (!apiKey) {
        respostaTexto = `Configure a API Key da Anthropic nas configurações de ${agent.nome}.`
      } else {
        const model = (config.model ?? 'claude-haiku-4-5-20251001') as string
        const messages: HistMsg[] = [...history, { role: 'user', content: mensagem }]
        const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages }
        if (systemPrompt) body.system = systemPrompt
        if (temperatura !== undefined) body.temperature = temperatura

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

    // ── 6c. Gemini ────────────────────────────────────────────────────────────
    else if (tipo === 'gemini' || (tipo === '' && geminiKey)) {
      const key = geminiKey || apiKey
      if (!key) {
        respostaTexto = `Configure a API Key do Gemini nas configurações de ${agent.nome}.`
      } else {
        const model = (config.model ?? 'gemini-1.5-flash') as string
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
        if (systemPrompt) {
          bodyG.system_instruction = { parts: [{ text: systemPrompt }] }
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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

    // ── 6d. OpenAI / GPT ──────────────────────────────────────────────────────
    else if (tipo === 'openai' || tipo === 'gpt') {
      if (!apiKey) {
        respostaTexto = `Configure a API Key da OpenAI nas configurações de ${agent.nome}.`
      } else {
        const model = (config.model ?? 'gpt-4o-mini') as string
        const messages: { role: string; content: string }[] = []
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
        history.forEach((m) => messages.push({ role: m.role, content: m.content }))
        messages.push({ role: 'user', content: mensagem })

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature: temperatura, max_tokens: maxTokens }),
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

    // ── 6e. Não configurado ───────────────────────────────────────────────────
    else {
      respostaTexto = `${agent.nome} ainda não tem integração configurada. Acesse Configurações → IAs → edite o agente e defina o Tipo de Integração e a API Key.`
    }

    // ── 7. Inserir resposta ───────────────────────────────────────────────────
    const { error: insertErr } = await sb.from('ia_mensagens').insert({
      conversa_id, company_id,
      remetente_tipo: 'ia',
      remetente_nome: agent.nome,
      conteudo:       respostaTexto || '…',
      conteudo_tipo:  'text',
      metadados:      { tipo_integracao: tipo || 'auto' },
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
