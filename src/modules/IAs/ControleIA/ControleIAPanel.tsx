import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import type { IAAgent, Task, ActivityLog, AgentMetric } from '../../../types'
import ChatIA from '../Chat/ChatIA'

interface ControleIAPanelProps {
  agent: IAAgent
  companyId: string
  onClose: () => void
  onOpenChat?: () => void
}

type Tab = 'atividade' | 'tarefas' | 'metricas' | 'historico'

function StatusBadge({ status }: { status: IAAgent['status'] }) {
  const cfg = {
    online: { label: 'Online', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    busy: { label: 'Ocupado', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    offline: { label: 'Offline', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
    error: { label: 'Erro', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  }[status] ?? { label: status, cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20' }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export default function ControleIAPanel({ agent, companyId, onClose, onOpenChat }: ControleIAPanelProps) {
  const [tab, setTab] = useState<Tab>('atividade')
  const [tasks, setTasks] = useState<Task[]>([])
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [metrics, setMetrics] = useState<AgentMetric[]>([])
  const [loadingTab, setLoadingTab] = useState(false)

  useEffect(() => {
    setLoadingTab(true)

    const loaders: Record<Tab, () => Promise<void>> = {
      atividade: async () => {
        const { data } = await supabase
          .from('activity_log')
          .select('*')
          .eq('company_id', companyId)
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })
          .limit(30)
        setLogs(data ?? [])
      },
      tarefas: async () => {
        const { data } = await supabase
          .from('tasks')
          .select('*')
          .eq('company_id', companyId)
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })
          .limit(20)
        setTasks(data ?? [])
      },
      metricas: async () => {
        const { data } = await supabase
          .from('agent_metrics')
          .select('*')
          .eq('company_id', companyId)
          .eq('agent_id', agent.id)
          .order('date', { ascending: false })
          .limit(7)
        setMetrics(data ?? [])
      },
      historico: async () => {
        // Historico uses chat messages — handled by ChatIA directly
      },
    }

    loaders[tab]().finally(() => setLoadingTab(false))
  }, [tab, agent.id, companyId])

  const taskStatusColors: Record<Task['status'], string> = {
    pending: 'text-yellow-400',
    running: 'text-blue-400',
    done: 'text-emerald-400',
    failed: 'text-red-400',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-dark-500">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: agent.color + '22', border: `2px solid ${agent.color}` }}
        >
          {agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">{agent.name}</h3>
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-xs text-gray-400 truncate">{agent.description ?? agent.role}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
          ✕
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 px-4 py-3 border-b border-dark-500">
        <button
          onClick={onOpenChat}
          className="flex-1 btn-primary text-xs py-2"
        >
          💬 Chat
        </button>
        <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-dark-700 border border-dark-500 text-xs text-gray-300">
          <span>📋</span>
          <span className="font-medium">{agent.tasks_done}</span>
          <span className="text-gray-500">tarefas</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-500 px-2">
        {(['atividade', 'tarefas', 'metricas', 'historico'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {loadingTab && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Atividade */}
        {!loadingTab && tab === 'atividade' && (
          <div className="p-3 space-y-1">
            {logs.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Sem atividade registrada.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="px-3 py-2 rounded-lg hover:bg-dark-700 transition-colors">
                  <p className="text-sm text-gray-200">{log.action}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(log.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tarefas */}
        {!loadingTab && tab === 'tarefas' && (
          <div className="divide-y divide-dark-500">
            {tasks.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Sem tarefas.</p>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium uppercase ${taskStatusColors[task.status]}`}>
                      {task.status}
                    </span>
                    <p className="text-sm text-white flex-1 truncate">{task.title}</p>
                  </div>
                  {task.description && (
                    <p className="text-xs text-gray-400 mb-1">{task.description}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {new Date(task.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Métricas */}
        {!loadingTab && tab === 'metricas' && (
          <div className="p-4 space-y-3">
            {metrics.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Sem dados de métricas.</p>
            ) : (
              metrics.map((m) => (
                <div key={m.id} className="card p-4">
                  <p className="text-xs text-gray-400 mb-2">{m.date}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-lg font-bold text-emerald-400">{m.tasks_done}</p>
                      <p className="text-xs text-gray-400">tarefas</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-accent">{m.messages_sent}</p>
                      <p className="text-xs text-gray-400">mensagens</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">
                        {m.avg_response_ms ? `${m.avg_response_ms}ms` : '—'}
                      </p>
                      <p className="text-xs text-gray-400">resp. média</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${m.errors > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {m.errors}
                      </p>
                      <p className="text-xs text-gray-400">erros</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Histórico */}
        {!loadingTab && tab === 'historico' && (
          <ChatIA agent={agent} companyId={companyId} compact />
        )}
      </div>
    </div>
  )
}
