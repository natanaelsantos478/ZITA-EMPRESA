/**
 * ia-dispatcher — Recebe mensagens do chat e despacha para o backend de IA configurado
 *
 * Chamado por useChat.ts quando o usuário envia uma mensagem.
 * Body: { conversa_id, agent_id, mensagem, company_id }
 *
 * Suporta:
 *  - flowise: POST direto para integracao_url com { question, history }
 *  - Outros: resposta de fallback informando que a integração não está configurada
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      conversa_id: string
      agent_id:    string
      mensagem:    string
      company_id:  string
    }

    if (!conversa_id || !agent_id || !mensagem || !company_id) {
      return json({ error: 'conversa_id, agent_id, mensagem e company_id são obrigatórios.' }, 400)
    }

    // ── 3. Buscar agente (service_role bypassa RLS) ───────────────────────────
    const { data: agent, error: agentErr } = await sb
      .from('ia_agents')
      .select('id, nome, integracao_tipo, integracao_url, integracao_config')
      .eq('id', agent_id)
      .single()

    if (agentErr || !agent) {
      return json({ error: 'Agente não encontrado.' }, 404)
    }

    // ── 4. Buscar histórico das últimas mensagens ─────────────────────────────
    const { data: historico } = await sb
      .from('ia_mensagens')
      .select('remetente_tipo, conteudo')
      .eq('conversa_id', conversa_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Converte para formato Flowise (mais recentes por último, excluindo a mensagem atual)
    const history = (historico ?? [])
      .reverse()
      .filter((m: { remetente_tipo: string; conteudo: string }) => m.conteudo !== mensagem)
      .map((m: { remetente_tipo: string; conteudo: string }) => ({
        role:    m.remetente_tipo === 'humano' ? 'user' : 'assistant',
        content: m.conteudo,
      }))

    // ── 5. Chamar backend de IA ───────────────────────────────────────────────
    const config   = (agent.integracao_config ?? {}) as Record<string, unknown>
    const apiKey   = (config.api_key ?? '') as string
    const tipo     = (agent.integracao_tipo ?? 'flowise') as string
    const url      = (agent.integracao_url ?? '') as string

    let respostaTexto = ''

    if (!url) {
      respostaTexto = `${agent.nome} ainda não tem uma URL de integração configurada. Configure em Configurações → IAs → editar agente → URL da Integração.`
    } else if (tipo === 'flowise' || tipo === 'custom' || tipo === 'webhook') {
      // Chama o endpoint Flowise (ou webhook customizado) diretamente
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) {
        headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
      }

      const flowiseRes = await fetch(url, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ question: mensagem, history }),
      })

      if (!flowiseRes.ok) {
        const errText = await flowiseRes.text()
        respostaTexto = `Erro ao contatar ${agent.nome}: ${flowiseRes.status} — ${errText.slice(0, 200)}`
      } else {
        const result = await flowiseRes.json() as Record<string, unknown>
        respostaTexto = (result.text ?? result.answer ?? result.output ?? result.response ?? '') as string

        if (!respostaTexto && typeof result === 'string') {
          respostaTexto = result
        }
        if (!respostaTexto) {
          respostaTexto = JSON.stringify(result)
        }
      }
    } else {
      respostaTexto = `Integração do tipo "${tipo}" ainda não é suportada no dispatcher. Aguarde atualizações.`
    }

    // ── 6. Inserir resposta da IA na conversa (service_role — bypassa RLS) ────
    const { error: insertErr } = await sb.from('ia_mensagens').insert({
      conversa_id,
      company_id,
      remetente_tipo: 'ia',
      remetente_nome: agent.nome,
      conteudo:       respostaTexto,
      conteudo_tipo:  'text',
      metadados:      { tipo_integracao: tipo, url_usada: url ? url.slice(0, 80) : null },
      tokens_prompt:  0,
      tokens_resposta: 0,
    })

    if (insertErr) {
      return json({ error: `Falha ao salvar resposta: ${insertErr.message}` }, 500)
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
