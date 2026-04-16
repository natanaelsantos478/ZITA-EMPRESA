import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Send, RefreshCw, Loader2, Zap, MessageSquare,
  ListChecks, BarChart3, History, Activity,
  Pause, Play, Settings, Plus, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react'
import type { IaAgent, IaMensagem, IaTarefa, IaConversa } from '../../../types'
import { useChat } from '../../../hooks/useChat'
import { useAuth } from '../../../contexts/AuthContext'
import { useRealtime } from '../../../hooks/useRealtime'
import { supabase } from '../../../lib/supabase'

type Tab = 'chat' | 'tarefas' | 'metricas' | 'historico' | 'atividade'

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-green-500', ocupada: 'bg-yellow-500', aguardando: 'bg-blue-500',
  offline: 'bg-gray-500', erro: 'bg-red-500', pausada: 'bg-orange-500',
}
const STATUS_LABEL: Record<string, string> = {
  online: 'Online', ocupada: 'Ocupada', aguardando: 'Aguardando',
  offline: 'Offline', erro: 'Erro', pausada: 'Pausada',
}
const PRIORIDADE_COLOR: Record<string, string> = {
  baixa: 'bg-gray-700 text-gray-400', normal: 'bg-blue-900/50 text-blue-400',
  alta: 'bg-orange-900/50 text-orange-400', urgente: 'bg-red-900/50 text-red-400',
}

function timeAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}
function uptimeStr(s: number) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  return `${h}h${m.toString().padStart(2, '0')}min`
}

interface Props {
  agent: IaAgent
  onClose: () => void
}

export default function AgentPanel({ agent, onClose }: Props) {
  const { companyId } = useAuth()
  const [tab, setTab] = useState<Tab>('chat')

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const { conversa, mensagens, loading: chatLoading, typing, initConversa, sendMessage } = useChat(agent.id)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { initConversa() }, [initConversa])
  useEffect(() => {
    if (tab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, typing, tab])

  const handleSend = useCallback(async () => {
    if (!texto.trim() || sending || typing) return
    const msg = texto.trim()
    setTexto('')
    setSending(true)
    await sendMessage(msg)
    setSending(false)
    inputRef.current?.focus()
  }, [texto, sending, typing, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Tarefas ───────────────────────────────────────────────────────────────────
  const [tarefas, setTarefas] = useState<IaTarefa[]>([])
  const [loadingTab, setLoadingTab] = useState(false)
  const [showNovaTarefa, setShowNovaTarefa] = useState(false)
  const [ntTitulo, setNtTitulo] = useState('')
  const [ntDesc, setNtDesc] = useState('')
  const [ntPrio, setNtPrio] = useState<'baixa' | 'normal' | 'alta' | 'urgente'>('normal')
  const [ntLoading, setNtLoading] = useState(false)

  // ── Histórico ─────────────────────────────────────────────────────────────────
  const [historico, setHistorico] = useState<IaConversa[]>([])

  // ── Atividade ─────────────────────────────────────────────────────────────────
  const [atividade, setAtividade] = useState<IaMensagem[]>([])

  // ── Status toggle ─────────────────────────────────────────────────────────────
  const [toggling, setToggling] = useState(false)
  const toggleStatus = async () => {
    setToggling(true)
    const next = agent.status === 'pausada' ? 'online' : 'pausada'
    await supabase.from('ia_agents').update({ status: next }).eq('id', agent.id)
    setToggling(false)
  }

  const loadTab = useCallback(async () => {
    if (!companyId) return
    setLoadingTab(true)
    if (tab === 'tarefas') {
      const { data } = await supabase.from('ia_tarefas').select('*')
        .eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(20)
      if (data) setTarefas(data as IaTarefa[])
    } else if (tab === 'historico') {
      const { data } = await supabase.from('ia_conversas').select('*')
        .eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(10)
      if (data) setHistorico(data as IaConversa[])
    } else if (tab === 'atividade') {
      const { data } = await supabase.from('ia_mensagens').select('*')
        .eq('company_id', companyId)
        .or(`remetente_id.eq.${agent.id},remetente_nome.eq.${agent.nome}`)
        .order('created_at', { ascending: false }).limit(30)
      if (data) setAtividade(data as IaMensagem[])
    }
    setLoadingTab(false)
  }, [tab, agent.id, agent.nome, companyId])

  useEffect(() => { if (tab !== 'chat') loadTab() }, [tab, loadTab])

  useRealtime<IaMensagem & Record<string, unknown>>(
    'ia_mensagens',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (msg) => { if (tab === 'atividade') setAtividade((p) => [msg, ...p].slice(0, 30)) },
    'INSERT'
  )

  const criarTarefa = async () => {
    if (!ntTitulo.trim() || !companyId) return
    setNtLoading(true)
    await supabase.from('ia_tarefas').insert({
      company_id: companyId, agent_id: agent.id,
      titulo: ntTitulo.trim(), descricao: ntDesc.trim() || undefined,
      instrucoes: {}, status: 'pendente', prioridade: ntPrio, progresso_pct: 0,
    })
    setNtTitulo(''); setNtDesc(''); setNtPrio('normal')
    setShowNovaTarefa(false); setNtLoading(false); loadTab()
  }

  const TABS: { key: Tab; icon: typeof MessageSquare; label: string }[] = [
    { key: 'chat',      icon: MessageSquare, label: 'Chat'      },
    { key: 'tarefas',   icon: ListChecks,    label: 'Tarefas'   },
    { key: 'metricas',  icon: BarChart3,     label: 'Métricas'  },
    { key: 'historico', icon: History,       label: 'Histórico' },
    { key: 'atividade', icon: Activity,      label: 'Atividade' },
  ]

  const canSend = !!texto.trim() && !sending && !typing &&
    agent.status !== 'offline' && agent.status !== 'pausada'

  return (
    <div className="absolute top-0 right-0 h-full w-[400px] bg-gray-900 border-l border-gray-800 z-30 flex flex-col shadow-2xl">

      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-gray-800 flex-shrink-0">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
          style={{ backgroundColor: agent.cor_hex || '#3a40f5' }}
        >
          {agent.avatar_url
            ? <img src={agent.avatar_url} alt={agent.nome} className="w-full h-full rounded-xl object-cover" />
            : agent.tipo === 'zeus'
              ? <Zap className="w-5 h-5 text-yellow-300" />
              : agent.nome.slice(0, 2).toUpperCase()
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-white text-sm truncate">{agent.nome}</h2>
            {agent.tipo === 'zeus' && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">Mestre</span>
            )}
          </div>
          {agent.funcao && <p className="text-xs text-gray-400 truncate mt-0.5">{agent.funcao}</p>}
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[agent.status] ?? 'bg-gray-500'}`} />
            <span className="text-xs text-gray-500">{STATUS_LABEL[agent.status]}</span>
            {agent.uptime_segundos > 0 && (
              <span className="text-xs text-gray-700">· {uptimeStr(agent.uptime_segundos)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleStatus}
            disabled={toggling}
            title={agent.status === 'pausada' ? 'Ativar' : 'Pausar'}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {toggling
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : agent.status === 'pausada' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />
            }
          </button>
          <a
            href={`/configuracoes/ias#${agent.id}`}
            title="Configurações"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </a>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
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

      {/* ── TAB: CHAT ────────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <>
          {/* Botão nova conversa */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800/50 flex-shrink-0">
            <span className="text-xs text-gray-600">
              {conversa ? `${mensagens.length} mensage${mensagens.length !== 1 ? 'ns' : 'm'}` : 'Nova conversa'}
            </span>
            <button
              onClick={initConversa}
              title="Nova conversa"
              className="p-1 rounded text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2.5 min-h-0">
            {chatLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              </div>
            ) : (
              <>
                {mensagens.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MessageSquare className="w-8 h-8 text-gray-700 mb-2" />
                    <p className="text-xs text-gray-500">Inicie uma conversa com {agent.nome}</p>
                  </div>
                )}
                {mensagens.map((m) => {
                  const isHuman = m.remetente_tipo === 'humano'
                  const isSistema = m.remetente_tipo === 'sistema'
                  if (isSistema) return (
                    <div key={m.id} className="flex justify-center">
                      <span className="text-xs text-gray-600 bg-gray-800/50 px-2 py-0.5 rounded-full">{m.conteudo}</span>
                    </div>
                  )
                  return (
                    <div key={m.id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        isHuman
                          ? 'bg-brand-600 text-white rounded-br-sm'
                          : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                      }`}>
                        {!isHuman && (
                          <p className="text-xs font-medium mb-0.5" style={{ color: agent.cor_hex || '#7487ff' }}>
                            {m.remetente_nome}
                          </p>
                        )}
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.conteudo}</p>
                        <p className={`text-xs mt-0.5 ${isHuman ? 'text-brand-200/60' : 'text-gray-600'}`}>
                          {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                {typing && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-800 flex-shrink-0">
            {(agent.status === 'offline' || agent.status === 'pausada') && (
              <p className="text-xs text-amber-500/80 mb-2">{agent.nome} está {agent.status}. Mensagens podem não ser processadas.</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Mensagem para ${agent.nome}…`}
                rows={1}
                disabled={sending || typing || agent.status === 'offline' || agent.status === 'pausada'}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none disabled:opacity-50 max-h-28 scrollbar-thin"
                style={{ lineHeight: '1.5' }}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 112) + 'px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-8 h-8 flex items-center justify-center bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
              >
                {sending || typing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── TAB: TAREFAS ────────────────────────────────────────────────────── */}
      {tab === 'tarefas' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
          <div className="px-4 py-3 border-b border-gray-800">
            <button
              onClick={() => setShowNovaTarefa(!showNovaTarefa)}
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300"
            >
              <Plus className="w-3.5 h-3.5" /> Nova tarefa
            </button>
            {showNovaTarefa && (
              <div className="mt-3 space-y-2">
                <input value={ntTitulo} onChange={(e) => setNtTitulo(e.target.value)} placeholder="Título *"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500" />
                <textarea value={ntDesc} onChange={(e) => setNtDesc(e.target.value)} placeholder="Descrição (opcional)" rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />
                <select value={ntPrio} onChange={(e) => setNtPrio(e.target.value as typeof ntPrio)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500">
                  <option value="baixa">Baixa</option><option value="normal">Normal</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={criarTarefa} disabled={ntLoading || !ntTitulo.trim()}
                    className="flex-1 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs rounded-lg">
                    {ntLoading ? 'Salvando...' : 'Criar'}
                  </button>
                  <button onClick={() => setShowNovaTarefa(false)}
                    className="flex-1 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700">Cancelar</button>
                </div>
              </div>
            )}
          </div>
          {loadingTab
            ? <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 text-brand-500 animate-spin" /></div>
            : <div className="divide-y divide-gray-800/50">
                {tarefas.length === 0 && <p className="text-center text-xs text-gray-600 py-8">Nenhuma tarefa</p>}
                {tarefas.map((t) => (
                  <div key={t.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      {t.status === 'concluida' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                        : t.status === 'erro' ? <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                        : <Clock className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{t.titulo}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORIDADE_COLOR[t.prioridade]}`}>{t.prioridade}</span>
                          <span className="text-xs text-gray-600 capitalize">{t.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>
                    {t.status === 'em_execucao' && (
                      <div className="w-full bg-gray-800 rounded-full h-1">
                        <div className="bg-brand-500 h-1 rounded-full transition-all" style={{ width: `${t.progresso_pct}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── TAB: MÉTRICAS ───────────────────────────────────────────────────── */}
      {tab === 'metricas' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total conversas',    value: agent.total_conversas },
              { label: 'Tarefas concluídas', value: agent.total_tarefas_concluidas },
              { label: 'Erros',              value: agent.total_tarefas_erro },
              { label: 'Uptime',             value: uptimeStr(agent.uptime_segundos) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-xl p-3">
                <p className="text-base font-bold text-white">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-gray-800 rounded-xl p-3 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Configuração</p>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Tipo</span>
              <span className="text-white capitalize">{agent.tipo}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Integração</span>
              <span className="text-white capitalize">{agent.integracao_tipo ?? '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">URL</span>
              <span className="text-white">{agent.integracao_url ? '🔗 Configurada' : '—'}</span>
            </div>
            {agent.personalidade?.tom && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Tom</span>
                <span className="text-white capitalize">{agent.personalidade.tom}</span>
              </div>
            )}
            {agent.personalidade?.idioma && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Idioma</span>
                <span className="text-white capitalize">{agent.personalidade.idioma}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: HISTÓRICO ──────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-gray-800/50 min-h-0">
          {loadingTab
            ? <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 text-brand-500 animate-spin" /></div>
            : historico.length === 0
              ? <p className="text-center text-xs text-gray-600 py-8">Nenhum histórico</p>
              : historico.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
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
                ))
          }
        </div>
      )}

      {/* ── TAB: ATIVIDADE ──────────────────────────────────────────────────── */}
      {tab === 'atividade' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-gray-800/50 min-h-0">
          {loadingTab
            ? <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 text-brand-500 animate-spin" /></div>
            : atividade.length === 0
              ? <p className="text-center text-xs text-gray-600 py-8">Nenhuma atividade</p>
              : atividade.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                    <MessageSquare className="w-3.5 h-3.5 text-gray-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-300">{m.remetente_nome}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{m.conteudo.slice(0, 100)}</p>
                    </div>
                    <span className="text-xs text-gray-700 flex-shrink-0">{timeAgo(m.created_at)}</span>
                  </div>
                ))
          }
        </div>
      )}
    </div>
  )
}
