import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Gamepad2, List, Plus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { IAAgent, Task } from '../../../types'
import Office3DView from './Office3DView'
import Office2DView from './Office2DView'
import AgentListView from './AgentListView'
import ControleIAPanel from '../ControleIA/ControleIAPanel'
import ChatIA from '../Chat/ChatIA'
import Header from '../../../components/Layout/Header'

type ViewMode = '3d' | '2d' | 'lista'

const VIEWS = [
  { mode: '3d' as ViewMode,    icon: Boxes,    title: '3D',    desc: 'Escritório 3D (FPS)' },
  { mode: '2d' as ViewMode,    icon: Gamepad2, title: '2D',    desc: 'Escritório 2D top-down' },
  { mode: 'lista' as ViewMode, icon: List,     title: 'Lista', desc: 'Tabela de agentes' },
]

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
  const { companyId, profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('zita_view_mode') as ViewMode) ?? '2d'
  )
  const [agents, setAgents] = useState<IAAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [tarefasCounts, setTarefasCounts] = useState<Record<string, number>>({})
  const [selectedAgent, setSelectedAgent] = useState<IAAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IAAgent | null>(null)

  // Load agents
  useEffect(() => {
    setLoading(true)
    supabase
      .from('ia_agents')
      .select('*')
      .eq('company_id', companyId)
      .order('is_zeus', { ascending: false })
      .then(({ data }) => {
        setAgents((data ?? []) as IAAgent[])
        setLoading(false)
      })
  }, [companyId])

  // Load task counts
  useEffect(() => {
    supabase
      .from('tasks')
      .select('agent_id')
      .eq('company_id', companyId)
      .in('status', ['pending', 'running'])
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        ;(data ?? []).forEach((t: Pick<Task, 'agent_id'>) => {
          counts[t.agent_id] = (counts[t.agent_id] ?? 0) + 1
        })
        setTarefasCounts(counts)
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

  const handleChangeView = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('zita_view_mode', mode)
    setSelectedAgent(null)
  }, [])

  const handleSelectAgent = useCallback((agent: IAAgent) => {
    setSelectedAgent(agent)
  }, [])

  const handleChat = useCallback((agent: IAAgent) => {
    setChatAgent(agent)
    setSelectedAgent(null)
  }, [])

  const activeView = VIEWS.find(v => v.mode === viewMode)!

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm mt-3">Carregando agentes...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header
        title="Organograma"
        subtitle={activeView.desc}
        actions={
          <div className="flex items-center gap-2">
            {/* View selector */}
            <div className="flex items-center bg-dark-700 border border-dark-500 rounded-lg p-1 gap-0.5">
              {VIEWS.map(({ mode, icon: Icon, title }) => (
                <button
                  key={mode}
                  onClick={() => handleChangeView(mode)}
                  title={title}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === mode
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-dark-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {title}
                </button>
              ))}
            </div>

            {/* New agent (admin only) */}
            {isAdmin && (
              <button
                onClick={() => navigate('/configuracoes')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova IA
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main view */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {viewMode === '3d' && (
            <Office3DView
              agents={agents}
              tarefasCounts={tarefasCounts}
              onSelectAgent={handleSelectAgent}
              onChat={handleChat}
            />
          )}
          {viewMode === '2d' && (
            <Office2DView
              agents={agents}
              tarefasCounts={tarefasCounts}
              onSelectAgent={handleSelectAgent}
              onChat={handleChat}
              selectedId={selectedAgent?.id}
            />
          )}
          {viewMode === 'lista' && (
            <AgentListView
              agents={agents}
              tarefasCounts={tarefasCounts}
              onSelectAgent={handleSelectAgent}
              onChat={handleChat}
              selectedId={selectedAgent?.id}
            />
          )}
        </div>

        {/* Side panel for 2D and lista */}
        {viewMode !== '3d' && selectedAgent && (
          <div className="w-80 flex-shrink-0 bg-dark-800 border-l border-dark-500 overflow-hidden flex flex-col">
            <ControleIAPanel
              agent={selectedAgent}
              companyId={companyId}
              onClose={() => setSelectedAgent(null)}
              onOpenChat={() => { setChatAgent(selectedAgent); setSelectedAgent(null) }}
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
