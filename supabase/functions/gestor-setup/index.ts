/**
 * gestor-setup — Cria a conta do gestor no Supabase Auth (execução única)
 *
 * Configure antes de chamar:
 *   Supabase Dashboard → Settings → Edge Functions → Secrets:
 *     GESTOR_SETUP_TOKEN  = qualquer string secreta que só você sabe
 *     GESTOR_PASSWORD     = senha do gestor (ex: Natanael.086420)
 *
 * Chame UMA VEZ via curl ou Supabase Dashboard:
 *   curl -X POST https://<ref>.supabase.co/functions/v1/gestor-setup \
 *     -H "Content-Type: application/json" \
 *     -d '{"token":"<GESTOR_SETUP_TOKEN>"}'
 *
 * Após criação bem-sucedida, esta função rejeita novas chamadas (gestor já existe).
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const GESTOR_EMAIL    = '00000@escritorio.zita.ai'
const GESTOR_COMPANY  = '00000000-0000-0000-0000-000000000001' // empresa 'sistema'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { token } = await req.json() as { token?: string }

    // Valida token de setup (proteção simples contra chamadas acidentais)
    const setupToken = Deno.env.get('GESTOR_SETUP_TOKEN')
    if (!setupToken || token !== setupToken) {
      return json({ error: 'Token de setup inválido.' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verifica se gestor já existe
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'gestor')
      .maybeSingle()

    if (existing) {
      return json({ error: 'Gestor já existe. Esta função só pode ser executada uma vez.' }, 409)
    }

    // Lê a senha do Secret (nunca hardcoded em código)
    const password = Deno.env.get('GESTOR_PASSWORD')
    if (!password) {
      return json({ error: 'GESTOR_PASSWORD não configurado nos Secrets.' }, 500)
    }

    // Cria usuário no Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:             GESTOR_EMAIL,
      password,
      email_confirm:     true,
      user_metadata:     { nome: 'Gestor ZITA', role: 'gestor' },
    })

    if (authErr || !authData.user) {
      return json({ error: `Erro ao criar usuário: ${authErr?.message}` }, 500)
    }

    // Cria profile do gestor
    const { error: profileErr } = await supabase
      .from('profiles')
      .insert({
        id:         authData.user.id,
        company_id: GESTOR_COMPANY,
        nome:       'Gestor ZITA',
        email:      GESTOR_EMAIL,
        role:       'gestor',
        ativo:      true,
      })

    if (profileErr) {
      // Rollback: remove o auth user criado
      await supabase.auth.admin.deleteUser(authData.user.id)
      return json({ error: `Erro ao criar perfil: ${profileErr.message}` }, 500)
    }

    return json({
      ok:      true,
      message: 'Gestor criado com sucesso. Login: 00000',
      user_id: authData.user.id,
    })

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
