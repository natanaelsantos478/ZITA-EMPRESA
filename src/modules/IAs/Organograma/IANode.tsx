import { MessageSquare, AlertCircle, CheckCircle2, Zap } from 'lucide-react'
import type { IaAgent } from '../../../types'

export const STATUS_COLOR: Record<string, string> = {
  online:    '#22c55e',
  ocupada:   '#eab308',
  aguardando:'#3b82f6',
  offline:   '#6b7280',
  erro:      '#ef4444',
  pausada:   '#f97316',
}

const STATUS_LABEL: Record<string, string> = {
  online:    'Online',
  ocupada:   'Ocupada',
  aguardando:'Aguardando',
  offline:   'Offline',
  erro:      'Erro',
  pausada:   'Pausada',
}

interface Props {
  agent: IaAgent
  selected: boolean
  onSelect: () => void
  onChat: () => void
  tarefasCount: number
  onHandleMouseDown?: (agentId: string, e: React.MouseEvent) => void
  isConnectingTarget?: boolean
}

export default function IANode({
  agent, selected, onSelect, onChat, tarefasCount,
  onHandleMouseDown, isConnectingTarget,
}: Props) {
  const isZeus = agent.tipo === 'zeus'
  const color = STATUS_COLOR[agent.status] ?? '#6b7280'
  const isPulsing = agent.status === 'ocupada'

  return (
    <div
      onClick={onSelect}
      className={`
        relative bg-gray-900 rounded-xl cursor-pointer select-none transition-all duration-200
        ${isZeus
          ? 'w-52 border-2 border-yellow-500/70 shadow-lg shadow-yellow-500/20'
          : 'w-44 border border-gray-700 hover:border-gray-500'
        }
        ${selected ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-gray-950' : ''}
        ${isConnectingTarget ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-gray-950 scale-105' : ''}
      `}
      style={{ borderColor: selected ? undefined : isZeus ? undefined : agent.cor_hex + '66' }}
    >
      {/* Status pulse ring */}
      {isPulsing && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping opacity-75"
          style={{ backgroundColor: color }}
        />
      )}

      {/* Handle de entrada (esquerda) — não aparece no Zeus */}
      {!isZeus && (
        <div
          data-handle-in={agent.id}
          title="Conectar entrada"
          className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white z-10 hover:scale-125 transition-transform"
          style={{ backgroundColor: isConnectingTarget ? '#22c55e' : '#374151', cursor: 'crosshair' }}
        />
      )}

      {/* Handle de saída (direita) */}
      <div
        data-handle-out={agent.id}
        title="Criar conexão"
        onMouseDown={(e) => { e.stopPropagation(); onHandleMouseDown?.(agent.id, e) }}
        className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white z-10 hover:scale-125 transition-transform cursor-crosshair"
        style={{ backgroundColor: agent.cor_hex || '#4e5eff' }}
      />

      <div className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`flex-shrink-0 flex items-center justify-center rounded-lg text-white font-bold
              ${isZeus ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm'}`}
            style={{ backgroundColor: agent.cor_hex || '#3a40f5' }}
          >
            {agent.avatar_url ? (
              <img src={agent.avatar_url} alt={agent.nome} className="w-full h-full rounded-lg object-cover" />
            ) : isZeus ? (
              <Zap className="w-5 h-5 text-yellow-300" />
            ) : (
              agent.nome.slice(0, 2).toUpperCase()
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
                title={STATUS_LABEL[agent.status]}
              />
              <span className={`font-semibold truncate ${isZeus ? 'text-sm text-yellow-300' : 'text-xs text-white'}`}>
                {agent.nome}
              </span>
            </div>
            {agent.funcao && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{agent.funcao}</p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-800 my-2" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {tarefasCount > 0 ? (
              <span className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                {tarefasCount}
              </span>
            ) : agent.status === 'erro' ? (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                Erro
              </span>
            ) : (
              <span className="text-xs text-gray-600 capitalize">{STATUS_LABEL[agent.status]}</span>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onChat() }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 px-2 py-1 rounded-md transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            chat
          </button>
        </div>
      </div>
    </div>
  )
}
