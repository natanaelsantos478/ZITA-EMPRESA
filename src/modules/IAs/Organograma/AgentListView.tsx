import { useState, useMemo } from 'react'
import { Search, MessageSquare, Settings, Zap, ChevronUp, ChevronDown } from 'lucide-react'
import type { IaAgent, AgentStatus, AgentTipo } from '../../../types'

const STATUS_DOT: Record<AgentStatus, string> = {
  online:    'bg-green-500',
  ocupada:   'bg-yellow-500',
  aguardando:'bg-blue-500',
  offline:   'bg-gray-500',
  erro:      'bg-red-500',
  pausada:   'bg-orange-500',
}
const STATUS_BADGE: Record<AgentStatus, string> = {
  online:    'bg-green-500/15 text-green-400 border-green-500/30',
  ocupada:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  aguardando:'bg-blue-500/15 text-blue-400 border-blue-500/30',
  offline:   'bg-gray-500/15 text-gray-400 border-gray-500/30',
  erro:      'bg-red-500/15 text-red-400 border-red-500/30',
  pausada:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
}
const STATUS_LABEL: Record<AgentStatus, string> = {
  online: 'Online', ocupada: 'Ocupada', aguardando: 'Aguardando',
  offline: 'Offline', erro: 'Erro', pausada: 'Pausada',
}
const TIPO_BADGE: Record<AgentTipo, string> = {
  zeus:        'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  subordinada: 'bg-brand-500/15 text-brand-400 border-brand-500/30',
  especialista:'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

type SortField = 'nome' | 'status' | 'tipo' | 'total_conversas' | 'total_tarefas_concluidas'

interface Props {
  agents: IaAgent[]
  tarefasCounts: Record<string, number>
  onSelectAgent: (a: IaAgent) => void
  onChat: (a: IaAgent) => void
  selectedId?: string
}

export default function AgentListView({ agents, tarefasCounts, onSelectAgent, onChat, selectedId }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<AgentStatus | ''>('')
  const [filterTipo, setFilterTipo] = useState<AgentTipo | ''>('')
  const [sortField, setSortField] = useState<SortField>('nome')
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
        a.nome.toLowerCase().includes(q) ||
        (a.funcao ?? '').toLowerCase().includes(q) ||
        (a.descricao ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStatus) list = list.filter(a => a.status === filterStatus)
    if (filterTipo)   list = list.filter(a => a.tipo === filterTipo)

    list.sort((a, b) => {
      const va = (a[sortField] ?? '') as string | number
      const vb = (b[sortField] ?? '') as string | number
      const sa = typeof va === 'string' ? va.toLowerCase() : va
      const sb = typeof vb === 'string' ? vb.toLowerCase() : vb
      if (sa < sb) return sortDir === 'asc' ? -1 : 1
      if (sa > sb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    const zeus = list.filter(a => a.tipo === 'zeus')
    const rest  = list.filter(a => a.tipo !== 'zeus')
    return [...zeus, ...rest]
  }, [agents, search, filterStatus, filterTipo, sortField, sortDir])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-gray-700" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-brand-400" />
      : <ChevronDown className="w-3 h-3 text-brand-400" />
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
    <div className="flex flex-col h-full bg-gray-950">
      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 flex-shrink-0 bg-gray-900/60">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar agente…"
            className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as AgentStatus | '')}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="online">Online</option>
          <option value="ocupada">Ocupada</option>
          <option value="aguardando">Aguardando</option>
          <option value="offline">Offline</option>
          <option value="erro">Erro</option>
          <option value="pausada">Pausada</option>
        </select>

        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value as AgentTipo | '')}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="">Todos os tipos</option>
          <option value="zeus">Zeus</option>
          <option value="subordinada">Subordinada</option>
          <option value="especialista">Especialista</option>
        </select>

        <span className="text-xs text-gray-600 ml-auto">{filtered.length} agente{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="text-left px-5 py-3 w-10" />
              <th className="text-left px-3 py-3"><ThBtn field="nome" label="Nome" /></th>
              <th className="text-left px-3 py-3 hidden md:table-cell">
                <span className="text-xs font-medium text-gray-500">Função</span>
              </th>
              <th className="text-left px-3 py-3"><ThBtn field="tipo" label="Tipo" /></th>
              <th className="text-left px-3 py-3"><ThBtn field="status" label="Status" /></th>
              <th className="text-left px-3 py-3 hidden lg:table-cell">
                <span className="text-xs font-medium text-gray-500">Integração</span>
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <ThBtn field="total_conversas" label="Conversas" />
              </th>
              <th className="text-center px-3 py-3 hidden lg:table-cell">
                <span className="text-xs font-medium text-gray-500">Tarefas ativas</span>
              </th>
              <th className="text-right px-5 py-3">
                <span className="text-xs font-medium text-gray-500">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
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
                  className={`cursor-pointer transition-colors hover:bg-gray-800/40 ${
                    isSelected ? 'bg-brand-600/10 border-l-2 border-l-brand-500' : ''
                  }`}
                >
                  {/* Avatar */}
                  <td className="px-5 py-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: agent.cor_hex || '#3a40f5' }}
                    >
                      {agent.avatar_url
                        ? <img src={agent.avatar_url} alt={agent.nome} className="w-full h-full rounded-lg object-cover" />
                        : agent.tipo === 'zeus'
                          ? <Zap className="w-4 h-4 text-yellow-300" />
                          : agent.nome.slice(0, 2).toUpperCase()
                      }
                    </div>
                  </td>

                  {/* Nome */}
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">{agent.nome}</p>
                    {agent.integracao_url && (
                      <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[140px]">{agent.integracao_url}</p>
                    )}
                  </td>

                  {/* Função */}
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="text-gray-400 text-xs">{agent.funcao ?? '—'}</span>
                  </td>

                  {/* Tipo */}
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TIPO_BADGE[agent.tipo]}`}>
                      {agent.tipo}
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
                    {agent.integracao_tipo ? (
                      <span className="text-xs text-gray-400 capitalize">{agent.integracao_tipo}</span>
                    ) : (
                      <span className="text-xs text-gray-700">—</span>
                    )}
                  </td>

                  {/* Conversas */}
                  <td className="px-3 py-3 text-center hidden lg:table-cell">
                    <span className="text-sm text-gray-400">{agent.total_conversas}</span>
                  </td>

                  {/* Tarefas ativas */}
                  <td className="px-3 py-3 text-center hidden lg:table-cell">
                    {tc > 0 ? (
                      <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                        {tc}
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
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                        title="Chat"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <a
                        href={`/configuracoes#${agent.id}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
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
