/**
 * zeus-webhook — Cloudflare Worker
 *
 * Fluxo:
 *  1. Recebe POST { question, api_key }
 *  2. Valida api_key no Supabase (tabela zita_ai_office_config)
 *  3. Monta contexto da empresa
 *  4. Chama Zeus no Flowise
 *  5. Retorna resposta
 */

export interface Env {
  SUPABASE_URL: string         // ex: https://tgeomsnxfcqwrxijjvek.supabase.co
  SUPABASE_ANON_KEY: string    // anon key do projeto Supabase
  FLOWISE_URL: string          // ex: https://celebrated-optimism-production-12cf.up.railway.app
  FLOWISE_CHATFLOW_ID: string  // UUID do chatflow do Zeus no Flowise
}

// ─── CORS helpers ────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function corsResponse(body: string, status: number, extra?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(extra ?? {}),
    },
  })
}

function err(message: string, status = 400): Response {
  return corsResponse(JSON.stringify({ error: message }), status)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'POST') {
      return err('Método não permitido. Use POST.', 405)
    }

    // ── 1. Parse body ─────────────────────────────────────────────────────────
    let body: { question?: unknown; api_key?: unknown }
    try {
      body = await request.json()
    } catch {
      return err('Body inválido. Esperado JSON com { question, api_key }.')
    }

    const { question, api_key } = body

    if (!question || typeof question !== 'string' || question.trim() === '') {
      return err('Campo "question" é obrigatório e deve ser uma string não vazia.')
    }
    if (!api_key || typeof api_key !== 'string' || api_key.trim() === '') {
      return err('Campo "api_key" é obrigatório.', 401)
    }

    // ── 2. Buscar config da empresa no Supabase ────────────────────────────────
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '')

    const configRes = await fetch(
      `${supabaseUrl}/rest/v1/zita_ai_office_config?ai_office_api_key=eq.${encodeURIComponent(api_key.trim())}&limit=1&select=*`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!configRes.ok) {
      console.error('[Supabase] Falha na consulta:', configRes.status, await configRes.text())
      return err('Erro ao consultar configuração.', 502)
    }

    const configs: unknown[] = await configRes.json()

    if (!Array.isArray(configs) || configs.length === 0) {
      return err('API key inválida ou empresa não encontrada.', 401)
    }

    const config = configs[0] as {
      nome_empresa?: string
      nome_gestor?: string
      tenant_id?: string
      modulos_ativos?: string | string[]
      nivel_autonomia?: string | number
      prioridades?: string
    }

    // ── 3. Montar contexto da empresa ─────────────────────────────────────────
    const modulosAtivos = Array.isArray(config.modulos_ativos)
      ? config.modulos_ativos.join(', ')
      : (config.modulos_ativos ?? '')

    const context = `
Empresa: ${config.nome_empresa ?? ''}
Gestor: ${config.nome_gestor ?? ''}
Tenant ID: ${config.tenant_id ?? ''}
Módulos ativos: ${modulosAtivos}
Nível de autonomia: ${config.nivel_autonomia ?? ''}
Prioridades: ${config.prioridades ?? ''}
`.trim()

    // ── 4. Chamar Zeus no Flowise ──────────────────────────────────────────────
    const flowiseBase = env.FLOWISE_URL.replace(/\/$/, '')
    const flowiseEndpoint = `${flowiseBase}/api/v1/prediction/${env.FLOWISE_CHATFLOW_ID}`

    const flowiseRes = await fetch(flowiseEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question.trim(),
        overrideConfig: {
          promptValues: { context },
        },
      }),
    })

    if (!flowiseRes.ok) {
      const detail = await flowiseRes.text()
      console.error('[Flowise] Erro na chamada:', flowiseRes.status, detail)
      return err(`Zeus indisponível (${flowiseRes.status}). Tente novamente.`, 502)
    }

    const flowiseData = await flowiseRes.json() as { text?: string; answer?: string; [k: string]: unknown }

    // Flowise pode retornar { text } ou { answer } dependendo da versão
    const answer = flowiseData.text ?? flowiseData.answer ?? JSON.stringify(flowiseData)

    // ── 5. Retornar resposta ───────────────────────────────────────────────────
    return corsResponse(
      JSON.stringify({
        success: true,
        answer,
        empresa: config.nome_empresa ?? null,
        tenant_id: config.tenant_id ?? null,
      }),
      200
    )
  },
}
