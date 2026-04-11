/**
 * EcosystemPanel.tsx
 * Painel lateral para interagir com o ecossistema de IAs:
 * - Enviar ações (pergunta / comando / broadcast)
 * - Ver histórico da fila
 * - Gerenciar memórias compartilhadas
 */
import { useState, useEffect, useCallback } from 'react'
import { X, Send, Brain, Zap, Clock, CheckCircle, AlertCircle, Loader2, Trash2, Eye } from 'lucide-react'
import type { IaAgent } from '../../../types'
import type { IaAcao, IaMemoria } from '../../../hooks/useEcosystem'
import type { AcaoTipo, AcaoPrio, MemoriaTipo, MemoriaViz } from '../../../lib/ecosystem/EcosystemEngine'

interface Props {
  agents:       IaAgent[]
  onClose:      () => void
  sendAction:   (params: {
    de_agent_id?: string | null
    para_agent_id: string
    tipo?: AcaoTipo
    prioridade?: AcaoPrio
    payload: Record<string, unknown>
  }) => Promise<string | null>
  zeusBroadcast: (zeusId: string, mensagem: string, prioridade?: AcaoPrio) => Promise<void>
  fetchHistory:  (limit?: number) => Promise<IaAcao[]>
  fetchMemories: (agentId: string) => Promise<IaMemoria[]>
  saveMemoria:   (params: {
    agent_id: string; tipo?: MemoriaTipo; titulo?: string; conteudo: string
    tags?: string[]; visibilidade?: MemoriaViz; importancia?: number
    expira_em?: Date; origem_acao_id?: string
  }) => Promise<IaMemoria | null>
  pendingCount:  number
  isProcessing:  boolean
}

type Tab = 'enviar' | 'fila' | 'memorias'

const TIPO_LABELS: Record<AcaoTipo, string> = {
  pergunta:   '❓ Pergunta',
  comando:    '⚡ Comando',
  delegacao:  '📋 Delegação',
  relatorio:  '📊 Relatório',
  memoria:    '🧠 Memória',
  broadcast:  '📢 Broadcast',
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pendente:         { icon: <Clock className="w-3 h-3" />,        color: 'text-yellow-400', label: 'Pendente' },
  em_processamento: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-blue-400', label: 'Processando' },
  concluida:        { icon: <CheckCircle className="w-3 h-3" />,  color: 'text-green-400',  label: 'Concluída' },
  erro:             { icon: <AlertCircle className="w-3 h-3" />,  color: 'text-red-400',    label: 'Erro' },
  expirada:         { icon: <Clock className="w-3 h-3" />,        color: 'text-gray-500',   label: 'Expirada' },
  cancelada:        { icon: <X className="w-3 h-3" />,            color: 'text-gray-500',   label: 'Cancelada' },
}

const PRIO_COLORS: Record<string, string> = {
  baixa:   'bg-gray-700 text-gray-400',
  normal:  'bg-blue-900/40 text-blue-300',
  alta:    'bg-orange-900/40 text-orange-300',
  urgente: 'bg-red-900/40 text-red-300',
}

export default function EcosystemPanel({
  agents, onClose, sendAction, zeusBroadcast,
  fetchHistory, fetchMemories, saveMemoria,
  pendingCount, isProcessing,
}: Props) {
  const [tab,          setTab]          = useState<Tab>('enviar')
  const [history,      setHistory]      = useState<IaAcao[]>([])
  const [memories,     setMemories]     = useState<IaMemoria[]>([])
  const [loadingHist,  setLoadingHist]  = useState(false)
  const [loadingMem,   setLoadingMem]   = useState(false)
  const [sending,      setSending]      = useState(false)
  const [sentOk,       setSentOk]       = useState(false)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  // Form state
  const zeus       = agents.find(a => a.tipo === 'zeus')
  const [fromId,   setFromId]   = useState(zeus?.id ?? '')
  const [toId,     setToId]     = useState('')
  const [tipo,     setTipo]     = useState<AcaoTipo>('pergunta')
  const [prio,     setPrio]     = useState<AcaoPrio>('normal')
  const [msg,      setMsg]      = useState('')
  const [isBcast,  setIsBcast]  = useState(false)

  // Memory form
  const [memAgent, setMemAgent]  = useState(zeus?.id ?? '')
  const [memTitulo, setMemTitulo] = useState('')
  const [memConteudo, setMemConteudo] = useState('')
  const [memViz,    setMemViz]   = useState<'privada' | 'equipe' | 'global'>('equipe')
  const [memImp,    setMemImp]   = useState(5)
  const [memTags,   setMemTags]  = useState('')
  const [savingMem, setSavingMem] = useState(false)

  const loadHistory = useCallback(async () => {
    setLoadingHist(true)
    const h = await fetchHistory(60)
    setHistory(h)
    setLoadingHist(false)
  }, [fetchHistory])

  const loadMemories = useCallback(async () => {
    if (!memAgent) return
    setLoadingMem(true)
    const m = await fetchMemories(memAgent)
    setMemories(m)
    setLoadingMem(false)
  }, [fetchMemories, memAgent])

  useEffect(() => {
    if (tab === 'fila')     loadHistory()
    if (tab === 'memorias') loadMemories()
  }, [tab, loadHistory, loadMemories])

  const handleSend = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      if (isBcast && zeus) {
        await zeusBroadcast(zeus.id, msg.trim(), prio)
      } else if (toId) {
        const payload: Record<string, unknown> =
          tipo === 'pergunta'  ? { pergunta: msg.trim() }     :
          tipo === 'comando'   ? { comando:  msg.trim() }     :
          tipo === 'delegacao' ? { tarefa:   msg.trim() }     :
          tipo === 'broadcast' ? { mensagem: msg.trim() }     :
                                 { conteudo: msg.trim() }
        await sendAction({ de_agent_id: fromId || null, para_agent_id: toId, tipo, prioridade: prio, payload })
      }
      setMsg('')
      setSentOk(true)
      setTimeout(() => setSentOk(false), 2500)
    } finally {
      setSending(false)
    }
  }

  const handleSaveMem = async () => {
    if (!memConteudo.trim() || !memAgent) return
    setSavingMem(true)
    await saveMemoria({
      agent_id:    memAgent,
      tipo:        'fato',
      titulo:      memTitulo.trim() || undefined,
      conteudo:    memConteudo.trim(),
      tags:        memTags.split(',').map(t => t.trim()).filter(Boolean),
      visibilidade: memViz,
      importancia: memImp,
    })
    setMemTitulo(''); setMemConteudo(''); setMemTags('')
    await loadMemories()
    setSavingMem(false)
  }

  const agentName = (id: string | null) => {
    if (!id) return 'Humano'
    return agents.find(a => a.id === id)?.nome ?? id.slice(0, 8) + '…'
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] z-40 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <Brain className="w-5 h-5 text-brand-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Ecossistema de IAs</p>
          <div className="flex items-center gap-2 mt-0.5">
            {isProcessing && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Processando…
              </span>
            )}
            {pendingCount > 0 && !isProcessing && (
              <span className="text-xs text-yellow-400">{pendingCount} pendente{pendingCount !== 1 ? 's' : ''}</span>
            )}
            {pendingCount === 0 && !isProcessing && (
              <span className="text-xs text-gray-600">Fila vazia</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 flex-shrink-0">
        {(['enviar', 'fila', 'memorias'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors capitalize ${
              tab === t
                ? 'text-brand-400 border-b-2 border-brand-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'enviar' ? '📤 Enviar' : t === 'fila' ? '📬 Fila' : '🧠 Memórias'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── TAB: Enviar ──────────────────────────────────────────────────── */}
        {tab === 'enviar' && (
          <div className="p-4 space-y-3">

            {/* Broadcast toggle */}
            {zeus && (
              <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-gray-700 hover:border-brand-600/50 transition-colors">
                <input
                  type="checkbox"
                  checked={isBcast}
                  onChange={e => setIsBcast(e.target.checked)}
                  className="accent-brand-500"
                />
                <div>
                  <p className="text-xs font-medium text-white flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" /> Zeus Broadcast
                  </p>
                  <p className="text-xs text-gray-500">Envia para todos os subordinados de uma vez</p>
                </div>
              </label>
            )}

            {!isBcast && (
              <>
                {/* De */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">De (IA remetente)</label>
                  <select
                    value={fromId}
                    onChange={e => setFromId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">— Humano/Sistema —</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.nome} ({a.tipo})</option>
                    ))}
                  </select>
                </div>

                {/* Para */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Para (IA destinatária) *</label>
                  <select
                    value={toId}
                    onChange={e => setToId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Selecionar IA…</option>
                    {agents.filter(a => a.id !== fromId).map(a => (
                      <option key={a.id} value={a.id}>{a.nome} ({a.tipo}) [{a.status}]</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Tipo + Prioridade */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value as AcaoTipo)}
                  disabled={isBcast}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 disabled:opacity-50"
                >
                  <option value="pergunta">❓ Pergunta</option>
                  <option value="comando">⚡ Comando</option>
                  <option value="delegacao">📋 Delegação</option>
                  <option value="broadcast">📢 Broadcast</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Prioridade</label>
                <select
                  value={prio}
                  onChange={e => setPrio(e.target.value as AcaoPrio)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">🚨 Urgente</option>
                </select>
              </div>
            </div>

            {/* Mensagem */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {isBcast ? 'Mensagem de broadcast' :
                 tipo === 'pergunta'  ? 'Pergunta' :
                 tipo === 'comando'   ? 'Comando a executar' :
                 tipo === 'delegacao' ? 'Tarefa a delegar' : 'Mensagem'}
              </label>
              <textarea
                value={msg}
                onChange={e => setMsg(e.target.value)}
                placeholder={
                  tipo === 'pergunta'  ? 'O que você quer perguntar para essa IA?' :
                  tipo === 'comando'   ? 'Ex: Analisar o relatório de vendas de março' :
                  tipo === 'delegacao' ? 'Ex: Criar relatório mensal de RH até sexta' :
                  'Mensagem para o ecossistema…'
                }
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={sending || (!isBcast && !toId) || !msg.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sentOk ? '✓ Enviado!' : sending ? 'Enviando…' : isBcast ? 'Broadcast para todos' : 'Enviar para IA'}
            </button>

            {/* Info box */}
            <div className="p-3 bg-gray-800/50 rounded-xl border border-gray-700/50 text-xs text-gray-500 space-y-1">
              <p>💡 <strong className="text-gray-400">A ação fica em fila</strong> se a IA estiver offline.</p>
              <p>⚡ Processada automaticamente quando o computador ligar.</p>
              <p>🧠 Zeus processa 24h via Edge Function agendada.</p>
            </div>
          </div>
        )}

        {/* ── TAB: Fila ────────────────────────────────────────────────────── */}
        {tab === 'fila' && (
          <div>
            <div className="px-4 py-3 border-b border-gray-800/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">{history.length} ações recentes</p>
              <button onClick={loadHistory} className="text-xs text-brand-400 hover:text-brand-300">
                Atualizar
              </button>
            </div>

            {loadingHist ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-gray-600 text-sm">Nenhuma ação ainda</div>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {history.map(a => {
                  const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.pendente
                  const isExp = expandedId === a.id
                  return (
                    <div key={a.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 flex-shrink-0 ${sc.color}`}>{sc.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium text-white">{agentName(a.de_agent_id)}</span>
                            <span className="text-xs text-gray-600">→</span>
                            <span className="text-xs font-medium text-brand-400">{agentName(a.para_agent_id)}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIO_COLORS[a.prioridade]}`}>
                              {a.prioridade}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">{TIPO_LABELS[a.tipo]}</span>
                            <span className={`text-xs ${sc.color}`}>{sc.label}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 truncate">
                            {(a.payload.pergunta ?? a.payload.comando ?? a.payload.tarefa ?? a.payload.mensagem ?? '') as string}
                          </p>
                          {a.resultado && (
                            <button
                              onClick={() => setExpandedId(isExp ? null : a.id)}
                              className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 mt-1"
                            >
                              <Eye className="w-3 h-3" />
                              {isExp ? 'Fechar' : 'Ver resultado'}
                            </button>
                          )}
                          {isExp && a.resultado && (
                            <div className="mt-2 p-2 bg-gray-800 rounded-lg text-xs text-gray-300 max-h-32 overflow-y-auto">
                              {(a.resultado.resposta as string) ?? JSON.stringify(a.resultado, null, 2)}
                            </div>
                          )}
                          {a.erro_mensagem && (
                            <p className="text-xs text-red-400 mt-1 truncate">{a.erro_mensagem}</p>
                          )}
                          <p className="text-xs text-gray-700 mt-1">
                            {new Date(a.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Memórias ────────────────────────────────────────────────── */}
        {tab === 'memorias' && (
          <div>
            {/* Selector de agente */}
            <div className="px-4 py-3 border-b border-gray-800/50">
              <select
                value={memAgent}
                onChange={e => { setMemAgent(e.target.value) }}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.nome} — memórias visíveis</option>
                ))}
              </select>
            </div>

            {/* Nova memória */}
            <div className="px-4 py-3 border-b border-gray-800/50 space-y-2">
              <p className="text-xs font-semibold text-gray-400">+ Nova memória</p>
              <input
                value={memTitulo}
                onChange={e => setMemTitulo(e.target.value)}
                placeholder="Título (opcional)"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
              <textarea
                value={memConteudo}
                onChange={e => setMemConteudo(e.target.value)}
                placeholder="Conteúdo da memória…"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={memViz}
                  onChange={e => setMemViz(e.target.value as 'privada' | 'equipe' | 'global')}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="privada">🔒 Privada</option>
                  <option value="equipe">👥 Equipe</option>
                  <option value="global">🌐 Global</option>
                </select>
                <select
                  value={memImp}
                  onChange={e => setMemImp(Number(e.target.value))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option key={n} value={n}>Imp. {n}</option>
                  ))}
                </select>
                <input
                  value={memTags}
                  onChange={e => setMemTags(e.target.value)}
                  placeholder="tags, vírgula"
                  className="bg-gray-800 border border-gray-700 rounded-xl px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none"
                />
              </div>
              <button
                onClick={handleSaveMem}
                disabled={!memConteudo.trim() || savingMem}
                className="w-full py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition-colors"
              >
                {savingMem ? 'Salvando…' : '💾 Salvar memória'}
              </button>
            </div>

            {/* Lista de memórias */}
            <div>
              {loadingMem ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
                </div>
              ) : memories.length === 0 ? (
                <p className="text-center py-8 text-xs text-gray-600">Nenhuma memória encontrada</p>
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {memories.map(m => (
                    <div key={m.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium text-white">
                              {m.titulo ?? '(sem título)'}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              m.visibilidade === 'global' ? 'bg-green-900/40 text-green-400' :
                              m.visibilidade === 'equipe' ? 'bg-blue-900/40 text-blue-400' :
                              'bg-gray-700 text-gray-500'
                            }`}>{m.visibilidade}</span>
                            <span className="text-xs text-gray-600">[{m.tipo}]</span>
                            <span className="text-xs text-yellow-600">★{m.importancia}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.conteudo}</p>
                          {m.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {m.tags.map(tag => (
                                <span key={tag} className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-gray-700 mt-1">
                            {agentName(m.agent_id)} · {new Date(m.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <button className="text-gray-600 hover:text-red-400 flex-shrink-0 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
