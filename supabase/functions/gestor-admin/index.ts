/**
 * gestor-admin — API privada do gestor para gerenciar todo o sistema
 *
 * Endpoints (corpo JSON com campo "action"):
 *
 *  Empresas:
 *    { action: "list_companies" }
 *    { action: "create_company",  data: { nome, slug, plano?, ack_code? } }
 *    { action: "update_company",  id, data: { nome?, slug?, plano?, ack_code?, status? } }
 *    { action: "delete_company",  id }
 *
 *  Usuários:
 *    { action: "list_users",   company_id? }
 *    { action: "create_user",  data: { email, password, nome, company_id, role } }
 *    { action: "update_user",  id, data: { nome?, role?, ativo?, company_id? } }
 *    { action: "reset_password", id, data: { password } }
 *    { action: "delete_user",  id }
 *
 *  IAs:
 *    { action: "list_agents",    company_id? }
 *    { action: "set_principal",  id, company_id }   ← define IA principal (Flowise 24/7)
 *    { action: "update_agent",   id, data: { ... } }
 *    { action: "delete_agent",   id }
 *
 * Segurança:
 *  - JWT obrigatório de um perfil com role = 'gestor'
 *  - Usa service_role internamente (bypassa RLS)
 *  - ack_code retornado SOMENTE para gestor, nunca para clientes normais
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
    if (!token) return json({ error: 'Não autorizado.' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Token inválido.' }, 401)

    // ── 2. Confirmar que é gestor ─────────────────────────────────────────────
    const { data: profile } = await sb
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'gestor') return json({ error: 'Acesso negado. Apenas gestores.' }, 403)

    // ── 3. Roteamento por action ──────────────────────────────────────────────
    const body = await req.json() as Record<string, unknown>
    const { action, id, data, company_id } = body as {
      action: string
      id?: string
      data?: Record<string, unknown>
      company_id?: string
    }

    switch (action) {

      // ── Empresas ──────────────────────────────────────────────────────────
      case 'list_companies': {
        const { data: rows, error } = await sb
          .from('companies')
          .select('id, nome, slug, ack_code, plano, status, logo_url, configuracoes, created_at, updated_at')
          .order('nome')
        if (error) return json({ error: error.message }, 500)
        return json({ companies: rows })
      }

      case 'create_company': {
        if (!data?.nome || !data?.slug) return json({ error: 'nome e slug obrigatórios.' }, 400)
        const { data: row, error } = await sb
          .from('companies')
          .insert({
            nome:  data.nome,
            slug:  (data.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            plano: data.plano ?? 'basico',
            ...(data.ack_code ? { ack_code: data.ack_code } : {}),
          })
          .select('id, nome, slug, ack_code, plano, status')
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ company: row })
      }

      case 'update_company': {
        if (!id) return json({ error: 'id obrigatório.' }, 400)
        const patch: Record<string, unknown> = {}
        if (data?.nome)     patch.nome     = data.nome
        if (data?.slug)     patch.slug     = (data.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-')
        if (data?.plano)    patch.plano    = data.plano
        if (data?.status)   patch.status   = data.status
        if (data?.ack_code !== undefined) patch.ack_code = data.ack_code || null
        const { data: row, error } = await sb
          .from('companies')
          .update(patch)
          .eq('id', id)
          .select('id, nome, slug, ack_code, plano, status')
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ company: row })
      }

      case 'delete_company': {
        if (!id) return json({ error: 'id obrigatório.' }, 400)
        const { error } = await sb.from('companies').delete().eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // ── Usuários ──────────────────────────────────────────────────────────
      case 'list_users': {
        let q = sb
          .from('profiles')
          .select('id, company_id, nome, email, role, ativo, ultimo_acesso_at, created_at, companies(nome, slug)')
          .order('created_at', { ascending: false })
        if (company_id) q = q.eq('company_id', company_id)
        const { data: rows, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ users: rows })
      }

      case 'create_user': {
        const d = data as { email: string; password: string; nome: string; company_id: string; role: string }
        if (!d?.email || !d?.password || !d?.nome || !d?.company_id || !d?.role) {
          return json({ error: 'email, password, nome, company_id e role são obrigatórios.' }, 400)
        }
        // Normaliza email: se não tiver @, usa domínio interno
        const email = d.email.includes('@') ? d.email : `${d.email}@escritorio.zita.ai`
        const { data: auth, error: authE } = await sb.auth.admin.createUser({
          email, password: d.password, email_confirm: true,
        })
        if (authE || !auth.user) return json({ error: authE?.message ?? 'Erro ao criar auth user.' }, 500)
        const { error: profileE } = await sb.from('profiles').insert({
          id: auth.user.id, company_id: d.company_id, nome: d.nome, email, role: d.role, ativo: true,
        })
        if (profileE) {
          await sb.auth.admin.deleteUser(auth.user.id)
          return json({ error: profileE.message }, 500)
        }
        return json({ ok: true, user_id: auth.user.id, email })
      }

      case 'update_user': {
        if (!id) return json({ error: 'id obrigatório.' }, 400)
        const patch: Record<string, unknown> = {}
        if (data?.nome)       patch.nome       = data.nome
        if (data?.role)       patch.role       = data.role
        if (data?.ativo !== undefined) patch.ativo = data.ativo
        if (data?.company_id) patch.company_id = data.company_id
        const { error } = await sb.from('profiles').update(patch).eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'reset_password': {
        if (!id || !data?.password) return json({ error: 'id e password obrigatórios.' }, 400)
        const { error } = await sb.auth.admin.updateUserById(id, { password: data.password as string })
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'delete_user': {
        if (!id) return json({ error: 'id obrigatório.' }, 400)
        await sb.from('profiles').delete().eq('id', id)
        const { error } = await sb.auth.admin.deleteUser(id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // ── IAs ───────────────────────────────────────────────────────────────
      case 'list_agents': {
        let q = sb
          .from('ia_agents')
          .select('id, company_id, nome, funcao, tipo, status, is_principal, integracao_tipo, integracao_url, cor_hex, created_at, companies(nome, slug)')
          .order('company_id')
          .order('nome')
        if (company_id) q = q.eq('company_id', company_id)
        const { data: rows, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ agents: rows })
      }

      case 'set_principal': {
        // Define a IA principal de uma empresa (conectada 24/7 ao Flowise)
        if (!id || !company_id) return json({ error: 'id e company_id obrigatórios.' }, 400)
        // Remove is_principal de todas as IAs da empresa
        await sb.from('ia_agents').update({ is_principal: false }).eq('company_id', company_id)
        // Define a IA selecionada como principal
        const { error } = await sb.from('ia_agents').update({ is_principal: true }).eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'update_agent': {
        if (!id) return json({ error: 'id obrigatório.' }, 400)
        const { error } = await sb.from('ia_agents').update(data ?? {}).eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'delete_agent': {
        if (!id) return json({ error: 'id obrigatório.' }, 400)
        const { error } = await sb.from('ia_agents').delete().eq('id', id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400)
    }

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
