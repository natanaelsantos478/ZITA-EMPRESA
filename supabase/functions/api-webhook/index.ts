/**
 * api-webhook — Receptor universal de webhooks inbound
 *
 * Qualquer sistema externo (WhatsApp, Stripe, Calendly, n8n, etc.) pode
 * chamar este endpoint para enviar eventos a um agente específico.
 *
 * URL: POST /functions/v1/api-webhook?agent_id=<uuid>&company_id=<uuid>&source=<nome>
 * Headers opcionais: x-agent-id, x-company-id, x-source
 *
 * A função apenas insere a ação na fila e retorna 200 imediatamente.
 * O processamento acontece de forma assíncrona pelo browser (useEcosystem)
 * ou pelo zeus-scheduler (pg_cron a cada 2 min).
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-id, x-company-id, x-source, x-priority',
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use POST.' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ── Parâmetros de roteamento ─────────────────────────────────────────────
    const url       = new URL(req.url)
    const agentId   = url.searchParams.get('agent_id')   ?? req.headers.get('x-agent-id')
    const companyId = url.searchParams.get('company_id') ?? req.headers.get('x-company-id')
    const source    = url.searchParams.get('source')     ?? req.headers.get('x-source') ?? 'webhook'
    const priority  = url.searchParams.get('priority')   ?? req.headers.get('x-priority') ?? 'normal'

    if (!agentId || !companyId) {
      return new Response(
        JSON.stringify({ error: 'agent_id e company_id são obrigatórios (query param ou header)' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Lê o payload do corpo ─────────────────────────────────────────────────
    let payload: Record<string, unknown> = {}
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      payload = await req.json().catch(() => ({}))
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const text   = await req.text()
      const params = new URLSearchParams(text)
      params.forEach((v, k) => { payload[k] = v })
    }

    // ── Cria a ação na fila ───────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase
      .from('ia_acoes')
      .insert({
        company_id:    companyId,
        de_agent_id:   null,
        para_agent_id: agentId,
        tipo:          'comando',
        prioridade:    ['baixa', 'normal', 'alta', 'urgente'].includes(priority) ? priority : 'normal',
        payload: {
          source,
          ...payload,
          _webhook_received_at: new Date().toISOString(),
        },
        executar_apos: new Date().toISOString(),
        expira_em:     new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)

    return new Response(
      JSON.stringify({ ok: true, acao_id: data.id, agent_id: agentId, source }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
