import type { IaAgent } from '../../../types'

const STATUS_COLOR: Record<string, string> = {
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
  onClick: () => void
  dragging?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// CIRCLE_SIZE must match the offsets used in Escritorio2D SVG lines:
// circle center x = container_left + CONTAINER_W/2 = pos.x + 32
// circle center y = (pos.y - 32) + CIRCLE_SIZE/2   = pos.y - 10
// → when updating, keep CONTAINER_W=64 and CIRCLE_SIZE=44 consistent.
export const AGENT_CIRCLE_CX_OFFSET = 32  // half of 64px container
export const AGENT_CIRCLE_CY_OFFSET = -10 // (44/2) - 32px title bar offset

export default function Personagem2D({ agent, onClick, onMouseDown }: Props) {
  const color = agent.cor_hex || '#4e5eff'
  const statusColor = STATUS_COLOR[agent.status] ?? '#6b7280'
  const isZeus = agent.tipo === 'zeus'
  const initials = getInitials(agent.nome)

  return (
    <div
      className="flex flex-col items-center gap-1 cursor-pointer select-none group"
      style={{ width: '64px' }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={`${agent.nome}${agent.funcao ? ` — ${agent.funcao}` : ''} • ${STATUS_LABEL[agent.status] ?? agent.status}`}
    >
      {/* Circle avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="flex items-center justify-center font-semibold text-white text-[13px] transition-transform group-hover:scale-110"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: color,
            border: isZeus
              ? '2.5px solid #eab308'
              : '2px solid rgba(255,255,255,0.14)',
            boxShadow: isZeus
              ? `0 0 0 4px rgba(234,179,8,0.15), 0 3px 12px ${color}60`
              : `0 3px 12px ${color}50`,
          }}
        >
          {initials}
        </div>

        {/* Status dot — bottom-right */}
        <div
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: '12px',
            height: '12px',
            backgroundColor: statusColor,
            border: '2px solid #030712',
            boxShadow: `0 0 5px ${statusColor}99`,
          }}
        />
      </div>

      {/* Name */}
      <span
        className="text-[11px] font-medium text-center leading-tight truncate"
        style={{
          maxWidth: '64px',
          color: isZeus ? '#fde047' : '#e5e7eb',
        }}
      >
        {agent.nome}
      </span>

      {/* Role */}
      {agent.funcao && (
        <span
          className="text-[9px] text-center leading-tight truncate"
          style={{ maxWidth: '64px', color: '#6b7280' }}
        >
          {agent.funcao}
        </span>
      )}
    </div>
  )
}
