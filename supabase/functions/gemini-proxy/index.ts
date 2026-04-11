/**
 * gemini-proxy — Proxy server-side para chamadas à API do Gemini
 *
 * A chave da API NUNCA é exposta ao cliente.
 * O owner configura via Supabase Secrets com o padrão:
 *   GEMINI_KEY_<SLUG_DA_EMPRESA>  (ex: GEMINI_KEY_MINHA_EMPRESA)
 *   GEMINI_KEY                    (fallback global)
 *
 * O cliente envia o JWT de sessão e os prompts.
 * Este serviço valida o JWT, descobre a empresa, busca a chave e chama o Gemini.
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
    // ── 1. Valida JWT ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token      = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token de autenticação não fornecido' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Busca empresa do usuário ────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Perfil sem empresa associada' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('slug')
      .eq('id', profile.company_id)
      .single()

    if (!company?.slug) {
      return new Response(JSON.stringify({ error: 'Empresa não encontrada' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Busca a chave nos Secrets ───────────────────────────────────────────
    // Padrão: GEMINI_KEY_MINHA_EMPRESA (slug em maiúsculas, hífens → underscores)
    const secretName = `GEMINI_KEY_${company.slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    const apiKey     = Deno.env.get(secretName) ?? Deno.env.get('GEMINI_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:  `Chave Gemini não configurada para "${company.slug}".`,
          hint:   `Adicione o secret "${secretName}" (ou "GEMINI_KEY" como fallback) nas configurações do Supabase Edge Functions.`,
        }),
        { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── 4. Lê o payload ────────────────────────────────────────────────────────
    const {
      system_prompt,
      user_message,
      temperature  = 0.7,
      max_tokens   = 2000,
    } = await req.json()

    if (!system_prompt || !user_message) {
      return new Response(JSON.stringify({ error: 'system_prompt e user_message são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Chama o Gemini (server-side, chave nunca exposta ao cliente) ────────
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system_prompt }] },
          contents:           [{ role: 'user', parts: [{ text: user_message }] }],
          generationConfig: {
            temperature,
            maxOutputTokens:  max_tokens,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(25_000),
      }
    )

    if (!geminiResp.ok) {
      const txt = await geminiResp.text()
      throw new Error(`Gemini ${geminiResp.status}: ${txt.slice(0, 300)}`)
    }

    const geminiData = await geminiResp.json()
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'

    return new Response(
      JSON.stringify({ text }),
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
