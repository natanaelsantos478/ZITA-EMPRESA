import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ZoomIn, ZoomOut, Maximize2, Plus, Link2, Link2Off, Loader2
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAgentStatus } from '../hooks/useAgentStatus'
import { useRealtime } from '../hooks/useRealtime'
import type { IaAgent, IaTarefa } from '../types'
import IANode from '../modules/IAs/Organograma/IANode'
import ControleIAPanel from '../modules/IAs/ControleIA/ControleIAPanel'
import ChatIA from '../modules/IAs/Chat/ChatIA'

const STATUS_COLOR: Record<string, string> = {
  online:    '#22c55e',
  ocupada:   '#eab308',
  aguardando:'#3b82f6',
  offline:   '#6b7280',
  erro:      '#ef4444',
  pausada:   '#f97316',
}

// Build SVG bezier path between two points
function makePath(x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
}

export default function Organograma() {
  const { companyId, isAdmin } = useAuth()
  const { agents, loading } = useAgentStatus()

  // Canvas state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 60, y: 60 })
  const [dragging, setDragging] = useState<string | null>(null) // agent id being dragged
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })
  const [showLines, setShowLines] = useState(true)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  // UI state
  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IaAgent | null>(null)
  const [tarefasCounts, setTarefasCounts] = useState<Record<string, number>>({})

  const canvasRef = useRef<HTMLDivElement>(null)

  // Initialise positions from DB
  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    agents.forEach((a) => {
      pos[a.id] = { x: a.organograma_x, y: a.organograma_y }
    })
    setPositions(pos)
  }, [agents])

  // Load tarefa counts
  useEffect(() => {
    if (!companyId || agents.length === 0) return
    supabase
      .from('ia_tarefas')
      .select('agent_id, status')
      .eq('company_id', companyId)
      .eq('status', 'em_execucao')
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        data?.forEach((t: { agent_id: string }) => {
          counts[t.agent_id] = (counts[t.agent_id] ?? 0) + 1
        })
        setTarefasCounts(counts)
      })
  }, [companyId, agents])

  // Realtime tarefa updates
  useRealtime<IaTarefa & Record<string, unknown>>(
    'ia_tarefas',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (t) => {
      setTarefasCounts((prev) => {
        const next = { ...prev }
        if (t.status === 'em_execucao') next[t.agent_id] = (next[t.agent_id] ?? 0) + 1
        else if (next[t.agent_id] > 0) next[t.agent_id] -= 1
        return next
      })
    },
    'UPDATE'
  )

  // Zoom on wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(1.5, Math.max(0.3, z - e.deltaY * 0.001)))
  }, [])

  // Pan on canvas background
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    setIsPanning(true)
    setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y })
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: panStart.px + (e.clientX - panStart.mx),
        y: panStart.py + (e.clientY - panStart.my),
      })
      return
    }
    if (dragging) {
      const dx = (e.clientX - dragStart.mx) / zoom
      const dy = (e.clientY - dragStart.my) / zoom
      setPositions((prev) => ({
        ...prev,
        [dragging]: { x: dragStart.ox + dx, y: dragStart.oy + dy },
      }))
    }
  }, [isPanning, panStart, dragging, dragStart, zoom])

  const handleMouseUp = useCallback(async () => {
    if (dragging) {
      const pos = positions[dragging]
      if (pos) {
        await supabase
          .from('ia_agents')
          .update({ organograma_x: Math.round(pos.x), organograma_y: Math.round(pos.y) })
          .eq('id', dragging)
      }
      setDragging(null)
    }
    setIsPanning(false)
  }, [dragging, positions])

  const startDrag = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const pos = positions[agentId] ?? { x: 0, y: 0 }
    setDragging(agentId)
    setDragStart({ mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y })
  }, [positions])

  const centerAll = useCallback(() => {
    setZoom(0.8)
    setPan({ x: 80, y: 80 })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    )
  }

  // Build connection map: parentId → child nodes
  const connections: Array<{ from: string; to: string; status: string }> = []
  agents.forEach((a) => {
    if (a.organograma_parent_id && positions[a.organograma_parent_id] && positions[a.id]) {
      connections.push({ from: a.organograma_parent_id, to: a.id, status: a.status })
    }
  })

  // Node card dimensions (approx)
  const nodeW = 176
  const nodeH = 96

  return (
    <div className="relative w-full h-[calc(100vh-56px)] overflow-hidden bg-gray-950">
      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, #4b5563 1px, transparent 1px)',
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          backgroundPosition: `${pan.x % (32 * zoom)}px ${pan.y % (32 * zoom)}px`,
        }}
      />

      {/* Floating toolbar */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 bg-gray-900 border border-gray-800 rounded-xl p-2 shadow-lg">
        <button onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} title="Zoom in" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} title="Zoom out" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={centerAll} title="Centralizar" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="border-t border-gray-800 my-0.5" />
        <button
          onClick={() => setShowLines(!showLines)}
          title={showLines ? 'Ocultar linhas' : 'Mostrar linhas'}
          className={`p-2 rounded-lg transition-colors ${showLines ? 'text-brand-400 bg-brand-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        >
          {showLines ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
        </button>
        {isAdmin && (
          <button
            onClick={() => window.location.assign('/configuracoes/ias')}
            title="Adicionar IA"
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/80 border border-gray-800 rounded-full px-3 py-1 text-xs text-gray-500">
        {Math.round(zoom * 100)}%
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
          }}
        >
          {/* SVG connections */}
          {showLines && (
            <svg
              style={{ position: 'absolute', top: 0, left: 0, width: '4000px', height: '3000px', pointerEvents: 'none' }}
            >
              {connections.map(({ from, to, status }) => {
                const fp = positions[from]
                const tp = positions[to]
                if (!fp || !tp) return null
                const x1 = fp.x + nodeW / 2
                const y1 = fp.y + nodeH
                const x2 = tp.x + nodeW / 2
                const y2 = tp.y
                const color = STATUS_COLOR[status] ?? '#6b7280'
                const isOccupied = status === 'ocupada'
                return (
                  <path
                    key={`${from}-${to}`}
                    d={makePath(x1, y1, x2, y2)}
                    fill="none"
                    stroke={color}
                    strokeWidth={isOccupied ? 2 : 1.5}
                    strokeOpacity={0.6}
                    strokeDasharray={isOccupied ? '8,4' : undefined}
                  >
                    {isOccupied && (
                      <animate attributeName="stroke-dashoffset" values="24;0" dur="1s" repeatCount="indefinite" />
                    )}
                  </path>
                )
              })}
            </svg>
          )}

          {/* IA Nodes */}
          {agents.map((agent) => {
            const pos = positions[agent.id] ?? { x: 0, y: 0 }
            return (
              <div
                key={agent.id}
                data-node={agent.id}
                style={{ position: 'absolute', left: pos.x, top: pos.y, cursor: 'grab' }}
                onMouseDown={(e) => startDrag(agent.id, e)}
                onDoubleClick={() => setChatAgent(agent)}
              >
                <IANode
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  onSelect={() => setSelectedAgent(agent)}
                  onChat={() => setChatAgent(agent)}
                  tarefasCount={tarefasCounts[agent.id] ?? 0}
                />
              </div>
            )
          })}

          {/* Empty state */}
          {agents.length === 0 && (
            <div className="flex flex-col items-center justify-center" style={{ position: 'absolute', left: 200, top: 200, width: 400 }}>
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

      {/* Sidebar lateral */}
      {selectedAgent && (
        <ControleIAPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => { setChatAgent(selectedAgent) }}
        />
      )}

      {/* Chat modal */}
      {chatAgent && (
        <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}
    </div>
  )
}
