import { useState, useRef, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Plus, Link2, Link2Off, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useAgentStatus } from '../../../hooks/useAgentStatus'
import { useRealtime } from '../../../hooks/useRealtime'
import type { IaAgent, IaTarefa } from '../../../types'
import IANode, { STATUS_COLOR } from './IANode'
import ControleIAPanel from '../ControleIA/ControleIAPanel'
import ChatIA from '../Chat/ChatIA'

function makePath(x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
}

const NODE_W = 176  // w-44 = 176px; w-52 = 208px for zeus — use average
const NODE_H = 96

export default function CanvasView() {
  const { companyId, isAdmin } = useAuth()
  const { agents, loading } = useAgentStatus()

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 60, y: 60 })
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })
  const [showLines, setShowLines] = useState(true)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IaAgent | null>(null)
  const [tarefasCounts, setTarefasCounts] = useState<Record<string, number>>({})

  // Connection drag state
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [connectingLine, setConnectingLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // Selected connection for deletion
  const [selectedConn, setSelectedConn] = useState<string | null>(null) // child agent id

  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    agents.forEach((a) => { pos[a.id] = { x: a.organograma_x, y: a.organograma_y } })
    setPositions(pos)
  }, [agents])

  useEffect(() => {
    if (!companyId || agents.length === 0) return
    supabase.from('ia_tarefas').select('agent_id, status')
      .eq('company_id', companyId).eq('status', 'em_execucao')
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        data?.forEach((t: { agent_id: string }) => { counts[t.agent_id] = (counts[t.agent_id] ?? 0) + 1 })
        setTarefasCounts(counts)
      })
  }, [companyId, agents])

  useRealtime<IaTarefa & Record<string, unknown>>(
    'ia_tarefas', companyId ? `company_id=eq.${companyId}` : undefined,
    (t) => {
      setTarefasCounts((prev) => {
        const next = { ...prev }
        if (t.status === 'em_execucao') next[t.agent_id] = (next[t.agent_id] ?? 0) + 1
        else if (next[t.agent_id] > 0) next[t.agent_id] -= 1
        return next
      })
    }, 'UPDATE'
  )

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(2, Math.max(0.2, z - e.deltaY * 0.001)))
  }, [])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    if (connectingFrom) return
    setIsPanning(true)
    setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y })
    setSelectedConn(null)
  }, [pan, connectingFrom])

  // Convert screen coords → canvas coords
  const toCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom,
    }
  }, [pan, zoom])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: panStart.px + (e.clientX - panStart.mx), y: panStart.py + (e.clientY - panStart.my) })
      return
    }
    if (dragging) {
      const dx = (e.clientX - dragStart.mx) / zoom
      const dy = (e.clientY - dragStart.my) / zoom
      setPositions((prev) => ({ ...prev, [dragging]: { x: dragStart.ox + dx, y: dragStart.oy + dy } }))
      return
    }
    if (connectingFrom) {
      const fromAgent = agents.find((a) => a.id === connectingFrom)
      if (!fromAgent) return
      const pos = positions[connectingFrom] ?? { x: 0, y: 0 }
      const nodeW = fromAgent.tipo === 'zeus' ? 208 : NODE_W
      const x1 = pos.x + nodeW + 8
      const y1 = pos.y + NODE_H / 2
      const { x: x2, y: y2 } = toCanvas(e.clientX, e.clientY)
      setConnectingLine({ x1, y1, x2, y2 })
    }
  }, [isPanning, panStart, dragging, dragStart, zoom, connectingFrom, agents, positions, toCanvas])

  const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
    if (dragging) {
      const pos = positions[dragging]
      if (pos) {
        await supabase.from('ia_agents')
          .update({ organograma_x: Math.round(pos.x), organograma_y: Math.round(pos.y) })
          .eq('id', dragging)
      }
      setDragging(null)
    }
    setIsPanning(false)

    if (connectingFrom) {
      // Check if released over a handle-in
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const targetEl = el?.closest('[data-handle-in]') as HTMLElement | null
      const targetId = targetEl?.dataset.handleIn
      if (targetId && targetId !== connectingFrom) {
        await supabase.from('ia_agents')
          .update({ organograma_parent_id: connectingFrom })
          .eq('id', targetId)
      }
      setConnectingFrom(null)
      setConnectingLine(null)
    }
  }, [dragging, positions, connectingFrom])

  const startDrag = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const pos = positions[agentId] ?? { x: 0, y: 0 }
    setDragging(agentId)
    setDragStart({ mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y })
  }, [positions])

  const startConnect = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConnectingFrom(agentId)
    const fromAgent = agents.find((a) => a.id === agentId)
    if (!fromAgent) return
    const pos = positions[agentId] ?? { x: 0, y: 0 }
    const nodeW = fromAgent.tipo === 'zeus' ? 208 : NODE_W
    const { x: mx, y: my } = toCanvas(e.clientX, e.clientY)
    setConnectingLine({ x1: pos.x + nodeW + 8, y1: pos.y + NODE_H / 2, x2: mx, y2: my })
  }, [agents, positions, toCanvas])

  const deleteConnection = useCallback(async (childId: string) => {
    await supabase.from('ia_agents').update({ organograma_parent_id: null }).eq('id', childId)
    setSelectedConn(null)
  }, [])

  const centerAll = useCallback(() => { setZoom(0.8); setPan({ x: 80, y: 80 }) }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const connections: Array<{ from: string; to: string; status: string; childId: string }> = []
  agents.forEach((a) => {
    if (a.organograma_parent_id && positions[a.organograma_parent_id] && positions[a.id]) {
      connections.push({ from: a.organograma_parent_id, to: a.id, status: a.status, childId: a.id })
    }
  })

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-950">
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, #4b5563 1px, transparent 1px)',
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          backgroundPosition: `${pan.x % (32 * zoom)}px ${pan.y % (32 * zoom)}px`,
        }}
      />

      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 bg-gray-900 border border-gray-800 rounded-xl p-2 shadow-lg">
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} title="Zoom in" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))} title="Zoom out" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={centerAll} title="Centralizar" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="border-t border-gray-800 my-0.5" />
        <button
          onClick={() => setShowLines(!showLines)}
          className={`p-2 rounded-lg transition-colors ${showLines ? 'text-brand-400 bg-brand-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        >
          {showLines ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
        </button>
        {isAdmin && (
          <button
            onClick={() => window.location.assign('/configuracoes/ias')}
            title="Adicionar IA"
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/80 border border-gray-800 rounded-full px-3 py-1 text-xs text-gray-500">
        {Math.round(zoom * 100)}%
      </div>

      {/* Delete connection button */}
      {selectedConn && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => deleteConnection(selectedConn)}
            className="flex items-center gap-2 px-3 py-2 bg-red-900/80 border border-red-700 rounded-lg text-sm text-red-300 hover:bg-red-800"
          >
            <Trash2 className="w-4 h-4" />
            Remover conexão
          </button>
        </div>
      )}

      {/* Connecting hint */}
      {connectingFrom && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-yellow-900/80 border border-yellow-700 rounded-full px-4 py-1.5 text-xs text-yellow-300">
          Arraste até o handle de entrada de outro agente • ESC para cancelar
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`absolute inset-0 ${connectingFrom ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onKeyDown={(e) => { if (e.key === 'Escape') { setConnectingFrom(null); setConnectingLine(null) } }}
        tabIndex={0}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute' }}>

          {/* SVG layer */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '5000px', height: '4000px', pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Existing connections */}
            {showLines && connections.map(({ from, to, status, childId }) => {
              const fp = positions[from]
              const tp = positions[to]
              if (!fp || !tp) return null
              const fromAgent = agents.find((a) => a.id === from)
              const nodeW = fromAgent?.tipo === 'zeus' ? 208 : NODE_W
              const x1 = fp.x + nodeW
              const y1 = fp.y + NODE_H / 2
              const x2 = tp.x
              const y2 = tp.y + NODE_H / 2
              const color = STATUS_COLOR[status] ?? '#6b7280'
              const isSelected = selectedConn === childId
              const isActive = status === 'online' || status === 'ocupada'
              return (
                <g key={`${from}-${to}`} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={() => setSelectedConn(isSelected ? null : childId)}>
                  {/* Clickable wider invisible path */}
                  <path d={makePath(x1, y1, x2, y2)} fill="none" stroke="transparent" strokeWidth={12} />
                  <path
                    d={makePath(x1, y1, x2, y2)}
                    fill="none"
                    stroke={isSelected ? '#facc15' : color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeOpacity={isActive ? 0.8 : 0.4}
                    strokeDasharray={isActive ? undefined : '6,4'}
                    filter={isActive ? 'url(#glow)' : undefined}
                  >
                    {isActive && (
                      <animate attributeName="stroke-dashoffset" values="20;0" dur="1.5s" repeatCount="indefinite" />
                    )}
                  </path>
                  {/* Arrow head */}
                  <circle cx={x2} cy={y2} r={3} fill={isSelected ? '#facc15' : color} opacity={isActive ? 0.9 : 0.4} />
                </g>
              )
            })}

            {/* Temporary connecting line */}
            {connectingLine && (
              <path
                d={makePath(connectingLine.x1, connectingLine.y1, connectingLine.x2, connectingLine.y2)}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                strokeDasharray="6,4"
                strokeOpacity={0.7}
              />
            )}
          </svg>

          {/* Nodes */}
          {agents.map((agent) => {
            const pos = positions[agent.id] ?? { x: 0, y: 0 }
            const isTarget = connectingFrom !== null && connectingFrom !== agent.id && agent.tipo !== 'zeus'
            return (
              <div
                key={agent.id}
                data-node={agent.id}
                style={{ position: 'absolute', left: pos.x, top: pos.y }}
                onMouseDown={(e) => { if (!connectingFrom) startDrag(agent.id, e) }}
                onDoubleClick={() => setChatAgent(agent)}
              >
                <IANode
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  onSelect={() => setSelectedAgent(agent)}
                  onChat={() => setChatAgent(agent)}
                  tarefasCount={tarefasCounts[agent.id] ?? 0}
                  onHandleMouseDown={startConnect}
                  isConnectingTarget={isTarget}
                />
              </div>
            )
          })}

          {agents.length === 0 && (
            <div style={{ position: 'absolute', left: 200, top: 200, width: 400 }} className="flex flex-col items-center justify-center">
              <p className="text-gray-600 text-sm">Nenhuma IA cadastrada ainda.</p>
              {isAdmin && (
                <a href="/configuracoes/ias" className="text-brand-400 text-sm mt-1 hover:underline">
                  Adicionar primeira IA →
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedAgent && (
        <ControleIAPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} onChat={() => setChatAgent(selectedAgent)} />
      )}
      {chatAgent && <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />}
    </div>
  )
}
