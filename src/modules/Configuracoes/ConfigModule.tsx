import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { IAAgent } from '../../types'
import Header from '../../components/Layout/Header'

type Tab = 'agentes' | 'integracoes' | 'empresa'

interface AgentFormData {
  name: string
  role: IAAgent['role']
  description: string
  emoji: string
  color: string
  system_prompt: string
  provider: string
  model: string
  api_key: string
  webhook_url: string
  webhook_interval: number
  parent_id: string
}

const ROLES: { value: IAAgent['role']; label: string; emoji: string }[] = [
  { value: 'zeus', label: 'Zeus (Orquestrador)', emoji: '⚡' },
  { value: 'prospeccao', label: 'Prospecção', emoji: '🔍' },
  { value: 'crm', label: 'CRM / Qualificação', emoji: '🎯' },
  { value: 'financeiro', label: 'Financeiro', emoji: '💰' },
  { value: 'marketing', label: 'Marketing', emoji: '📱' },
  { value: 'atendimento', label: 'Atendimento', emoji: '🎧' },
  { value: 'custom', label: 'Custom', emoji: '⚙' },
]

const PROVIDERS = ['', 'openai', 'anthropic', 'gemini', 'flowise', 'ollama']

const DEFAULT_FORM: AgentFormData = {
  name: '',
  role: 'custom',
  description: '',
  emoji: '🤖',
  color: '#4a9eff',
  system_prompt: '',
  provider: '',
  model: '',
  api_key: '',
  webhook_url: '',
  webhook_interval: 0,
  parent_id: '',
}

function AgentRow({ agent, onEdit, onDelete }: { agent: IAAgent; onEdit: (a: IAAgent) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-dark-700 transition-colors border-b border-dark-500 last:border-b-0">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
        style={{ backgroundColor: agent.color + '22', border: `2px solid ${agent.color}` }}
      >
        {agent.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{agent.name}</p>
        <p className="text-xs text-gray-400">{agent.description ?? agent.role}</p>
      </div>
      <div className="flex items-center gap-2">
        {agent.is_zeus && (
          <span className="text-xs px-2 py-0.5 rounded bg-zeus/10 text-zeus border border-zeus/20">Zeus</span>
        )}
        <button onClick={() => onEdit(agent)} className="btn-secondary text-xs px-3 py-1.5">
          Editar
        </button>
        {!agent.is_zeus && (
          <button onClick={() => onDelete(agent.id)} className="btn-danger text-xs px-3 py-1.5">
            Remover
          </button>
        )}
      </div>
    </div>
  )
}

function AgentForm({
  initial,
  agents,
  onSave,
  onCancel,
  saving,
}: {
  initial: AgentFormData
  agents: IAAgent[]
  onSave: (data: AgentFormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<AgentFormData>(initial)

  function set<K extends keyof AgentFormData>(k: K, v: AgentFormData[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const roleEmoji = ROLES.find((r) => r.value === form.role)?.emoji ?? '🤖'

  return (
    <div className="card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input-field" placeholder="Zeus" maxLength={30} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Emoji</label>
          <div className="flex gap-2">
            <input value={form.emoji} onChange={(e) => set('emoji', e.target.value)} className="input-field w-16 text-center text-xl" maxLength={2} />
            <button type="button" onClick={() => set('emoji', roleEmoji)} className="btn-secondary text-xs px-3">Auto</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Função</label>
          <select value={form.role} onChange={(e) => { const r = e.target.value as IAAgent['role']; set('role', r); set('emoji', ROLES.find(x => x.value === r)?.emoji ?? form.emoji) }} className="input-field">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Cor</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} className="h-10 w-16 rounded-lg cursor-pointer bg-dark-700 border border-dark-500" />
            <span className="text-sm text-gray-300">{form.color}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Descrição</label>
        <input value={form.description} onChange={(e) => set('description', e.target.value)} className="input-field" placeholder="Responsável por..." maxLength={100} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Agente superior (parent)</label>
        <select value={form.parent_id} onChange={(e) => set('parent_id', e.target.value)} className="input-field">
          <option value="">— Nenhum (raiz) —</option>
          {agents.filter((a) => a.is_zeus || a.role !== 'custom').map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Prompt do sistema</label>
        <textarea value={form.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} rows={3} className="input-field resize-none" placeholder="Você é um agente especializado em..." />
      </div>

      <div className="border-t border-dark-500 pt-4">
        <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Provedor de IA</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Provedor</label>
            <select value={form.provider} onChange={(e) => set('provider', e.target.value)} className="input-field">
              {PROVIDERS.map((p) => <option key={p} value={p}>{p || '— Nenhum —'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Modelo</label>
            <input value={form.model} onChange={(e) => set('model', e.target.value)} className="input-field" placeholder="gpt-4o" />
          </div>
        </div>
        {form.provider && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">API Key</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => set('api_key', e.target.value)}
              className="input-field"
              placeholder="sk-... (criptografada ao salvar)"
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 mt-1">A chave nunca é exibida após salvar.</p>
          </div>
        )}
      </div>

      <div className="border-t border-dark-500 pt-4">
        <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Webhook / Automação</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">URL do Webhook</label>
            <input type="url" value={form.webhook_url} onChange={(e) => set('webhook_url', e.target.value)} className="input-field" placeholder="https://n8n.exemplo.com/webhook/..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Intervalo</label>
            <select value={form.webhook_interval} onChange={(e) => set('webhook_interval', Number(e.target.value))} className="input-field">
              <option value={0}>Apenas manual</option>
              <option value={30}>30 segundos</option>
              <option value={60}>1 minuto</option>
              <option value={300}>5 minutos</option>
              <option value={600}>10 minutos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => onSave(form)} disabled={!form.name || saving} className="btn-primary flex-1">
          {saving ? 'Salvando...' : 'Salvar Agente'}
        </button>
        <button onClick={onCancel} className="btn-secondary px-6">
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function ConfigModule() {
  const { companyId, profile } = useAuth()
  const [tab, setTab] = useState<Tab>('agentes')
  const [agents, setAgents] = useState<IAAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAgent, setEditingAgent] = useState<IAAgent | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  useEffect(() => {
    supabase
      .from('ia_agents')
      .select('*')
      .eq('company_id', companyId)
      .order('is_zeus', { ascending: false })
      .then(({ data }) => {
        setAgents(data ?? [])
        setLoading(false)
      })
  }, [companyId])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleSaveNew(data: AgentFormData) {
    if (!isAdmin) return
    setSaving(true)
    const { error } = await supabase.from('ia_agents').insert({
      company_id: companyId,
      name: data.name,
      role: data.role,
      description: data.description || null,
      emoji: data.emoji,
      color: data.color,
      system_prompt: data.system_prompt || null,
      provider: data.provider || null,
      model: data.model || null,
      webhook_url: data.webhook_url || null,
      webhook_interval: data.webhook_interval,
      parent_id: data.parent_id || null,
      status: 'offline',
      is_zeus: data.role === 'zeus',
      organograma_x: 200 + Math.random() * 400,
      organograma_y: 200 + Math.random() * 300,
      tasks_done: 0,
    })
    if (!error) {
      const { data: fresh } = await supabase.from('ia_agents').select('*').eq('company_id', companyId).order('is_zeus', { ascending: false })
      setAgents(fresh ?? [])
      setShowNewForm(false)
      showToast('Agente criado com sucesso!')
    } else {
      showToast('Erro ao criar agente.')
    }
    setSaving(false)
  }

  async function handleSaveEdit(data: AgentFormData) {
    if (!editingAgent || !isAdmin) return
    setSaving(true)

    const update: Partial<IAAgent> & { api_key?: string } = {
      name: data.name,
      role: data.role,
      description: data.description || null,
      emoji: data.emoji,
      color: data.color,
      system_prompt: data.system_prompt || null,
      provider: data.provider || null,
      model: data.model || null,
      webhook_url: data.webhook_url || null,
      webhook_interval: data.webhook_interval,
      parent_id: data.parent_id || null,
    }

    const { error } = await supabase
      .from('ia_agents')
      .update(update)
      .eq('id', editingAgent.id)
      .eq('company_id', companyId)

    if (!error) {
      const { data: fresh } = await supabase.from('ia_agents').select('*').eq('company_id', companyId).order('is_zeus', { ascending: false })
      setAgents(fresh ?? [])
      setEditingAgent(null)
      showToast('Agente atualizado!')
    } else {
      showToast('Erro ao salvar.')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!isAdmin || !confirm('Remover este agente?')) return
    await supabase.from('ia_agents').delete().eq('id', id).eq('company_id', companyId)
    setAgents((prev) => prev.filter((a) => a.id !== id))
    showToast('Agente removido.')
  }

  function agentToForm(a: IAAgent): AgentFormData {
    return {
      name: a.name,
      role: a.role,
      description: a.description ?? '',
      emoji: a.emoji,
      color: a.color,
      system_prompt: a.system_prompt ?? '',
      provider: a.provider ?? '',
      model: a.model ?? '',
      api_key: '',
      webhook_url: a.webhook_url ?? '',
      webhook_interval: a.webhook_interval,
      parent_id: a.parent_id ?? '',
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Configurações" subtitle="Gerencie agentes, integrações e configurações da empresa" />

      <div className="flex-1 p-6 overflow-auto">
        {/* Tabs */}
        <div className="flex border-b border-dark-500 mb-6">
          {(['agentes', 'integracoes', 'empresa'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t === 'integracoes' ? 'Integrações' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Agentes */}
        {tab === 'agentes' && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Agentes de IA</h2>
              {isAdmin && !showNewForm && !editingAgent && (
                <button onClick={() => setShowNewForm(true)} className="btn-primary text-sm">
                  + Novo Agente
                </button>
              )}
            </div>

            {showNewForm && (
              <div>
                <p className="text-sm font-medium text-gray-300 mb-3">Novo Agente</p>
                <AgentForm initial={DEFAULT_FORM} agents={agents} onSave={handleSaveNew} onCancel={() => setShowNewForm(false)} saving={saving} />
              </div>
            )}

            {editingAgent && (
              <div>
                <p className="text-sm font-medium text-gray-300 mb-3">Editando: {editingAgent.name}</p>
                <AgentForm initial={agentToForm(editingAgent)} agents={agents.filter((a) => a.id !== editingAgent.id)} onSave={handleSaveEdit} onCancel={() => setEditingAgent(null)} saving={saving} />
              </div>
            )}

            {!showNewForm && !editingAgent && (
              <div className="card">
                {loading ? (
                  <div className="p-5 text-gray-400 text-sm">Carregando...</div>
                ) : agents.length === 0 ? (
                  <div className="p-5 text-gray-400 text-sm">Nenhum agente. Crie o primeiro!</div>
                ) : (
                  agents.map((a) => <AgentRow key={a.id} agent={a} onEdit={setEditingAgent} onDelete={handleDelete} />)
                )}
              </div>
            )}
          </div>
        )}

        {/* Integrações */}
        {tab === 'integracoes' && (
          <div className="max-w-2xl space-y-4">
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-2">Supabase</h3>
              <p className="text-sm text-gray-400 mb-3">Banco de dados e autenticação do Escritório de IA.</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="status-dot status-dot-online" />
                <span className="text-emerald-400">Conectado</span>
                <span className="text-gray-500 ml-2">fyearatapvhgyreifniq.supabase.co</span>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-2">Zeus Webhook Worker</h3>
              <p className="text-sm text-gray-400">Worker Cloudflare para orquestração de webhooks do Zeus.</p>
              <p className="text-xs text-gray-500 mt-2">Configure a URL no agente Zeus em Agentes → Editar → Webhook URL.</p>
            </div>
          </div>
        )}

        {/* Empresa */}
        {tab === 'empresa' && (
          <div className="max-w-xl space-y-4">
            <div className="card p-5">
              <h3 className="font-semibold text-white mb-4">Dados da empresa</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Company ID</span>
                  <span className="text-gray-200 font-mono text-xs">{companyId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Usuário atual</span>
                  <span className="text-gray-200">{profile?.display_name ?? profile?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Papel</span>
                  <span className="text-gray-200 capitalize">{profile?.role}</span>
                </div>
              </div>
            </div>

            {!isAdmin && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                <span>⚠</span>
                Apenas owners e admins podem alterar configurações.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-dark-700 border border-dark-500 text-sm text-white shadow-xl animate-fade-in-up z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
