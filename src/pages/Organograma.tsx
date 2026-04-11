import { useState, useCallback, useEffect } from 'react'
import { LayoutTemplate, Box, Brain } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAgentStatus } from '../hooks/useAgentStatus'
import { useRealtime } from '../hooks/useRealtime'
import { useEcosystem } from '../hooks/useEcosystem'
import { supabase } from '../lib/supabase'
import type { IaAgent, IaTarefa } from '../types'
import CanvasView from '../modules/IAs/Organograma/CanvasView'
import EscritorioView from '../modules/IAs/Escritorio/EscritorioView'
import Escritorio2D from '../modules/IAs/Escritorio2D/Escritorio2D'
import Office3DView from '../modules/IAs/Organograma/Office3DView'
import ControleIAPanel from '../modules/IAs/ControleIA/ControleIAPanel'
import ChatIA from '../modules/IAs/Chat/ChatIA'
import EcosystemPanel from '../modules/IAs/Ecosystem/EcosystemPanel'
import ErrorBoundary from '../components/Layout/ErrorBoundary'

type ViewMode = 'canvas' | 'retro' | 'moderno' | 'profissional' | '3d'

const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'canvas',       label: 'Canvas'          },
  { mode: 'retro',        label: '🪵 Retrô'        },
  { mode: 'moderno',      label: '🏢 Moderno'      },
  { mode: 'profissional', label: '⬛ Profissional'  },
  { mode: '3d',           label: '3D'              },
]

// Wrap any view to guarantee it fills the container
function ViewSlot({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </div>
  )
}

function resolveInitialView(): ViewMode {
  const saved = localStorage.getItem('zita_view_mode')
  const valid: ViewMode[] = ['canvas', 'retro', 'moderno', 'profissional', '3d']
  // Migrate old keys
  if (saved === '2d' || saved === 'salas') return 'profissional'
  return valid.includes(saved as ViewMode) ? (saved as ViewMode) : 'profissional'
}

export default function Organograma() {
  const { companyId } = useAuth()
  const { agents, loading } = useAgentStatus()

  const [view, setView]               = useState<ViewMode>(resolveInitialView)
  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent,     setChatAgent]     = useState<IaAgent | null>(null)
  const [tarefasCounts, setTarefasCounts] = useState<Record<string, number>>({})
  const [showEcosystem, setShowEcosystem] = useState(false)

  const ecosystem = useEcosystem(agents)

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

  const handleChangeView = useCallback((m: ViewMode) => {
    setView(m)
    localStorage.setItem('zita_view_mode', m)
    setSelectedAgent(null)
  }, [])

  const handleSelect = useCallback((a: IaAgent) => setSelectedAgent(a), [])
  const handleChat   = useCallback((a: IaAgent) => { setChatAgent(a); setSelectedAgent(null) }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">

      {/* ── View toggle ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button
          onClick={() => setShowEcosystem(v => !v)}
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>{agents.length} agente{agents.length !== 1 ? 's' : ''}</span>
          {ecosystem.state.pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-black text-xs rounded-full flex items-center justify-center font-bold leading-none">
              {ecosystem.state.pendingCount}
            </span>
          )}
        </button>

        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5 gap-0.5">
          {VIEWS.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => handleChangeView(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === mode
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {mode === 'canvas' && <LayoutTemplate className="w-3.5 h-3.5" />}
              {mode === '3d'     && <Box className="w-3.5 h-3.5" />}
              {label}
            </button>
          ))}
        </div>

        <div className="w-24" />
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ position: 'relative' }}>

        {/* Main view area */}
        <div className="flex-1 min-h-0 overflow-hidden" style={{ position: 'relative' }}>

          {view === 'canvas' && (
            <ViewSlot>
              <CanvasView />
            </ViewSlot>
          )}

          {(view === 'retro' || view === 'moderno') && (
            <ViewSlot>
              <EscritorioView
                key={view}
                initialTheme={view === 'retro' ? 'retro' : 'moderno'}
                agents={agents}
                tarefasCounts={tarefasCounts}
                onSelectAgent={handleSelect}
                onChat={handleChat}
              />
            </ViewSlot>
          )}

          {/* ── Profissional — visão flat com simulação Sims ──────────────── */}
          {view === 'profissional' && (
            <ViewSlot>
              {companyId
                ? <Escritorio2D
                    key={companyId}
                    agents={agents}
                    tarefasCounts={tarefasCounts}
                  />
                : <div className="flex items-center justify-center flex-1">
                    <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
              }
            </ViewSlot>
          )}

          {view === '3d' && (
            <ViewSlot>
              <Office3DView
                agents={agents}
                tarefasCounts={tarefasCounts}
                onSelectAgent={handleSelect}
                onChat={handleChat}
              />
            </ViewSlot>
          )}
        </div>

        {/* Side panel — apenas para 3D */}
        {view === '3d' && selectedAgent && (
          <ControleIAPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            onChat={() => handleChat(selectedAgent)}
          />
        )}
      </div>

      {chatAgent && <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />}

      {showEcosystem && (
        <EcosystemPanel
          agents={agents}
          onClose={() => setShowEcosystem(false)}
          sendAction={ecosystem.sendAction}
          zeusBroadcast={ecosystem.zeusBroadcast}
          fetchHistory={ecosystem.fetchHistory}
          fetchMemories={ecosystem.fetchMemories}
          saveMemoria={ecosystem.saveMemoria}
          pendingCount={ecosystem.state.pendingCount}
          isProcessing={ecosystem.state.isProcessing}
        />
      )}
    </div>
  )
}
