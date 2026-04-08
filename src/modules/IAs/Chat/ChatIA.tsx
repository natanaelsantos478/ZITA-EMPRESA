import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useChat } from '../../../hooks/useChat'
import type { IAAgent, ChatMessage } from '../../../types'

interface ChatIAProps {
  agent: IAAgent
  companyId: string
  compact?: boolean
}

const QUICK_SUGGESTIONS = [
  'Qual é seu status atual?',
  'Mostre um resumo das últimas tarefas',
  'Execute uma análise rápida',
  'O que você pode fazer por mim?',
]

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 animate-fade-in-up">
      <div className="w-7 h-7 rounded-full bg-dark-600 border border-dark-500 flex items-center justify-center text-xs flex-shrink-0">
        🤖
      </div>
      <div className="bg-dark-700 rounded-2xl rounded-tl-sm px-4 py-3 border border-dark-500">
        <span className="typing-dot text-gray-400 text-lg">•</span>
        <span className="typing-dot text-gray-400 text-lg">•</span>
        <span className="typing-dot text-gray-400 text-lg">•</span>
      </div>
    </div>
  )
}

function ActionCard({ data }: { data: Record<string, unknown> }) {
  const type = (data.type as string) ?? 'info'
  const title = (data.title as string) ?? 'Ação executada'
  const details = data.details as Record<string, unknown> | undefined

  const colors: Record<string, string> = {
    info: 'border-blue-500/30 bg-blue-500/5',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    error: 'border-red-500/30 bg-red-500/5',
  }

  const icons: Record<string, string> = {
    info: 'ℹ',
    success: '✅',
    warning: '⚠',
    error: '❌',
  }

  return (
    <div className={`rounded-xl p-3 border ${colors[type] ?? colors.info} text-sm`}>
      <div className="flex items-center gap-2 font-medium text-white mb-1">
        <span>{icons[type] ?? icons.info}</span>
        {title}
      </div>
      {details && (
        <div className="space-y-0.5 mt-1">
          {Object.entries(details).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs text-gray-300">
              <span className="text-gray-500 capitalize">{k}:</span>
              <span>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg, agentEmoji }: { msg: ChatMessage; agentEmoji: string }) {
  const isUser = msg.role === 'user'

  if (msg.is_action && msg.action_data) {
    return (
      <div className="px-2 py-1">
        <ActionCard data={msg.action_data} />
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-2 animate-fade-in-up ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-dark-600 border border-dark-500 flex items-center justify-center text-xs flex-shrink-0 mb-1">
          {agentEmoji}
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent text-white rounded-br-sm'
            : 'bg-dark-700 text-gray-100 border border-dark-500 rounded-bl-sm'
        }`}
      >
        {msg.content}
        <div className={`text-xs mt-1 opacity-60 ${isUser ? 'text-right' : ''}`}>
          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

export default function ChatIA({ agent, companyId, compact = false }: ChatIAProps) {
  const { messages, loading, sending, isTyping, sendMessage, clearHistory } = useChat(agent.id, companyId)
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setShowSuggestions(false)
    await sendMessage(text)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSuggestion(text: string) {
    setInput(text)
    textareaRef.current?.focus()
    setShowSuggestions(false)
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'h-[560px]'}`}>
      {/* Header (non-compact) */}
      {!compact && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-500">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
            style={{ backgroundColor: agent.color + '22', border: `2px solid ${agent.color}` }}
          >
            {agent.emoji}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white text-sm">{agent.name}</p>
            <p className="text-xs text-gray-400">{agent.model ?? 'sem API configurada'}</p>
          </div>
          <button
            onClick={clearHistory}
            title="Limpar conversa"
            className="text-gray-400 hover:text-red-400 transition-colors text-sm p-1"
          >
            🗑
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="text-center py-6 text-gray-400">
            <p className="text-3xl mb-2">{agent.emoji}</p>
            <p className="text-sm">Inicie uma conversa com {agent.name}</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} agentEmoji={agent.emoji} />
        ))}

        {isTyping && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {showSuggestions && messages.length === 0 && !loading && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="text-xs px-2.5 py-1.5 rounded-full bg-dark-700 border border-dark-500 text-gray-300 hover:border-accent hover:text-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="px-3 pb-3 pt-1 border-t border-dark-500">
        <div className="flex items-end gap-2 bg-dark-700 rounded-xl border border-dark-500 px-3 py-2 focus-within:border-accent transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none max-h-24"
            placeholder={`Mensagem para ${agent.name}... (Enter para enviar)`}
            maxLength={2000}
            disabled={sending}
            style={{ overflowY: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              '➤'
            )}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1 text-right">{input.length}/2000</p>
      </div>
    </div>
  )
}
