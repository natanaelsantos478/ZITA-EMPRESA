/**
 * Painel do Gestor — acesso exclusivo para role 'gestor'
 *
 * Toda comunicação é via Edge Function 'gestor-admin' (service_role).
 * O ack_code NUNCA é buscado via Supabase client direto — apenas pela Edge Function.
 * O frontend exibe o ack_code mascarado e permite revelação temporária.
 */
import { useState, useEffect, useCallback } from 'react'
import { Building2, Users, Bot, Plus, Eye, EyeOff, Pencil, Trash2, Check, X, Star, RefreshCw, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?? 'https://fyearatapvhgyreifniq.supabase.co'

// ─── Tipos retornados pela gestor-admin Edge Function ────────────────────────
interface GestorCompany {
  id: string; nome: string; slug: string; ack_code: string | null
  plano: string; status: string; created_at: string
}
interface GestorUser {
  id: string; nome: string; email: string; role: string; ativo: boolean
  company_id: string; ultimo_acesso_at: string | null
  companies?: { nome: string; slug: string }
}
interface GestorAgent {
  id: string; nome: string; funcao: string | null; tipo: string; status: string
  is_principal: boolean; integracao_tipo: string | null; integracao_url: string | null
  company_id: string; cor_hex: string
  companies?: { nome: string; slug: string }
}

type Tab = 'empresas' | 'usuarios' | 'ias'

// ─── Hook: chama a gestor-admin Edge Function ─────────────────────────────────
function useGestorAPI() {
  const { getSessionToken } = useAuth()

  return useCallback(async (body: Record<string, unknown>) => {
    const token = await getSessionToken()
    if (!token) throw new Error('Sessão expirada')

    const res = await fetch(`${SUPABASE_URL}/functions/v1/gestor-admin`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    })
    const data = await res.json() as Record<string, unknown>
    if (!res.ok) throw new Error((data.error as string) ?? `Erro ${res.status}`)
    return data
  }, [getSessionToken])
}

// ─── Componente: Empresas ──────────────────────────────────────────────────────
function EmpresasTab({ api }: { api: ReturnType<typeof useGestorAPI> }) {
  const [companies,  setCompanies]  = useState<GestorCompany[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [showAck,    setShowAck]    = useState<Record<string, boolean>>({})
  const [form,       setForm]       = useState({ nome: '', slug: '', plano: 'basico', ack_code: '' })
  const [editForm,   setEditForm]   = useState<Partial<GestorCompany & { ack_code: string }>>({})
  const [adding,     setAdding]     = useState(false)
  const [erro,       setErro]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api({ action: 'list_companies' }) as { companies: GestorCompany[] }
      setCompanies(d.companies)
    } catch (e) { setErro(String(e)) }
    setLoading(false)
  }, [api])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    try {
      setErro('')
      await api({ action: 'create_company', data: { nome: form.nome, slug: form.slug, plano: form.plano, ack_code: form.ack_code || undefined } })
      setForm({ nome: '', slug: '', plano: 'basico', ack_code: '' })
      setAdding(false)
      load()
    } catch (e) { setErro(String(e)) }
  }

  const handleUpdate = async (id: string) => {
    try {
      setErro('')
      await api({ action: 'update_company', id, data: editForm })
      setEditId(null)
      load()
    } catch (e) { setErro(String(e)) }
  }

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir empresa "${nome}" e todos os seus dados?`)) return
    try { await api({ action: 'delete_company', id }); load() }
    catch (e) { setErro(String(e)) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {erro && <Erro msg={erro} onClose={() => setErro('')} />}

      {/* Botão adicionar */}
      <div className="flex justify-end">
        <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Nova Empresa
        </button>
      </div>

      {/* Formulário de nova empresa */}
      {adding && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Nova empresa</p>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className="input-field text-sm" />
            <input placeholder="Slug (ex: minha-empresa)" value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} className="input-field text-sm" />
            <select value={form.plano} onChange={e => setForm(p => ({ ...p, plano: e.target.value }))} className="input-field text-sm">
              <option value="basico">Básico</option>
              <option value="profissional">Profissional</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <input placeholder="ACK Code (ex: ACK00005)" value={form.ack_code} onChange={e => setForm(p => ({ ...p, ack_code: e.target.value.toUpperCase() }))} className="input-field text-sm font-mono" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700 rounded-lg">Cancelar</button>
            <button onClick={handleAdd} className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">Criar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {companies.map(c => (
          <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            {editId === c.id ? (
              /* Modo edição */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Nome" defaultValue={c.nome} onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))} className="input-field text-sm" />
                  <input placeholder="Slug" defaultValue={c.slug} onChange={e => setEditForm(p => ({ ...p, slug: e.target.value }))} className="input-field text-sm" />
                  <select defaultValue={c.plano} onChange={e => setEditForm(p => ({ ...p, plano: e.target.value }))} className="input-field text-sm">
                    <option value="basico">Básico</option><option value="profissional">Profissional</option><option value="enterprise">Enterprise</option>
                  </select>
                  <input placeholder="ACK Code (deixe vazio para manter)" onChange={e => setEditForm(p => ({ ...p, ack_code: e.target.value.toUpperCase() }))} className="input-field text-sm font-mono" />
                  <select defaultValue={c.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))} className="input-field text-sm">
                    <option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:text-white bg-gray-700 rounded-lg"><X className="w-4 h-4" /></button>
                  <button onClick={() => handleUpdate(c.id)} className="p-1.5 text-white bg-green-700 hover:bg-green-600 rounded-lg"><Check className="w-4 h-4" /></button>
                </div>
              </div>
            ) : (
              /* Modo visualização */
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{c.nome}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${c.status === 'ativo' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{c.status}</span>
                    <span className="text-xs text-gray-500">{c.plano}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">slug: {c.slug}</p>
                  {/* ACK code mascarado — visível apenas sob demanda */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-500">ACK:</span>
                    <span className="text-xs font-mono text-yellow-400/80">
                      {showAck[c.id] ? (c.ack_code ?? '—') : (c.ack_code ? '••••••••' : '—')}
                    </span>
                    {c.ack_code && (
                      <button onClick={() => setShowAck(p => ({ ...p, [c.id]: !p[c.id] }))} className="text-gray-600 hover:text-gray-400">
                        {showAck[c.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setEditId(c.id); setEditForm({}) }} className="p-1.5 text-gray-400 hover:text-white bg-gray-700 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(c.id, c.nome)} className="p-1.5 text-gray-400 hover:text-red-400 bg-gray-700 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {companies.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Nenhuma empresa cadastrada.</p>}
      </div>
    </div>
  )
}

// ─── Componente: Usuários ──────────────────────────────────────────────────────
function UsuariosTab({ api }: { api: ReturnType<typeof useGestorAPI> }) {
  const [users,   setUsers]   = useState<GestorUser[]>([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [editId,  setEditId]  = useState<string | null>(null)
  const [form,    setForm]    = useState({ email: '', password: '', nome: '', company_id: '', role: 'viewer' })
  const [editForm, setEditForm] = useState<Partial<GestorUser & { password: string }>>({})
  const [companies, setCompanies] = useState<GestorCompany[]>([])
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [u, c] = await Promise.all([
        api({ action: 'list_users' }) as Promise<{ users: GestorUser[] }>,
        api({ action: 'list_companies' }) as Promise<{ companies: GestorCompany[] }>,
      ])
      setUsers(u.users)
      setCompanies(c.companies)
    } catch (e) { setErro(String(e)) }
    setLoading(false)
  }, [api])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    try {
      setErro('')
      await api({ action: 'create_user', data: form })
      setForm({ email: '', password: '', nome: '', company_id: '', role: 'viewer' })
      setAdding(false)
      load()
    } catch (e) { setErro(String(e)) }
  }

  const handleUpdate = async (id: string) => {
    try {
      setErro('')
      if (editForm.password) await api({ action: 'reset_password', id, data: { password: editForm.password } })
      const { password: _pw, ...profileData } = editForm
      void _pw
      if (Object.keys(profileData).length > 0) await api({ action: 'update_user', id, data: profileData })
      setEditId(null)
      load()
    } catch (e) { setErro(String(e)) }
  }

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir usuário "${nome}"?`)) return
    try { await api({ action: 'delete_user', id }); load() }
    catch (e) { setErro(String(e)) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {erro && <Erro msg={erro} onClose={() => setErro('')} />}
      <div className="flex justify-end">
        <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Novo Usuário
        </button>
      </div>

      {adding && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">Novo usuário</p>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Login (ex: 00001) ou e-mail" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input-field text-sm" />
            <input placeholder="Senha" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="input-field text-sm" />
            <input placeholder="Nome completo" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className="input-field text-sm" />
            <select value={form.company_id} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))} className="input-field text-sm">
              <option value="">— Empresa —</option>
              {companies.filter(c => c.slug !== 'sistema').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input-field text-sm">
              <option value="owner">Owner</option><option value="admin">Admin</option>
              <option value="operator">Operador</option><option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700 rounded-lg">Cancelar</button>
            <button onClick={handleAdd} className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">Criar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.filter(u => u.role !== 'gestor').map(u => (
          <div key={u.id} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            {editId === u.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nome" defaultValue={u.nome} onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))} className="input-field text-sm" />
                  <input placeholder="Nova senha (opcional)" type="password" onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} className="input-field text-sm" />
                  <select defaultValue={u.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))} className="input-field text-sm">
                    <option value="owner">Owner</option><option value="admin">Admin</option>
                    <option value="operator">Operador</option><option value="viewer">Viewer</option>
                  </select>
                  <select defaultValue={u.company_id} onChange={e => setEditForm(p => ({ ...p, company_id: e.target.value }))} className="input-field text-sm">
                    {companies.filter(c => c.slug !== 'sistema').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-400 col-span-2">
                    <input type="checkbox" defaultChecked={u.ativo} onChange={e => setEditForm(p => ({ ...p, ativo: e.target.checked }))} className="w-4 h-4 rounded" />
                    Ativo
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 bg-gray-700 rounded-lg"><X className="w-4 h-4" /></button>
                  <button onClick={() => handleUpdate(u.id)} className="p-1.5 text-white bg-green-700 rounded-lg"><Check className="w-4 h-4" /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{u.nome}</span>
                    <RoleBadge role={u.role} />
                    {!u.ativo && <span className="text-xs text-red-400">Inativo</span>}
                  </div>
                  <p className="text-xs text-gray-500">{u.email} · {(u as GestorUser & { companies?: { nome: string } }).companies?.nome ?? u.company_id}</p>
                  {u.ultimo_acesso_at && <p className="text-xs text-gray-600">Último acesso: {new Date(u.ultimo_acesso_at).toLocaleDateString('pt-BR')}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditId(u.id); setEditForm({}) }} className="p-1.5 text-gray-400 hover:text-white bg-gray-700 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(u.id, u.nome)} className="p-1.5 text-gray-400 hover:text-red-400 bg-gray-700 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {users.filter(u => u.role !== 'gestor').length === 0 && <p className="text-sm text-gray-500 text-center py-8">Nenhum usuário cadastrado.</p>}
      </div>
    </div>
  )
}

// ─── Componente: IAs ───────────────────────────────────────────────────────────
function IAsTab({ api }: { api: ReturnType<typeof useGestorAPI> }) {
  const [agents,  setAgents]  = useState<GestorAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api({ action: 'list_agents' }) as { agents: GestorAgent[] }
      setAgents(d.agents)
    } catch (e) { setErro(String(e)) }
    setLoading(false)
  }, [api])

  useEffect(() => { load() }, [load])

  const handleSetPrincipal = async (agent: GestorAgent) => {
    try {
      setErro('')
      await api({ action: 'set_principal', id: agent.id, company_id: agent.company_id })
      load()
    } catch (e) { setErro(String(e)) }
  }

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir IA "${nome}"?`)) return
    try { await api({ action: 'delete_agent', id }); load() }
    catch (e) { setErro(String(e)) }
  }

  if (loading) return <Spinner />

  const byCompany = agents.reduce<Record<string, GestorAgent[]>>((acc, a) => {
    const key = (a as GestorAgent & { companies?: { nome: string } }).companies?.nome ?? a.company_id
    acc[key] = [...(acc[key] ?? []), a]
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {erro && <Erro msg={erro} onClose={() => setErro('')} />}
      {Object.entries(byCompany).map(([empresa, list]) => (
        <div key={empresa}>
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{empresa}</p>
          <div className="space-y-2">
            {list.map(a => (
              <div key={a.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl p-3">
                <span className="text-lg">{a.tipo === 'zeus' ? '⚡' : a.tipo === 'especialista' ? '🎯' : '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{a.nome}</span>
                    {a.is_principal && (
                      <span className="flex items-center gap-0.5 text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">
                        <Star className="w-3 h-3" /> Principal
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{a.integracao_tipo ?? '—'}</span>
                  </div>
                  <p className="text-xs text-gray-500">{a.funcao ?? '—'}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSetPrincipal(a)}
                    title="Definir como IA principal (Flowise 24/7)"
                    className={`p-1.5 rounded-lg text-xs ${a.is_principal ? 'bg-yellow-800/40 text-yellow-400' : 'bg-gray-700 text-gray-400 hover:text-yellow-400'}`}
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(a.id, a.nome)} className="p-1.5 text-gray-400 hover:text-red-400 bg-gray-700 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {agents.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Nenhuma IA cadastrada.</p>}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
}
function Erro({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-400">
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X className="w-4 h-4" /></button>
    </div>
  )
}
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    owner: 'bg-purple-900/40 text-purple-300', admin: 'bg-blue-900/40 text-blue-300',
    operator: 'bg-gray-700 text-gray-300', viewer: 'bg-gray-700 text-gray-500', gestor: 'bg-yellow-900/40 text-yellow-300',
  }
  return <span className={`text-xs px-1.5 py-0.5 rounded ${map[role] ?? 'bg-gray-700 text-gray-400'}`}>{role}</span>
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Gestor() {
  const [tab, setTab] = useState<Tab>('empresas')
  const api = useGestorAPI()

  const handleSignOut = async () => { await supabase.auth.signOut() }

  const TABS: { id: Tab; label: string; Icon: typeof Building2 }[] = [
    { id: 'empresas', label: 'Empresas', Icon: Building2 },
    { id: 'usuarios', label: 'Usuários',  Icon: Users     },
    { id: 'ias',      label: 'IAs',       Icon: Bot       },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏢</span>
          <div>
            <h1 className="text-sm font-bold text-white">ZITA — Painel do Gestor</h1>
            <p className="text-xs text-gray-500">Acesso exclusivo · 00000</p>
          </div>
        </div>
        <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg">
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-4">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
        <button onClick={() => window.location.reload()} className="ml-auto p-2 text-gray-600 hover:text-gray-300" title="Recarregar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-4xl w-full mx-auto">
        {tab === 'empresas' && <EmpresasTab api={api} />}
        {tab === 'usuarios' && <UsuariosTab api={api} />}
        {tab === 'ias'      && <IAsTab      api={api} />}
      </div>
    </div>
  )
}
