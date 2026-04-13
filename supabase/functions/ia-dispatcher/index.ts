import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// ──────────────────────────────────────────────────────────
// ia-dispatcher — Recebe mensagem do chat da plataforma e
// despacha para o backend de IA configurado no agente.
//
// Chamado por useChat.ts via supabase.functions.invoke()
// Body: { conversa_id, agent_id, mensagem, company_id }
//
// A resposta é inserida em ia_mensagens, o que dispara o
// listener Realtime no frontend e atualiza o chat.
// ──────────────────────────────────────────────────────────

// Headers CORS exigidos pelo Supabase JS SDK (envia apikey e x-client-info)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // ── 1. Autenticar via JWT do usuário ───────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Token de autenticação não fornecido.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Token inválido ou expirado.' }, 401)

    // ── 2. Ler payload ─────────────────────────────────────
    const { conversa_id, agent_id, mensagem, company_id } = await req.json() as {
      conversa_id: string
      agent_id: string
      mensagem: string
      company_id: string
    }

    if (!conversa_id || !agent_id || !mensagem || !company_id) {
      return json({ error: 'conversa_id, agent_id, mensagem e company_id são obrigatórios.' }, 400)
    }

    // ── 3. Buscar configuração do agente ───────────────────
    const { data: agent, error: agentErr } = await sb
      .from('ia_agents')
      .select('id, nome, integracao_tipo, integracao_url, integracao_config')
      .eq('id', agent_id)
      .single()

    if (agentErr || !agent) return json({ error: 'Agente não encontrado.' }, 404)

    // ── 4. Histórico das últimas mensagens (contexto) ──────
    const { data: historico } = await sb
      .from('ia_mensagens')
      .select('remetente_tipo, conteudo')
      .eq('conversa_id', conversa_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const history = ((historico ?? []) as { remetente_tipo: string; conteudo: string }[])
      .reverse()
      .filter((m) => m.conteudo !== mensagem)
      .map((m) => ({
        role: m.remetente_tipo === 'humano' ? 'user' : 'assistant',
        content: m.conteudo,
      }))

    // ── 5. Chamar o Flowise do agente ──────────────────────
    const config = (agent.integracao_config ?? {}) as Record<string, unknown>
    const tipo   = (agent.integracao_tipo ?? 'flowise') as string
    const baseUrl = ((agent.integracao_url ?? '') as string).replace(/\/$/, '')
    const chatflowId = (config.chatflow_id ?? config.chatflowid ?? '') as string
    const apiKey = (config.api_key ?? '') as string

    let respostaTexto = ''

    if (!baseUrl) {
      respostaTexto = `${agent.nome} ainda não tem uma URL de integração configurada. Configure em Configurações → IAs → editar agente.`
    } else if (tipo === 'flowise') {
      // Constrói URL completa: base + /api/v1/prediction/{chatflowId}
      if (!chatflowId) {
        respostaTexto = `${agent.nome} não tem chatflow_id configurado em integracao_config.`
      } else {
        const endpoint = `${baseUrl}/api/v1/prediction/${chatflowId}`
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const flowRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            question: mensagem,
            history,
            overrideConfig: { sessionId: conversa_id },
          }),
        })

        if (!flowRes.ok) {
          const errText = await flowRes.text()
          respostaTexto = `Erro ao contatar ${agent.nome}: ${flowRes.status} — ${errText.slice(0, 200)}`
        } else {
          const result = await flowRes.json() as Record<string, unknown>
          respostaTexto = (
            (result.text ?? result.answer ?? result.output ?? result.response ?? '') as string
          )
          if (!respostaTexto && typeof result === 'string') respostaTexto = result as string
          if (!respostaTexto) respostaTexto = JSON.stringify(result)
        }
      }
    } else if (tipo === 'custom' || tipo === 'webhook') {
      // Webhook customizado — chama a URL direto
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      const webhookRes = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: mensagem, history }),
      })

      if (!webhookRes.ok) {
        respostaTexto = `Erro ${webhookRes.status} ao contatar ${agent.nome}.`
      } else {
        const result = await webhookRes.json() as Record<string, unknown>
        respostaTexto = (result.text ?? result.answer ?? result.output ?? '') as string
        if (!respostaTexto) respostaTexto = JSON.stringify(result)
      }
    } else {
      respostaTexto = `Integração do tipo "${tipo}" ainda não é suportada. Suportados: flowise, webhook, custom.`
    }

    // ── 6. Inserir resposta no banco (Realtime notifica o frontend) ──
    const { error: insertErr } = await sb.from('ia_mensagens').insert({
      conversa_id,
      company_id,
      remetente_tipo:  'ia',
      remetente_id:    agent.id,
      remetente_nome:  agent.nome,
      conteudo:        respostaTexto,
      conteudo_tipo:   'texto',           // valor válido no CHECK da tabela
      metadados:       { tipo_integracao: tipo, agent_id },
      tokens_prompt:   0,
      tokens_resposta: 0,
    })

    if (insertErr) {
      console.error('Erro ao salvar resposta:', insertErr.message)
      return json({ error: `Falha ao salvar resposta: ${insertErr.message}` }, 500)
    }

    return json({ ok: true })

  } catch (err) {
    console.error('ia-dispatcher erro inesperado:', err)
    return json({ error: String(err) }, 500)
  }
})
