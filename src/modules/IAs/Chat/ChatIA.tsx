import { useEffect, useRef, useState } from 'react'
import {
  X, Send, RefreshCw, Loader2, Zap, ChevronDown, MessageSquare
} from 'lucide-react'
import type { IaAgent } from '../../../types'
import { useChat } from '../../../hooks/useChat'

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-green-500',
  ocupada: 'bg-yellow-500',
  aguardando: 'bg-blue-500',
  offline: 'bg-gray-500',
  erro: 'bg-red-500',
  pausada: 'bg-orange-500',
}

const SUGESTOES = [
  'Qual seu status atual?',
  'Liste tarefas em andamento',
  'Resumo das atividades de hoje',
  'Preciso de uma pausa agora',
]

interface Props {
  agent: IaAgent
  onClose: () => void
}

export default function ChatIA({ agent, onClose }: Props) {
  const { conversa, mensagens, loading, typing, initConversa, sendMessage } = useChat(agent.id)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    initConversa()
  }, [initConversa])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, typing])

  useEffect(() => {
    inputRef.current?.focus()
  }, [conversa])

  const handleSend = async () => {
    if (!texto.trim() || sending || typing) return
    const msg = texto.trim()
    setTexto('')
    setSending(true)
    await sendMessage(msg)
    setSending(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSugestao = (s: string) => {
    setTexto(s)
    inputRef.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col h-[600px] max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: agent.cor_hex || '#3a40f5' }}
          >
            {agent.avatar_url
              ? <img src={agent.avatar_url} alt={agent.nome} className="w-full h-full rounded-xl object-cover" />
              : agent.tipo === 'zeus'
                ? <Zap className="w-4 h-4 text-yellow-300" />
                : agent.nome.slice(0, 2).toUpperCase()
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{agent.nome}</p>
              {agent.tipo === 'zeus' && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">Mestre</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[agent.status] ?? 'bg-gray-500'}`} />
              <span className="text-xs text-gray-500 capitalize">{agent.status}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={initConversa}
              title="Nova conversa"
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            </div>
          ) : (
            <>
              {mensagens.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageSquare className="w-10 h-10 text-gray-700 mb-3" />
                  <p className="text-sm text-gray-500">Inicie uma conversa com {agent.nome}</p>
                  <p className="text-xs text-gray-700 mt-1">Use as sugestões abaixo ou escreva sua mensagem</p>
                </div>
              )}

              {mensagens.map((m) => {
                const isHuman = m.remetente_tipo === 'humano'
                const isSistema = m.remetente_tipo === 'sistema'
                const isAcao = !!m.acao_tipo

                if (isSistema) {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <span className="text-xs text-gray-600 bg-gray-800/50 px-3 py-1 rounded-full">
                        {m.conteudo}
                      </span>
                    </div>
                  )
                }

                if (isAcao) {
                  return (
                    <div key={m.id} className="mx-auto max-w-[85%]">
                      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-medium text-brand-400">{m.acao_tipo}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            m.acao_status === 'concluida' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'
                          }`}>{m.acao_status}</span>
                        </div>
                        <p className="text-xs text-gray-400">{m.conteudo}</p>
                        <p className="text-xs text-gray-700 mt-1">
                          {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={m.id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        isHuman
                          ? 'bg-brand-600 text-white rounded-br-sm'
                          : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                      }`}
                    >
                      {!isHuman && (
                        <p className="text-xs font-medium mb-1" style={{ color: agent.cor_hex || '#7487ff' }}>
                          {m.remetente_nome}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.conteudo}</p>
                      <p className={`text-xs mt-1 ${isHuman ? 'text-brand-200/70' : 'text-gray-600'}`}>
                        {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
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

        {/* Sugestões */}
        {mensagens.length === 0 && !loading && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => handleSugestao(s)}
                className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-brand-600/50 text-gray-400 hover:text-white rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-800">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Mensagem para ${agent.nome}…`}
                rows={1}
                disabled={sending || typing || agent.status === 'offline' || agent.status === 'pausada'}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none disabled:opacity-50 max-h-32 scrollbar-thin"
                style={{ lineHeight: '1.5' }}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 128) + 'px'
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!texto.trim() || sending || typing || agent.status === 'offline' || agent.status === 'pausada'}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              {sending || typing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>
          {(agent.status === 'offline' || agent.status === 'pausada') && (
            <p className="text-xs text-amber-500/80 mt-2 flex items-center gap-1">
              <ChevronDown className="w-3 h-3" />
              {agent.nome} está {agent.status}. Mensagens podem não ser processadas.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
