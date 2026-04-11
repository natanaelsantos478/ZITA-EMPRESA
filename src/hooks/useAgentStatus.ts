import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { IaAgent, AgentStatus } from '../types'
import { useAuth } from '../contexts/AuthContext'

export function useAgentStatus() {
  const { companyId } = useAuth()
  const [agents, setAgents] = useState<IaAgent[]>([])
  const [loading, setLoading] = useState(true)

  // Unique suffix per hook instance — prevents crash when multiple components
  // call useAgentStatus() simultaneously (Supabase throws if you call .on()
  // after .subscribe() on a channel with the same name).
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    if (!companyId) { setLoading(false); return }

    supabase
      .from('ia_agents')
      .select('*')
      .eq('company_id', companyId)
      .order('tipo', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setAgents(data as IaAgent[])
        setLoading(false)
      })

    const channelName = `agents-${companyId}-${instanceId.current}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ia_agents', filter: `company_id=eq.${companyId}` },
        (payload) => {
          setAgents((prev) =>
            prev.map((a) => (a.id === payload.new.id ? { ...a, ...(payload.new as IaAgent) } : a))
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ia_agents', filter: `company_id=eq.${companyId}` },
        (payload) => {
          setAgents((prev) => [...prev, payload.new as IaAgent])
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'ia_agents', filter: `company_id=eq.${companyId}` },
        (payload) => {
          setAgents((prev) => prev.filter((a) => a.id !== (payload.old as IaAgent).id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId])

  const statusMap: Record<string, AgentStatus> = {}
  agents.forEach((a) => { statusMap[a.id] = a.status })

  return { agents, statusMap, loading }
}
