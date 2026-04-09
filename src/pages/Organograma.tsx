import { useState, useCallback } from 'react'
import { Boxes, Gamepad2, List } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAgentStatus } from '../hooks/useAgentStatus'
import { useRealtime } from '../hooks/useRealtime'
import { supabase } from '../lib/supabase'
import type { IaAgent, IaTarefa } from '../types'
import Office3DView from '../modules/IAs/Organograma/Office3DView'
import Office2DView from '../modules/IAs/Organograma/Office2DView'
import AgentListView from '../modules/IAs/Organograma/AgentListView'
import ControleIAPanel from '../modules/IAs/ControleIA/ControleIAPanel'
import ChatIA from '../modules/IAs/Chat/ChatIA'
import { useEffect } from 'react'

type ViewMode = '3d' | '2d' | 'lista'

const VIEWS = [
  { mode: '3d' as ViewMode,    icon: Boxes,    title: '3D',    desc: 'Escritório 3D (FPS)' },
  { mode: '2d' as ViewMode,    icon: Gamepad2, title: '2D',    desc: 'Escritório 2D top-down' },
  { mode: 'lista' as ViewMode, icon: List,     title: 'Lista', desc: 'Tabela de agentes' },
]

export default function Organograma() {
  const { companyId } = useAuth()
  const { agents, loading } = useAgentStatus()

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('zita_view_mode') as ViewMode) ?? '2d'
  )
  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IaAgent | null>(null)
  const [tarefasCounts, setTarefasCounts] = useState<Record<string, number>>({})

  // Load active task counts
  useEffect(() => {
    if (!companyId || agents.length === 0) return
    supabase
      .from('ia_tarefas')
      .select('agent_id')
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

  const handleChangeView = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('zita_view_mode', mode)
    setSelectedAgent(null)
  }, [])

  const handleSelectAgent = useCallback((agent: IaAgent) => {
    setSelectedAgent(agent)
  }, [])

  const handleChat = useCallback((agent: IaAgent) => {
    setChatAgent(agent)
    setSelectedAgent(null)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const activeView = VIEWS.find(v => v.mode === viewMode)!

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header with view selector */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Organograma</h2>
          <p className="text-xs text-gray-500 mt-0.5">{activeView.desc}</p>
        </div>

        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-1 gap-0.5">
          {VIEWS.map(({ mode, icon: Icon, title }) => (
            <button
              key={mode}
              onClick={() => handleChangeView(mode)}
              title={title}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === mode
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* View */}
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

        {/* Side panel (2D and lista only) */}
        {viewMode !== '3d' && selectedAgent && (
          <ControleIAPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            onChat={() => handleChat(selectedAgent)}
          />
        )}
      </div>

      {/* Chat modal */}
      {chatAgent && (
        <ChatIA
          agent={chatAgent}
          onClose={() => setChatAgent(null)}
        />
      )}
    </div>
  )
}
