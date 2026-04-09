import type { IaAgent } from '../../../types'

const STATUS_COLOR: Record<string, string> = {
  online:    '#22c55e',
  ocupada:   '#eab308',
  aguardando:'#3b82f6',
  offline:   '#6b7280',
  erro:      '#ef4444',
  pausada:   '#f97316',
}

const FACE_OPTIONS = ['😐', '😊', '🤖', '😎', '🧠']

interface Props {
  agent: IaAgent
  onClick: () => void
  dragging?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
}

export default function Personagem2D({ agent, onClick, onMouseDown }: Props) {
  const color = agent.cor_hex || '#4e5eff'
  const statusColor = STATUS_COLOR[agent.status] ?? '#6b7280'
  const faceIdx = (agent.integracao_config?.avatar_2d as any)?.rosto ?? 0
  const face = FACE_OPTIONS[faceIdx] ?? '😐'
  const isZeus = agent.tipo === 'zeus'

  return (
    <div
      className="flex flex-col items-center gap-1 cursor-pointer select-none group"
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={agent.nome}
    >
      {/* Status dot */}
      <div
        className="w-2.5 h-2.5 rounded-full border border-gray-900 mb-0.5"
        style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
      />

      {/* Character SVG */}
      <svg width={isZeus ? 52 : 44} height={isZeus ? 68 : 58} viewBox="0 0 44 58" className="group-hover:scale-110 transition-transform">
        {/* Shadow */}
        <ellipse cx="22" cy="56" rx="12" ry="3" fill="rgba(0,0,0,0.3)" />
        {/* Body */}
        <rect x="12" y="26" width="20" height="22" rx="6" fill={color} />
        {/* Arms */}
        <rect x="4" y="28" width="8" height="4" rx="2" fill={color} />
        <rect x="32" y="28" width="8" height="4" rx="2" fill={color} />
        {/* Head */}
        <circle cx="22" cy="16" r="12" fill={color} />
        {/* Face overlay */}
        <text x="22" y="20" textAnchor="middle" fontSize="12">{face}</text>
        {/* Zeus crown */}
        {isZeus && (
          <text x="22" y="6" textAnchor="middle" fontSize="10">👑</text>
        )}
        {/* Shine */}
        <circle cx="18" cy="12" r="3" fill="rgba(255,255,255,0.2)" />
      </svg>

      {/* Name */}
      <span
        className={`text-xs font-medium text-center max-w-[72px] truncate ${isZeus ? 'text-yellow-300' : 'text-gray-200'}`}
      >
        {agent.nome}
      </span>
      {agent.funcao && (
        <span className="text-[10px] text-gray-500 max-w-[72px] truncate">{agent.funcao}</span>
      )}
    </div>
  )
}
