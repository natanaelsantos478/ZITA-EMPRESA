/**
 * company-settings — Gerencia configurações da empresa, incluindo a Gemini API Key
 *
 * A key é criptografada com AES-256-GCM antes de persistir no banco.
 * O frontend NUNCA recebe o valor da key — apenas true/false (gemini_configurado).
 *
 * Endpoints:
 *  GET  → { id, nome, gemini_configurado, gemini_modelo }
 *  POST { action: 'save_gemini_key', api_key, modelo? } → { ok: true }
 *  POST { action: 'test_gemini_key' }                  → { ok, modelo?, erro? }
 *  POST { action: 'remove_gemini_key' }                → { ok: true }
 *  POST { action: 'save_modelo', modelo }              → { ok: true }
 *
 * Variável de ambiente obrigatória: ENCRYPTION_KEY
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ── AES-256-GCM via Web Crypto ────────────────────────────────────────────────
// Deriva uma chave de 256 bits a partir da ENCRYPTION_KEY usando SHA-256.
// Nunca loga nem retorna a key descriptografada ao frontend.

async function importKey(keyStr: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encrypt(text: string, keyStr: string): Promise<string> {
  const key = await importKey(keyStr)
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  const buf = new Uint8Array(12 + ct.byteLength)
  buf.set(iv, 0)
  buf.set(new Uint8Array(ct), 12)
  return btoa(String.fromCharCode(...buf))
}

async function decrypt(encrypted: string, keyStr: string): Promise<string> {
  const key = await importKey(keyStr)
  const buf = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(pt)
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // ── Autenticação JWT ──────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Token não fornecido.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Token inválido ou expirado.' }, 401)

    // ── Perfil e empresa ──────────────────────────────────────────────────────
    const { data: profile } = await sb
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return json({ error: 'Perfil sem empresa associada.' }, 403)

    const { company_id, role } = profile as { company_id: string; role: string }
    const isAdmin = role === 'owner' || role === 'admin'
    const ENC_KEY = Deno.env.get('ENCRYPTION_KEY') ?? ''

    // ── GET: retorna dados da empresa SEM a key ───────────────────────────────
    if (req.method === 'GET') {
      const { data: company, error: cErr } = await sb
        .from('companies')
        .select('id, nome, slug, gemini_modelo, gemini_api_key_enc')
        .eq('id', company_id)
        .single()

      if (cErr || !company) return json({ error: 'Empresa não encontrada.' }, 404)

      const { gemini_api_key_enc, ...safe } = company as Record<string, unknown>
      return json({ ...safe, gemini_configurado: !!gemini_api_key_enc })
    }

    // ── POST: ações ───────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json() as { action?: string; api_key?: string; modelo?: string }
      const { action } = body

      // save_gemini_key — criptografa e persiste
      if (action === 'save_gemini_key') {
        if (!isAdmin) return json({ error: 'Apenas admin ou owner pode salvar a API Key.' }, 403)
        if (!body.api_key?.trim()) return json({ error: 'api_key é obrigatório.' }, 400)
        if (!ENC_KEY) return json({ error: 'ENCRYPTION_KEY não configurada no servidor. Contate o administrador.' }, 500)

        const encrypted  = await encrypt(body.api_key.trim(), ENC_KEY)
        const updates: Record<string, unknown> = { gemini_api_key_enc: encrypted }
        if (body.modelo) updates.gemini_modelo = body.modelo

        const { error } = await sb.from('companies').update(updates).eq('id', company_id)
        if (error) return json({ error: error.message }, 500)

        return json({ ok: true, gemini_configurado: true })
      }

      // test_gemini_key — descriptografa internamente e testa sem expor a key
      if (action === 'test_gemini_key') {
        if (!ENC_KEY) return json({ ok: false, erro: 'ENCRYPTION_KEY não configurada.' })

        const { data: company } = await sb
          .from('companies')
          .select('gemini_api_key_enc, gemini_modelo')
          .eq('id', company_id)
          .single()

        if (!(company as Record<string, unknown>)?.gemini_api_key_enc) {
          return json({ ok: false, erro: 'Nenhuma API Key configurada para esta empresa.' })
        }

        const apiKey = await decrypt(
          (company as Record<string, unknown>).gemini_api_key_enc as string,
          ENC_KEY,
        )
        const modelo = ((company as Record<string, unknown>).gemini_modelo as string) || 'gemini-2.0-flash'

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
              generationConfig: { maxOutputTokens: 10 },
            }),
          },
        )

        if (!res.ok) {
          const t = await res.text()
          return json({ ok: false, erro: `Gemini ${res.status}: ${t.slice(0, 120)}` })
        }

        const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const resposta = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        return json({ ok: true, modelo, resposta })
      }

      // remove_gemini_key
      if (action === 'remove_gemini_key') {
        if (!isAdmin) return json({ error: 'Apenas admin ou owner pode remover a API Key.' }, 403)

        const { error } = await sb
          .from('companies')
          .update({ gemini_api_key_enc: null })
          .eq('id', company_id)

        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // save_modelo — atualiza apenas o modelo
      if (action === 'save_modelo') {
        if (!isAdmin) return json({ error: 'Apenas admin ou owner pode alterar o modelo.' }, 403)
        if (!body.modelo?.trim()) return json({ error: 'modelo é obrigatório.' }, 400)

        const { error } = await sb
          .from('companies')
          .update({ gemini_modelo: body.modelo.trim() })
          .eq('id', company_id)

        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      return json({ error: `Ação desconhecida: ${action}` }, 400)
    }

    return json({ error: 'Método não suportado.' }, 405)

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
