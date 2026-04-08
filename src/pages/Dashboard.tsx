import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Layout/Header'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { IAAgent, Task, ActivityLog } from '../types'

interface Stats {
  totalAgents: number
  onlineAgents: number
  tasksToday: number
  tasksDone: number
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</p>
          <p className="text-sm text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: IAAgent['status'] }) {
  const cls = {
    online: 'status-dot-online',
    busy: 'status-dot-busy',
    offline: 'status-dot-offline',
    error: 'status-dot-error',
  }[status] ?? 'status-dot-offline'
  return <span className={`status-dot ${cls}`} />
}

export default function Dashboard() {
  const { companyId } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ totalAgents: 0, onlineAgents: 0, tasksToday: 0, tasksDone: 0 })
  const [agents, setAgents] = useState<IAAgent[]>([])
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)

      const [agentsRes, tasksRes, logRes] = await Promise.all([
        supabase.from('ia_agents').select('*').eq('company_id', companyId).order('is_zeus', { ascending: false }),
        supabase.from('tasks').select('*').eq('company_id', companyId).gte('created_at', today).order('created_at', { ascending: false }).limit(10),
        supabase.from('activity_log').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(20),
      ])

      const agentList = agentsRes.data ?? []
      const taskList = tasksRes.data ?? []
      const logList = logRes.data ?? []

      setAgents(agentList)
      setRecentTasks(taskList)
      setActivityLog(logList)
      setStats({
        totalAgents: agentList.length,
        onlineAgents: agentList.filter((a) => a.status === 'online' || a.status === 'busy').length,
        tasksToday: taskList.length,
        tasksDone: taskList.filter((t) => t.status === 'done').length,
      })
      setLoading(false)
    }

    load()
  }, [companyId])

  // Realtime agent status
  useEffect(() => {
    const sub = supabase
      .channel('dashboard-agents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ia_agents', filter: `company_id=eq.${companyId}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setAgents((prev) => prev.map((a) => (a.id === (payload.new as IAAgent).id ? (payload.new as IAAgent) : a)))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [companyId])

  const taskStatusColor: Record<Task['status'], string> = {
    pending: 'text-yellow-400',
    running: 'text-blue-400',
    done: 'text-emerald-400',
    failed: 'text-red-400',
  }

  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Dashboard"
        subtitle="Visão geral do seu Escritório de IA"
        actions={
          <button onClick={() => navigate('/organograma')} className="btn-primary text-sm">
            Ver Organograma
          </button>
        }
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="🤖" label="Agentes" value={stats.totalAgents} />
          <StatCard icon="🟢" label="Ativos agora" value={stats.onlineAgents} color="text-emerald-400" />
          <StatCard icon="📋" label="Tarefas hoje" value={stats.tasksToday} color="text-accent" />
          <StatCard icon="✅" label="Concluídas" value={stats.tasksDone} color="text-emerald-400" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Agent list */}
          <div className="lg:col-span-2 card">
            <div className="px-5 py-4 border-b border-dark-500 flex items-center justify-between">
              <h2 className="font-semibold text-white">Agentes</h2>
              <button onClick={() => navigate('/organograma')} className="text-xs text-accent hover:underline">
                Ver organograma →
              </button>
            </div>
            <div className="divide-y divide-dark-500">
              {loading ? (
                <div className="p-5 text-gray-400 text-sm">Carregando...</div>
              ) : agents.length === 0 ? (
                <div className="p-5 text-gray-400 text-sm">Nenhum agente cadastrado.</div>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => navigate(`/organograma`)}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-dark-700 cursor-pointer transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${agent.is_zeus ? 'animate-pulse-zeus' : ''}`}
                      style={{ backgroundColor: agent.color + '22', border: `2px solid ${agent.color}` }}
                    >
                      {agent.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white text-sm truncate">{agent.name}</p>
                        {agent.is_zeus && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-zeus/10 text-zeus border border-zeus/20">
                            Zeus
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{agent.description ?? agent.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusDot status={agent.status} />
                      <span className="text-xs text-gray-500 capitalize">{agent.status}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">{agent.tasks_done}</p>
                      <p className="text-xs text-gray-500">tarefas</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity log */}
          <div className="card">
            <div className="px-5 py-4 border-b border-dark-500">
              <h2 className="font-semibold text-white">Atividade recente</h2>
            </div>
            <div className="p-3 space-y-1 max-h-80 overflow-auto">
              {activityLog.length === 0 ? (
                <p className="text-gray-400 text-sm p-2">Sem atividade.</p>
              ) : (
                activityLog.map((log) => (
                  <div key={log.id} className="px-2 py-1.5 rounded hover:bg-dark-700 transition-colors">
                    <p className="text-sm text-gray-200">{log.action}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent tasks */}
        {recentTasks.length > 0 && (
          <div className="card">
            <div className="px-5 py-4 border-b border-dark-500">
              <h2 className="font-semibold text-white">Tarefas de hoje</h2>
            </div>
            <div className="divide-y divide-dark-500">
              {recentTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-4 px-5 py-3">
                  <span className={`text-xs font-medium uppercase ${taskStatusColor[task.status]}`}>
                    {task.status}
                  </span>
                  <p className="flex-1 text-sm text-gray-200 truncate">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(task.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
