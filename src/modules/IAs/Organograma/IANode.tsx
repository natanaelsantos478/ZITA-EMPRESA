import { useRef, useCallback } from 'react'
import type { IAAgent } from '../../../types'

interface IANodeProps {
  agent: IAAgent
  selected: boolean
  onClick: (agent: IAAgent) => void
  onDoubleClick: (agent: IAAgent) => void
  onDragEnd: (agentId: string, x: number, y: number) => void
}

const STATUS_COLORS: Record<IAAgent['status'], string> = {
  online: '#34d399',
  busy: '#fbbf24',
  offline: '#6b7280',
  error: '#f87171',
}

const STATUS_SHADOWS: Record<IAAgent['status'], string> = {
  online: '0 0 6px rgba(52,211,153,0.7)',
  busy: '0 0 6px rgba(251,191,36,0.7)',
  offline: 'none',
  error: '0 0 6px rgba(248,113,113,0.7)',
}

export default function IANode({ agent, selected, onClick, onDoubleClick, onDragEnd }: IANodeProps) {
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      isDragging.current = false
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: agent.organograma_x,
        origY: agent.organograma_y,
      }

      function onMove(me: MouseEvent) {
        if (!dragState.current || !nodeRef.current) return
        const dx = me.clientX - dragState.current.startX
        const dy = me.clientY - dragState.current.startY
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true
        nodeRef.current.style.left = `${dragState.current.origX + dx}px`
        nodeRef.current.style.top = `${dragState.current.origY + dy}px`
        nodeRef.current.classList.add('ia-node-dragging')
      }

      function onUp(ue: MouseEvent) {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (!nodeRef.current) return
        nodeRef.current.classList.remove('ia-node-dragging')
        if (isDragging.current && dragState.current) {
          const dx = ue.clientX - dragState.current.startX
          const dy = ue.clientY - dragState.current.startY
          const newX = dragState.current.origX + dx
          const newY = dragState.current.origY + dy
          onDragEnd(agent.id, newX, newY)
        }
        dragState.current = null
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [agent, onDragEnd],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!isDragging.current) onClick(agent)
    },
    [agent, onClick],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDoubleClick(agent)
    },
    [agent, onDoubleClick],
  )

  const size = agent.is_zeus ? 84 : 64
  const fontSize = agent.is_zeus ? '2rem' : '1.5rem'

  return (
    <div
      ref={nodeRef}
      style={{
        position: 'absolute',
        left: agent.organograma_x,
        top: agent.organograma_y,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        cursor: 'grab',
        userSelect: 'none',
        zIndex: selected ? 20 : agent.is_zeus ? 10 : 5,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Avatar circle */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: agent.color + '22',
          border: `${agent.is_zeus ? 3 : 2}px solid ${agent.color}`,
          boxShadow: selected
            ? `0 0 0 3px rgba(74,158,255,0.5), ${agent.is_zeus ? '0 0 20px rgba(245,200,66,0.6)' : ''}`
            : agent.is_zeus
              ? '0 0 20px rgba(245,200,66,0.4)'
              : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          transition: 'box-shadow 0.2s',
        }}
      >
        {agent.emoji}
      </div>

      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          bottom: agent.is_zeus ? 4 : 2,
          right: agent.is_zeus ? 4 : 2,
          width: agent.is_zeus ? 14 : 10,
          height: agent.is_zeus ? 14 : 10,
          borderRadius: '50%',
          backgroundColor: STATUS_COLORS[agent.status],
          boxShadow: STATUS_SHADOWS[agent.status],
          border: '2px solid #13161e',
          transition: 'background-color 0.3s, box-shadow 0.3s',
        }}
      />

      {/* Name label */}
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 6,
          whiteSpace: 'nowrap',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            color: agent.is_zeus ? '#f5c842' : '#e8eaf0',
            fontSize: agent.is_zeus ? '0.8rem' : '0.72rem',
            fontWeight: agent.is_zeus ? 700 : 500,
          }}
        >
          {agent.name}
        </p>
        {agent.is_zeus && (
          <p style={{ color: '#f5c842', fontSize: '0.65rem', opacity: 0.7 }}>Orquestrador</p>
        )}
      </div>
    </div>
  )
}
