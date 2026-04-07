import { useState, useEffect, useCallback } from 'react'
import {
  X, Activity, ListChecks, BarChart3, History,
  Play, Pause, Settings, MessageSquare, Clock,
  CheckCircle2, AlertCircle, Loader2, Plus
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useRealtime } from '../../../hooks/useRealtime'
import type { IaAgent, IaConversa, IaMensagem, IaTarefa } from '../../../types'

const STATUS_COLOR: Record<string, string> = {
  online:    'bg-green-500',
  ocupada:   'bg-yellow-500',
  aguardando:'bg-blue-500',
  offline:   'bg-gray-500',
  erro:      'bg-red-500',
  pausada:   'bg-orange-500',
}
const STATUS_LABEL: Record<string, string> = {
  online: 'Online', ocupada: 'Ocupada', aguardando: 'Aguardando',
  offline: 'Offline', erro: 'Erro', pausada: 'Pausada',
}
const PRIORIDADE_COLOR: Record<string, string> = {
  baixa: 'bg-gray-700 text-gray-400',
  normal: 'bg-blue-900/50 text-blue-400',
  alta: 'bg-orange-900/50 text-orange-400',
  urgente: 'bg-red-900/50 text-red-400',
}

type Tab = 'atividade' | 'tarefas' | 'metricas' | 'historico'

function timeAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function uptimeStr(s: number) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  return `${h}h${m.toString().padStart(2,'0')}min`
}

interface Props {
  agent: IaAgent
  onClose: () => void
  onChat: () => void
}

export default function ControleIAPanel({ agent, onClose, onChat }: Props) {
  const { companyId } = useAuth()
  const [tab, setTab] = useState<Tab>('atividade')
  const [atividade, setAtividade] = useState<IaMensagem[]>([])
  const [tarefas, setTarefas] = useState<IaTarefa[]>([])
  const [historico, setHistorico] = useState<IaConversa[]>([])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)

  // Nova tarefa modal state
  const [showNovaTarefa, setShowNovaTarefa] = useState(false)
  const [ntTitulo, setNtTitulo] = useState('')
  const [ntDesc, setNtDesc] = useState('')
  const [ntPrio, setNtPrio] = useState<'baixa'|'normal'|'alta'|'urgente'>('normal')
  const [ntLoading, setNtLoading] = useState(false)

  const loadTab = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    if (tab === 'atividade') {
      const { data } = await supabase
        .from('ia_mensagens')
        .select('*')
        .eq('company_id', companyId)
        .or(`remetente_id.eq.${agent.id},remetente_nome.eq.${agent.nome}`)
        .order('created_at', { ascending: false })
        .limit(30)
      if (data) setAtividade(data as IaMensagem[])
    } else if (tab === 'tarefas') {
      const { data } = await supabase
        .from('ia_tarefas')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) setTarefas(data as IaTarefa[])
    } else if (tab === 'historico') {
      const { data } = await supabase
        .from('ia_conversas')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (data) setHistorico(data as IaConversa[])
    }
    setLoading(false)
  }, [tab, agent.id, agent.nome, companyId])

  useEffect(() => { loadTab() }, [loadTab])

  // Realtime activity
  useRealtime<IaMensagem & Record<string, unknown>>(
    'ia_mensagens',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (msg) => {
      if (tab === 'atividade') {
        setAtividade((prev) => [msg, ...prev].slice(0, 30))
      }
    },
    'INSERT'
  )

  const toggleStatus = async () => {
    setToggling(true)
    const next = agent.status === 'pausada' ? 'online' : 'pausada'
    await supabase.from('ia_agents').update({ status: next }).eq('id', agent.id)
    setToggling(false)
  }

  const criarTarefa = async () => {
    if (!ntTitulo.trim() || !companyId) return
    setNtLoading(true)
    await supabase.from('ia_tarefas').insert({
      company_id: companyId,
      agent_id: agent.id,
      titulo: ntTitulo.trim(),
      descricao: ntDesc.trim() || undefined,
      instrucoes: {},
      status: 'pendente',
      prioridade: ntPrio,
      progresso_pct: 0,
    })
    setNtTitulo(''); setNtDesc(''); setNtPrio('normal')
    setShowNovaTarefa(false)
    setNtLoading(false)
    loadTab()
  }

  const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
    { key: 'atividade', label: 'Atividade', icon: Activity },
    { key: 'tarefas', label: 'Tarefas', icon: ListChecks },
    { key: 'metricas', label: 'Métricas', icon: BarChart3 },
    { key: 'historico', label: 'Histórico', icon: History },
  ]

  return (
    <div className="absolute top-0 right-0 h-full w-[360px] bg-gray-900 border-l border-gray-800 z-30 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-gray-800">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ backgroundColor: agent.cor_hex || '#3a40f5' }}
        >
          {agent.avatar_url
            ? <img src={agent.avatar_url} alt={agent.nome} className="w-full h-full rounded-xl object-cover" />
            : agent.nome.slice(0, 2).toUpperCase()
          }
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white text-base truncate">{agent.nome}</h2>
          {agent.funcao && <p className="text-xs text-gray-400 truncate">{agent.funcao}</p>}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[agent.status]}`} />
            <span className="text-xs text-gray-400">{STATUS_LABEL[agent.status]}</span>
            {agent.uptime_segundos > 0 && (
              <span className="text-xs text-gray-600">· uptime {uptimeStr(agent.uptime_segundos)}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-3 border-b border-gray-800">
        <button onClick={onChat} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg transition-colors">
          <MessageSquare className="w-3.5 h-3.5" /> Chat
        </button>
        <button
          onClick={toggleStatus}
          disabled={toggling}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {toggling
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : agent.status === 'pausada'
              ? <><Play className="w-3.5 h-3.5" /> Ativar</>
              : <><Pause className="w-3.5 h-3.5" /> Pausar</>
          }
        </button>
        <a href={`/configuracoes/ias#${agent.id}`} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors">
          <Settings className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'text-brand-400 border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* ATIVIDADE */}
            {tab === 'atividade' && (
              <div className="divide-y divide-gray-800/50">
                {atividade.length === 0 && (
                  <p className="text-center text-sm text-gray-600 py-8">Nenhuma atividade</p>
                )}
                {atividade.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                    <MessageSquare className="w-3.5 h-3.5 text-gray-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-300">{m.remetente_nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{m.conteudo.slice(0, 100)}</p>
                    </div>
                    <span className="text-xs text-gray-700 flex-shrink-0">{timeAgo(m.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* TAREFAS */}
            {tab === 'tarefas' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-800">
                  <button
                    onClick={() => setShowNovaTarefa(!showNovaTarefa)}
                    className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nova tarefa
                  </button>
                  {showNovaTarefa && (
                    <div className="mt-3 space-y-2">
                      <input
                        value={ntTitulo}
                        onChange={(e) => setNtTitulo(e.target.value)}
                        placeholder="Título da tarefa *"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                      />
                      <textarea
                        value={ntDesc}
                        onChange={(e) => setNtDesc(e.target.value)}
                        placeholder="Descrição (opcional)"
                        rows={2}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
                      />
                      <select
                        value={ntPrio}
                        onChange={(e) => setNtPrio(e.target.value as typeof ntPrio)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                      <div className="flex gap-2">
                        <button onClick={criarTarefa} disabled={ntLoading || !ntTitulo.trim()} className="flex-1 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs rounded-lg">
                          {ntLoading ? 'Salvando...' : 'Criar'}
                        </button>
                        <button onClick={() => setShowNovaTarefa(false)} className="flex-1 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-gray-800/50">
                  {tarefas.length === 0 && (
                    <p className="text-center text-sm text-gray-600 py-8">Nenhuma tarefa</p>
                  )}
                  {tarefas.map((t) => (
                    <div key={t.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        {t.status === 'concluida'
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                          : t.status === 'erro'
                            ? <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                            : <Clock className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{t.titulo}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORIDADE_COLOR[t.prioridade]}`}>
                              {t.prioridade}
                            </span>
                            <span className="text-xs text-gray-600 capitalize">{t.status.replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>
                      {t.status === 'em_execucao' && (
                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                          <div
                            className="bg-brand-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${t.progresso_pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MÉTRICAS */}
            {tab === 'metricas' && (
              <div className="p-4 grid grid-cols-2 gap-3">
                {[
                  { label: 'Total conversas', value: agent.total_conversas },
                  { label: 'Tarefas concluídas', value: agent.total_tarefas_concluidas },
                  { label: 'Taxa de erro', value: `${agent.total_tarefas_erro}` },
                  { label: 'Uptime', value: uptimeStr(agent.uptime_segundos) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-800 rounded-xl p-3">
                    <p className="text-lg font-bold text-white">{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
                {agent.integracao_tipo && (
                  <div className="col-span-2 bg-gray-800 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Integração</p>
                    <p className="text-sm text-white capitalize">{agent.integracao_tipo}</p>
                    <p className="text-xs text-gray-600 truncate mt-0.5">
                      {agent.integracao_url ? '🔗 URL configurada' : 'Sem URL'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* HISTÓRICO */}
            {tab === 'historico' && (
              <div className="divide-y divide-gray-800/50">
                {historico.length === 0 && (
                  <p className="text-center text-sm text-gray-600 py-8">Nenhum histórico</p>
                )}
                {historico.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/30 cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{c.titulo ?? 'Conversa sem título'}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {new Date(c.created_at).toLocaleDateString('pt-BR')} · {c.total_mensagens} msgs
                      </p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                      c.status === 'ativa' ? 'bg-green-900/40 text-green-400'
                        : c.status === 'concluida' ? 'bg-gray-800 text-gray-500'
                        : 'bg-red-900/40 text-red-400'
                    }`}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
