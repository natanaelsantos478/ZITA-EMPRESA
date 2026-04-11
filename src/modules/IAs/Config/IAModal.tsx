import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { IaAgent, AgentTipo } from '../../../types'

// integracao_tipo values allowed by DB check constraint
// Gemini é gerenciado pelo owner via Supabase Secrets — não exige configuração aqui
const INTEGRACOES = ['', 'gemini', 'flowise', 'n8n', 'make', 'webhook', 'openai', 'anthropic', 'runway', 'custom']
const TONS = ['profissional', 'casual', 'técnico', 'amigável']

// Capacidade keys matching the actual ia_agents.capacidades JSONB schema
const CAPACIDADES_OPCOES = [
  { key: 'pode_enviar_email',      label: 'Enviar e-mail' },
  { key: 'pode_enviar_whatsapp',   label: 'Enviar WhatsApp' },
  { key: 'pode_receber_whatsapp',  label: 'Receber WhatsApp' },
  { key: 'pode_criar_relatorios',  label: 'Criar relatórios' },
  { key: 'pode_ler_crm',           label: 'Ler CRM' },
  { key: 'pode_escrever_crm',      label: 'Escrever no CRM' },
  { key: 'pode_ler_erp',           label: 'Ler ERP' },
  { key: 'pode_escrever_erp',      label: 'Escrever no ERP' },
  { key: 'pode_gerenciar_rh',      label: 'Gerenciar RH' },
  { key: 'pode_acessar_financeiro',label: 'Acessar financeiro' },
  { key: 'pode_chamar_outras_ias', label: 'Chamar outras IAs' },
]

interface Props {
  agent?: IaAgent | null
  agents: IaAgent[]
  onClose: () => void
  onSaved: () => void
}

export default function IAModal({ agent, agents, onClose, onSaved }: Props) {
  const { companyId } = useAuth()
  const isEdit = !!agent

  const [nome,       setNome]       = useState(agent?.nome ?? '')
  const [funcao,     setFuncao]     = useState(agent?.funcao ?? '')
  const [descricao,  setDescricao]  = useState(agent?.descricao ?? '')
  const [tipo,       setTipo]       = useState<AgentTipo>(agent?.tipo ?? 'subordinada')
  const [cor,        setCor]        = useState(agent?.cor_hex ?? '#4e5eff')
  const [integTipo,  setIntegTipo]  = useState(agent?.integracao_tipo ?? '')
  const [integUrl,   setIntegUrl]   = useState(agent?.integracao_url ?? '')
  const [parentId,   setParentId]   = useState(agent?.organograma_parent_id ?? '')
  const [tom,        setTom]        = useState(agent?.personalidade?.tom ?? 'profissional')
  const [prompt,     setPrompt]     = useState(agent?.personalidade?.prompt_sistema ?? '')
  const [temperatura,setTemperatura]= useState(agent?.personalidade?.temperatura ?? 0.7)
  const [maxTokens,  setMaxTokens]  = useState(agent?.personalidade?.max_tokens ?? 2000)
  const [caps, setCaps] = useState<Record<string, boolean>>(
    Object.fromEntries(CAPACIDADES_OPCOES.map((c) => [c.key, !!(agent?.capacidades?.[c.key])]))
  )
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState('')

  const zeusExists  = agents.some((a) => a.tipo === 'zeus' && a.id !== agent?.id)
  const otherAgents = agents.filter((a) => a.id !== agent?.id)

  const handleSave = async () => {
    if (!nome.trim()) return
    if (!companyId) { setErro('Empresa não identificada. Faça login novamente.'); return }
    if (tipo === 'zeus' && zeusExists) { setErro('Já existe uma IA do tipo Zeus. Só pode haver uma.'); return }

    setLoading(true)
    setErro('')

    // integracao_config preserva connections (webhooks, slack, etc.) se já existirem.
    // A chave Gemini NÃO é armazenada aqui — fica nos Secrets do Supabase (owner only).
    const integracao_config: Record<string, unknown> = {}
    if (agent?.integracao_config) {
      Object.assign(integracao_config, agent.integracao_config)
    }

    // Payload only includes columns that EXIST in the real ia_agents table
    const payload = {
      company_id:             companyId,
      nome:                   nome.trim(),
      funcao:                 funcao.trim() || null,
      descricao:              descricao.trim() || null,
      tipo,
      cor_hex:                cor,
      integracao_tipo:        integTipo || null,
      integracao_url:         integUrl.trim() || null,
      integracao_config,
      organograma_parent_id:  parentId || null,
      personalidade:          { tom, idioma: 'pt-BR', prompt_sistema: prompt, temperatura, max_tokens: maxTokens },
      capacidades:            caps,
      // NOTE: modo_arquivo is intentionally excluded — column does not exist in production DB
    }

    if (isEdit && agent) {
      const { error } = await supabase.from('ia_agents').update(payload).eq('id', agent.id)
      if (error) { setErro(error.message); setLoading(false); return }
      try { await supabase.from('audit_log').insert({ acao: 'editar_ia', detalhes: { id: agent.id, nome: nome.trim() }, sucesso: true }) } catch { /* ignore */ }
    } else {
      const { error } = await supabase.from('ia_agents').insert({
        ...payload,
        status: 'offline',
        organograma_x: 100, organograma_y: 100,
        total_conversas: 0, total_tarefas_concluidas: 0, total_tarefas_erro: 0, uptime_segundos: 0,
      })
      if (error) { setErro(error.message); setLoading(false); return }
      try { await supabase.from('audit_log').insert({ acao: 'criar_ia', detalhes: { nome: nome.trim() }, sucesso: true }) } catch { /* ignore */ }
    }

    setLoading(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-bold text-white">{isEdit ? `Editar ${agent.nome}` : 'Nova IA'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
          {erro && (
            <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-400">{erro}</div>
          )}

          {/* ── Dados básicos ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome *</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da IA"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Função / Cargo</label>
              <input value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex: Analista de Marketing"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as AgentTipo)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
                <option value="zeus">Zeus (Mestre)</option>
                <option value="subordinada">Subordinada</option>
                <option value="especialista">Especialista</option>
              </select>
              {tipo === 'zeus' && zeusExists && <p className="text-xs text-red-400 mt-1">Já existe uma Zeus</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Descrição</label>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2}
                placeholder="Descreva o papel desta IA"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Cor do tema</label>
              <div className="flex items-center gap-2">
                <input type="color" value={cor} onChange={(e) => setCor(e.target.value)}
                  className="w-10 h-9 cursor-pointer rounded bg-gray-800 border border-gray-700 p-0.5" />
                <input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="#4e5eff"
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">IA superior</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
                <option value="">Nenhuma (raiz)</option>
                {otherAgents.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          </div>

          {/* ── Integração ─────────────────────────────────────────────────── */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Integração / IA</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Provedor</label>
                <select value={integTipo} onChange={(e) => setIntegTipo(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
                  {INTEGRACOES.map((i) => (
                    <option key={i} value={i}>
                      {i === '' ? '— Nenhuma —'
                        : i === 'gemini' ? '✨ Gemini (Google)'
                        : i === 'openai' ? '🤖 OpenAI'
                        : i === 'anthropic' ? '⚡ Anthropic'
                        : i}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL (opcional)</label>
                <input value={integUrl} onChange={(e) => setIntegUrl(e.target.value)} placeholder="https://…"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
              </div>
              {integTipo === 'gemini' && (
                <div className="col-span-2 px-3 py-2.5 bg-blue-950/40 border border-blue-800/40 rounded-lg">
                  <p className="text-xs text-blue-300 font-medium">Chave gerenciada pelo administrador</p>
                  <p className="text-xs text-blue-400/70 mt-0.5">
                    A chave da API Gemini é configurada nos Secrets do Supabase e nunca fica visível aqui.
                    Contate o administrador para ativar ou alterar a chave desta empresa.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Personalidade ──────────────────────────────────────────────── */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Personalidade</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tom</label>
                <select value={tom} onChange={(e) => setTom(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
                  {TONS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prompt de sistema</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
                  placeholder="Você é uma IA especializada em… Responda sempre em português."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Temperatura: <span className="text-white">{temperatura}</span>
                </label>
                <input type="range" min={0.1} max={1} step={0.05} value={temperatura}
                  onChange={(e) => setTemperatura(parseFloat(e.target.value))}
                  className="w-full accent-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max tokens</label>
                <input type="number" value={maxTokens} min={256} max={32000} step={256}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500" />
              </div>
            </div>
          </div>

          {/* ── Capacidades ────────────────────────────────────────────────── */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Capacidades</p>
            <div className="grid grid-cols-2 gap-2">
              {CAPACIDADES_OPCOES.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={caps[c.key] ?? false}
                    onChange={(e) => setCaps((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                    className="w-4 h-4 rounded text-brand-500 border-gray-600 bg-gray-800 focus:ring-brand-500"
                  />
                  <span className="text-xs text-gray-400 group-hover:text-gray-200">{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={loading || !nome.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar IA'}
          </button>
        </div>
      </div>
    </div>
  )
}
