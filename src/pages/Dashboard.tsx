import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot, CheckCircle2, MessageSquare, Zap, Network,
  Plus, List, ChevronRight, Activity, Clock
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAgentStatus } from '../hooks/useAgentStatus'
import { useRealtime } from '../hooks/useRealtime'
import type { IaAgent, IaMensagem, IaTarefa } from '../types'
import ChatIA from '../modules/IAs/Chat/ChatIA'

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-green-500',
  ocupada: 'bg-yellow-500',
  aguardando: 'bg-blue-500',
  offline: 'bg-gray-500',
  erro: 'bg-red-500',
  pausada: 'bg-orange-500',
}

function greeting(nome: string) {
  const h = new Date().getHours()
  if (h < 12) return `Bom dia, ${nome.split(' ')[0]}`
  if (h < 18) return `Boa tarde, ${nome.split(' ')[0]}`
  return `Boa noite, ${nome.split(' ')[0]}`
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return `há ${Math.floor(diff / 86400)}d`
}

export default function Dashboard() {
  const { profile, companyId, isAdmin } = useAuth()
  const { agents } = useAgentStatus()
  const [tarefasCount, setTarefasCount] = useState(0)
  const [mensagensHoje, setMensagensHoje] = useState(0)
  const [feed, setFeed] = useState<IaMensagem[]>([])
  const [chatAgent, setChatAgent] = useState<IaAgent | null>(null)

  const zeus = agents.find((a) => a.tipo === 'zeus')

  const loadStats = useCallback(async () => {
    if (!companyId) return
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const [{ count: tc }, { count: mc }, { data: feedData }] = await Promise.all([
      supabase
        .from('ia_tarefas')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'em_execucao'),
      supabase
        .from('ia_mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', hoje.toISOString()),
      supabase
        .from('ia_mensagens')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setTarefasCount(tc ?? 0)
    setMensagensHoje(mc ?? 0)
    if (feedData) setFeed(feedData as IaMensagem[])
  }, [companyId])

  useEffect(() => { loadStats() }, [loadStats])

  // Realtime feed
  useRealtime<IaMensagem & Record<string, unknown>>(
    'ia_mensagens',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (nova) => {
      setFeed((prev) => [nova, ...prev].slice(0, 20))
      setMensagensHoje((n) => n + 1)
    },
    'INSERT'
  )

  useRealtime<IaTarefa & Record<string, unknown>>(
    'ia_tarefas',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (t) => {
      if (t.status === 'em_execucao') setTarefasCount((n) => n + 1)
      if (t.status === 'concluida' || t.status === 'erro') setTarefasCount((n) => Math.max(0, n - 1))
    },
    'UPDATE'
  )

  const onlineCount = agents.filter((a) => a.status === 'online').length

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          {profile ? greeting(profile.nome) : 'Olá'}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Zeus card */}
      {zeus && (
        <div className="bg-gradient-to-r from-brand-950 to-gray-900 border border-brand-700/40 rounded-xl p-5 flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-brand-700/40 border-2 border-yellow-500/60 flex items-center justify-center text-3xl flex-shrink-0">
            {zeus.avatar_url ? (
              <img src={zeus.avatar_url} alt="Zeus" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <Zap className="w-8 h-8 text-yellow-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white">{zeus.nome}</h2>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">IA Mestre</span>
            </div>
            <p className="text-sm text-gray-400 truncate">{zeus.funcao ?? 'Coordena todas as IAs subordinadas'}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[zeus.status] ?? 'bg-gray-500'}`} />
                <span className="capitalize">{zeus.status}</span>
              </span>
              <span className="text-xs text-gray-500">
                {zeus.total_conversas} conversas · {zeus.total_tarefas_concluidas} tarefas concluídas
              </span>
            </div>
          </div>
          <button
            onClick={() => setChatAgent(zeus)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <MessageSquare className="w-4 h-4" />
            Falar com Zeus
          </button>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'IAs Online', value: onlineCount, icon: Bot, color: 'text-green-400', bg: 'bg-green-400/10' },
          { label: 'Tarefas em execução', value: tarefasCount, icon: CheckCircle2, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { label: 'Mensagens hoje', value: mensagensHoje, icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-400/10' },
          {
            label: 'Total de IAs',
            value: agents.length,
            icon: Activity,
            color: 'text-brand-400',
            bg: 'bg-brand-400/10',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feed de atividade */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-400" />
              Atividade em tempo real
            </h3>
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              ao vivo
            </span>
          </div>
          <div className="divide-y divide-gray-800/50 max-h-80 overflow-y-auto scrollbar-thin">
            {feed.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-600">
                Nenhuma atividade ainda
              </div>
            ) : (
              feed.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-gray-800/30 transition-colors animate-fade-in"
                >
                  <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{m.remetente_nome}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{m.conteudo.slice(0, 80)}</p>
                  </div>
                  <span className="text-xs text-gray-600 flex-shrink-0 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {timeAgo(m.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Atalhos */}
        <div className="space-y-3">
          <h3 className="font-semibold text-white px-1">Atalhos rápidos</h3>
          {[
            { to: '/organograma', label: 'Ver organograma', icon: Network, desc: 'Mapa de todas as IAs' },
            ...(isAdmin ? [{ to: '/configuracoes/ias', label: 'Adicionar IA', icon: Plus, desc: 'Nova IA ao escritório' }] : []),
          ].map(({ to, label, icon: Icon, desc }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 hover:border-brand-700/50 rounded-xl transition-colors group"
            >
              <div className="w-9 h-9 bg-brand-600/20 rounded-lg flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-brand-400 transition-colors" />
            </Link>
          ))}

          {/* Lista de IAs */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <List className="w-4 h-4 text-gray-400" />
                Suas IAs
              </h4>
            </div>
            <div className="divide-y divide-gray-800/50 max-h-48 overflow-y-auto scrollbar-thin">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/30 transition-colors cursor-pointer"
                  onClick={() => setChatAgent(a)}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[a.status] ?? 'bg-gray-500'}`} />
                  <span className="text-sm text-gray-300 flex-1 truncate">{a.nome}</span>
                  <span className="text-xs text-gray-600 capitalize">{a.status}</span>
                </div>
              ))}
              {agents.length === 0 && (
                <p className="px-4 py-4 text-xs text-gray-600 text-center">Nenhuma IA cadastrada</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat modal */}
      {chatAgent && (
        <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}
    </div>
  )
}
