import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { IAAgent } from '../../../types'
import IANode from './IANode'
import ControleIAPanel from '../ControleIA/ControleIAPanel'
import ChatIA from '../Chat/ChatIA'
import Header from '../../../components/Layout/Header'

// Draw SVG connection lines between nodes
function ConnectionLines({ agents }: { agents: IAAgent[] }) {
  const agentMap = new Map(agents.map((a) => [a.id, a]))

  const lines: { x1: number; y1: number; x2: number; y2: number; color: string }[] = []

  for (const agent of agents) {
    if (agent.parent_id) {
      const parent = agentMap.get(agent.parent_id)
      if (parent) {
        lines.push({
          x1: parent.organograma_x,
          y1: parent.organograma_y,
          x2: agent.organograma_x,
          y2: agent.organograma_y,
          color: parent.is_zeus ? '#f5c84240' : '#4a9eff30',
        })
      }
    }
  }

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#4a9eff30" />
        </marker>
      </defs>
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={l.color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  )
}

// Chat modal
function ChatModal({ agent, companyId, onClose }: { agent: IAAgent; companyId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-dark-800 rounded-2xl border border-dark-500 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500">
          <div className="flex items-center gap-2">
            <span className="text-xl">{agent.emoji}</span>
            <p className="font-semibold text-white">{agent.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>
        <ChatIA agent={agent} companyId={companyId} />
      </div>
    </div>
  )
}

export default function OrganogramaView() {
  const { companyId } = useAuth()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [agents, setAgents] = useState<IAAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<IAAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IAAgent | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Load agents
  useEffect(() => {
    setLoading(true)
    supabase
      .from('ia_agents')
      .select('*')
      .eq('company_id', companyId)
      .order('is_zeus', { ascending: false })
      .then(({ data }) => {
        setAgents(data ?? [])
        setLoading(false)
      })
  }, [companyId])

  // Realtime agent updates
  useEffect(() => {
    const channel = supabase
      .channel('organograma-agents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ia_agents', filter: `company_id=eq.${companyId}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setAgents((prev) => prev.map((a) => a.id === (payload.new as IAAgent).id ? (payload.new as IAAgent) : a))
          setSelectedAgent((prev) => prev?.id === (payload.new as IAAgent).id ? (payload.new as IAAgent) : prev)
        }
        if (payload.eventType === 'INSERT') {
          setAgents((prev) => [...prev, payload.new as IAAgent])
        }
        if (payload.eventType === 'DELETE') {
          setAgents((prev) => prev.filter((a) => a.id !== (payload.old as IAAgent).id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [companyId])

  const handleNodeClick = useCallback((agent: IAAgent) => {
    setSelectedAgent(agent)
    setSidebarOpen(true)
  }, [])

  const handleNodeDoubleClick = useCallback((agent: IAAgent) => {
    setChatAgent(agent)
  }, [])

  const handleDragEnd = useCallback(async (agentId: string, x: number, y: number) => {
    // Optimistic update
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, organograma_x: x, organograma_y: y } : a))

    await supabase
      .from('ia_agents')
      .update({ organograma_x: x, organograma_y: y })
      .eq('id', agentId)
      .eq('company_id', companyId)
  }, [companyId])

  const handleCanvasClick = useCallback(() => {
    setSelectedAgent(null)
    setSidebarOpen(false)
  }, [])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header
        title="Organograma"
        subtitle="Clique para selecionar · Duplo clique para chat · Arraste para reposicionar"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="status-dot status-dot-online" />Online
              <span className="status-dot status-dot-busy ml-2" />Ocupado
              <span className="status-dot status-dot-offline ml-2" />Offline
            </div>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-dark-900"
          style={{
            backgroundImage: 'radial-gradient(circle, #2a2f42 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
          onClick={handleCanvasClick}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Carregando organograma...</p>
              </div>
            </div>
          ) : agents.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-5xl">🤖</span>
                <p className="text-gray-400 mt-3">Nenhum agente cadastrado ainda.</p>
              </div>
            </div>
          ) : (
            <>
              <ConnectionLines agents={agents} />
              {agents.map((agent) => (
                <IANode
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  onClick={handleNodeClick}
                  onDoubleClick={handleNodeDoubleClick}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </>
          )}

          {/* Help hint */}
          <div className="absolute bottom-4 left-4 text-xs text-gray-600 select-none pointer-events-none">
            💡 Arraste os nós para reorganizar • Duplo clique para abrir chat
          </div>
        </div>

        {/* Sidebar panel */}
        {sidebarOpen && selectedAgent && (
          <div className="w-80 flex-shrink-0 bg-dark-800 border-l border-dark-500 overflow-hidden flex flex-col">
            <ControleIAPanel
              agent={selectedAgent}
              companyId={companyId}
              onClose={() => { setSidebarOpen(false); setSelectedAgent(null) }}
              onOpenChat={() => { setChatAgent(selectedAgent); setSidebarOpen(false) }}
            />
          </div>
        )}
      </div>

      {/* Chat modal */}
      {chatAgent && (
        <ChatModal
          agent={chatAgent}
          companyId={companyId}
          onClose={() => setChatAgent(null)}
        />
      )}
    </div>
  )
}
