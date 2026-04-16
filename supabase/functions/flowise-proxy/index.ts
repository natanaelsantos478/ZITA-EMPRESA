/**
 * flowise-proxy — Proxy server-side para chamadas ao Flowise
 *
 * O cliente NUNCA vê a URL do Flowise nem a API key.
 * Fluxo:
 *   Browser → JWT → flowise-proxy (Edge Function)
 *     → busca ACK code da empresa (via service_role, invisível ao cliente)
 *     → lê FLOWISE_URL_<ACK> e FLOWISE_KEY_<ACK> dos Supabase Secrets
 *     → chama Flowise server-side
 *     → retorna apenas { text }
 *
 * Configure no Supabase Secrets:
 *   FLOWISE_URL_ACK00001  = https://seu-flowise.com
 *   FLOWISE_KEY_ACK00001  = Bearer <token> (opcional, se o Flowise exigir autenticação)
 *   FLOWISE_CHATFLOW_ACK00001 = <uuid do chatflow>
 *
 *   FLOWISE_URL           = fallback global (opcional)
 *   FLOWISE_KEY           = fallback global (opcional)
 *   FLOWISE_CHATFLOW      = fallback global (opcional)
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
    // ── 1. Valida JWT ─────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Token de autenticação não fornecido.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Token inválido ou expirado.' }, 401)

    // ── 2. Busca empresa e ACK code (nunca sai do servidor) ───────────────────
    const { data: profile } = await sb
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return json({ error: 'Perfil sem empresa.' }, 403)

    // Service role bypassa a restrição de coluna no ack_code
    const { data: company } = await sb
      .from('companies')
      .select('ack_code, slug')
      .eq('id', profile.company_id)
      .single()

    if (!company) return json({ error: 'Empresa não encontrada.' }, 403)

    // ── 3. Resolve configurações do Flowise via Secrets ───────────────────────
    const ackKey = company.ack_code
      ? company.ack_code.toUpperCase().replace(/[^A-Z0-9]/g, '_')
      : company.slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')

    const flowiseUrl      = Deno.env.get(`FLOWISE_URL_${ackKey}`)      ?? Deno.env.get('FLOWISE_URL')
    const flowiseKey      = Deno.env.get(`FLOWISE_KEY_${ackKey}`)      ?? Deno.env.get('FLOWISE_KEY')
    const flowiseChatflow = Deno.env.get(`FLOWISE_CHATFLOW_${ackKey}`) ?? Deno.env.get('FLOWISE_CHATFLOW')

    if (!flowiseUrl || !flowiseChatflow) {
      return json({
        error: `Flowise não configurado para esta empresa (${company.ack_code ?? company.slug}). Configure FLOWISE_URL_${ackKey} e FLOWISE_CHATFLOW_${ackKey} nos Secrets.`,
      }, 503)
    }

    // ── 4. Lê payload do cliente ──────────────────────────────────────────────
    const { question, history, overrideConfig } = await req.json() as {
      question:        string
      history?:        { role: string; content: string }[]
      overrideConfig?: Record<string, unknown>
    }

    if (!question?.trim()) return json({ error: 'Campo "question" obrigatório.' }, 400)

    // ── 5. Chama o Flowise server-side ────────────────────────────────────────
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (flowiseKey) headers['Authorization'] = flowiseKey.startsWith('Bearer ') ? flowiseKey : `Bearer ${flowiseKey}`

    const flowiseRes = await fetch(
      `${flowiseUrl.replace(/\/$/, '')}/api/v1/prediction/${flowiseChatflow}`,
      {
        method:  'POST',
        headers,
        body:    JSON.stringify({ question, history: history ?? [], overrideConfig }),
      }
    )

    if (!flowiseRes.ok) {
      const errText = await flowiseRes.text()
      return json({ error: `Flowise retornou ${flowiseRes.status}: ${errText}` }, 502)
    }

    const result = await flowiseRes.json() as Record<string, unknown>
    const text   = (result.text ?? result.answer ?? result.output ?? '') as string

    return json({ text, raw: result })

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
