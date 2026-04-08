import { useState, useEffect } from 'react'
import { Boxes, Gamepad2, List, Loader2, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAgentStatus } from '../hooks/useAgentStatus'
import { useRealtime } from '../hooks/useRealtime'
import type { IaAgent, IaTarefa } from '../types'
import AgentListView from '../modules/IAs/Organograma/AgentListView'
import Office2DView from '../modules/IAs/Organograma/Office2DView'
import Office3DView from '../modules/IAs/Organograma/Office3DView'
import ControleIAPanel from '../modules/IAs/ControleIA/ControleIAPanel'
import ChatIA from '../modules/IAs/Chat/ChatIA'

type ViewMode = '3d' | '2d' | 'lista'

const VIEWS: { mode: ViewMode; icon: typeof Boxes; title: string; desc: string }[] = [
  { mode: '3d',    icon: Boxes,     title: '3D',   desc: 'Escritório 3D (FPS)'     },
  { mode: '2d',    icon: Gamepad2,  title: '2D',   desc: 'Escritório 2D top-down'  },
  { mode: 'lista', icon: List,      title: 'Lista', desc: 'Tabela de agentes'       },
]

export default function Organograma() {
  const { companyId, isAdmin } = useAuth()
  const { agents, loading } = useAgentStatus()

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('zita_view_mode') as ViewMode) ?? '2d'
  )
  const changeView = (m: ViewMode) => {
    setViewMode(m)
    localStorage.setItem('zita_view_mode', m)
  }

  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent,     setChatAgent]     = useState<IaAgent | null>(null)
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

  useRealtime<IaTarefa & Record<string, unknown>>(
    'ia_tarefas',
    companyId ? `company_id=eq.${companyId}` : undefined,
    t => {
      setTarefasCounts(prev => {
        const next = { ...prev }
        if (t.status === 'em_execucao') next[t.agent_id] = (next[t.agent_id] ?? 0) + 1
        else if (next[t.agent_id] > 0) next[t.agent_id] -= 1
        return next
      })
    },
    'UPDATE'
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    )
  }

  // ── Toolbar (shared, always visible) ───────────────────────────────────────
  const Toolbar = (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 bg-gray-900/90 border border-gray-800 rounded-xl p-1.5 shadow-lg backdrop-blur-sm">
      {VIEWS.map(({ mode, icon: Icon, title, desc }) => (
        <button
          key={mode}
          onClick={() => changeView(mode)}
          title={desc}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
            viewMode === mode
              ? 'bg-brand-600/30 text-brand-300 ring-1 ring-brand-500/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
          {title}
        </button>
      ))}

      {isAdmin && (
        <>
          <div className="border-t border-gray-800 my-0.5" />
          <button
            onClick={() => window.location.assign('/configuracoes/ias')}
            title="Adicionar IA"
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova IA
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="relative w-full h-[calc(100vh-56px)] overflow-hidden bg-gray-950">

      {/* ── 3D — Three.js FPS ────────────────────────────────────────────── */}
      {viewMode === '3d' && (
        <>
          {Toolbar}
          <div className="absolute inset-0">
            <Office3DView
              agents={agents}
              tarefasCounts={tarefasCounts}
              onSelectAgent={setSelectedAgent}
              onChat={setChatAgent}
            />
          </div>
        </>
      )}

      {/* ── 2D — Zelda top-down canvas ───────────────────────────────────── */}
      {viewMode === '2d' && (
        <>
          {Toolbar}
          <div className="absolute inset-0">
            <Office2DView
              agents={agents}
              tarefasCounts={tarefasCounts}
              onSelectAgent={setSelectedAgent}
              onChat={setChatAgent}
              selectedId={selectedAgent?.id}
            />
          </div>
        </>
      )}

      {/* ── Lista — tabela de agentes ─────────────────────────────────────── */}
      {viewMode === 'lista' && (
        <>
          {Toolbar}
          <div className="absolute inset-0">
            <AgentListView
              agents={agents}
              tarefasCounts={tarefasCounts}
              onSelectAgent={setSelectedAgent}
              onChat={setChatAgent}
              selectedId={selectedAgent?.id}
            />
          </div>
        </>
      )}

      {/* ── ControleIAPanel (sidebar) — shared, exceto 3D ────────────────── */}
      {selectedAgent && viewMode !== '3d' && (
        <ControleIAPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => setChatAgent(selectedAgent)}
        />
      )}

      {/* ── Chat modal ───────────────────────────────────────────────────── */}
      {chatAgent && (
        <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}
    </div>
  )
}
