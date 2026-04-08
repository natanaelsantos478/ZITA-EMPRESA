import { useState, useMemo } from 'react'
import { Search, MessageSquare, Settings, Zap, ChevronUp, ChevronDown } from 'lucide-react'
import type { IAAgent, AgentStatus, AgentRole } from '../../../types'

const STATUS_DOT: Record<AgentStatus, string> = {
  online:  'bg-green-500',
  busy:    'bg-yellow-500',
  offline: 'bg-gray-500',
  error:   'bg-red-500',
}
const STATUS_BADGE: Record<AgentStatus, string> = {
  online:  'bg-green-500/15 text-green-400 border-green-500/30',
  busy:    'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  offline: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  error:   'bg-red-500/15 text-red-400 border-red-500/30',
}
const STATUS_LABEL: Record<AgentStatus, string> = {
  online: 'Online', busy: 'Ocupado', offline: 'Offline', error: 'Erro',
}
const ROLE_BADGE: Record<AgentRole, string> = {
  zeus:        'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  prospeccao:  'bg-brand-500/15 text-brand-400 border-brand-500/30',
  crm:         'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  financeiro:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  marketing:   'bg-pink-500/15 text-pink-400 border-pink-500/30',
  atendimento: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  custom:      'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

type SortField = 'name' | 'status' | 'role' | 'tasks_done'

interface Props {
  agents: IAAgent[]
  tarefasCounts: Record<string, number>
  onSelectAgent: (a: IAAgent) => void
  onChat: (a: IAAgent) => void
  selectedId?: string
}

export default function AgentListView({ agents, tarefasCounts, onSelectAgent, onChat, selectedId }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<AgentStatus | ''>('')
  const [filterRole, setFilterRole] = useState<AgentRole | ''>('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = [...agents]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
      )
    }
    if (filterStatus) list = list.filter(a => a.status === filterStatus)
    if (filterRole)   list = list.filter(a => a.role === filterRole)

    list.sort((a, b) => {
      const va: string | number = (a[sortField] ?? '') as string | number
      const vb: string | number = (b[sortField] ?? '') as string | number
      const sa = typeof va === 'string' ? va.toLowerCase() : va
      const sb = typeof vb === 'string' ? vb.toLowerCase() : vb
      if (sa < sb) return sortDir === 'asc' ? -1 : 1
      if (sa > sb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    // Zeus always first
    const zeus = list.filter(a => a.is_zeus)
    const rest  = list.filter(a => !a.is_zeus)
    return [...zeus, ...rest]
  }, [agents, search, filterStatus, filterRole, sortField, sortDir])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-gray-700" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />
  }

  function ThBtn({ field, label }: { field: SortField; label: string }) {
    return (
      <button onClick={() => toggleSort(field)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-white transition-colors">
        {label}<SortIcon field={field} />
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-900">
      {/* Filters bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-dark-500 flex-shrink-0 bg-dark-800/60">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar agente…"
            className="w-full pl-8 pr-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as AgentStatus | '')}
          className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-accent"
        >
          <option value="">Todos os status</option>
          <option value="online">Online</option>
          <option value="busy">Ocupado</option>
          <option value="offline">Offline</option>
          <option value="error">Erro</option>
        </select>

        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as AgentRole | '')}
          className="px-3 py-2 bg-dark-700 border border-dark-500 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-accent"
        >
          <option value="">Todos os tipos</option>
          <option value="zeus">Zeus</option>
          <option value="prospeccao">Prospecção</option>
          <option value="crm">CRM</option>
          <option value="financeiro">Financeiro</option>
          <option value="marketing">Marketing</option>
          <option value="atendimento">Atendimento</option>
          <option value="custom">Custom</option>
        </select>

        <span className="text-xs text-gray-600 ml-auto">{filtered.length} agente{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-dark-800 border-b border-dark-500">
            <tr>
              <th className="text-left px-5 py-3 w-10" />
              <th className="text-left px-3 py-3"><ThBtn field="name" label="Nome" /></th>
              <th className="text-left px-3 py-3 hidden md:table-cell">
                <span className="text-xs font-medium text-gray-500">Descrição</span>
              </th>
              <th className="text-left px-3 py-3"><ThBtn field="role" label="Função" /></th>
              <th className="text-left px-3 py-3"><ThBtn field="status" label="Status" /></th>
              <th className="text-left px-3 py-3 hidden lg:table-cell">
                <span className="text-xs font-medium text-gray-500">Integração</span>
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <ThBtn field="tasks_done" label="Tarefas" />
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <span className="text-xs font-medium text-gray-500">Ativas</span>
              </th>
              <th className="text-right px-5 py-3">
                <span className="text-xs font-medium text-gray-500">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-500/50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-gray-600">
                  Nenhum agente encontrado
                </td>
              </tr>
            )}
            {filtered.map(agent => {
              const isSelected = agent.id === selectedId
              const tc = tarefasCounts[agent.id] ?? 0

              return (
                <tr
                  key={agent.id}
                  onClick={() => onSelectAgent(agent)}
                  className={`cursor-pointer transition-colors hover:bg-dark-700/40 ${
                    isSelected ? 'bg-accent/10 border-l-2 border-l-accent' : ''
                  }`}
                >
                  {/* Avatar */}
                  <td className="px-5 py-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: agent.color || '#3a40f5' }}
                    >
                      {agent.is_zeus
                        ? <Zap className="w-4 h-4 text-yellow-300" />
                        : agent.emoji
                          ? <span className="text-base">{agent.emoji}</span>
                          : agent.name.slice(0, 2).toUpperCase()
                      }
                    </div>
                  </td>

                  {/* Nome */}
                  <td className="px-3 py-3">
                    <div>
                      <p className="font-medium text-white">{agent.name}</p>
                      {agent.webhook_url && (
                        <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[140px]">{agent.webhook_url}</p>
                      )}
                    </div>
                  </td>

                  {/* Descrição */}
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="text-gray-400 text-xs">{agent.description ?? '—'}</span>
                  </td>

                  {/* Função / Role */}
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_BADGE[agent.role] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
                      {agent.role}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border w-fit ${STATUS_BADGE[agent.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
                      {STATUS_LABEL[agent.status] ?? agent.status}
                    </span>
                  </td>

                  {/* Integração */}
                  <td className="px-3 py-3 hidden lg:table-cell">
                    {agent.webhook_url ? (
                      <span className="text-xs text-gray-400 truncate max-w-[120px] block">Webhook</span>
                    ) : (
                      <span className="text-xs text-gray-700">—</span>
                    )}
                  </td>

                  {/* Tarefas concluídas */}
                  <td className="px-3 py-3 text-center hidden lg:table-cell">
                    <span className="text-sm text-gray-400">{agent.tasks_done}</span>
                  </td>

                  {/* Tarefas ativas */}
                  <td className="px-3 py-3 text-center hidden lg:table-cell">
                    {tc > 0 ? (
                      <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                        {tc} ativa{tc > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-700">—</span>
                    )}
                  </td>

                  {/* Ações */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); onChat(agent) }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Chat"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <a
                        href={`/configuracoes#${agent.id}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-600 transition-colors"
                        title="Configurar"
                      >
                        <Settings className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
