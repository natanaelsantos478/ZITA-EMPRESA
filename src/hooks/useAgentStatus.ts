import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { IaAgent, AgentStatus } from '../types'
import { useAuth } from '../contexts/AuthContext'

export function useAgentStatus() {
  const { companyId } = useAuth()
  const [agents, setAgents] = useState<IaAgent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return

    supabase
      .from('ia_agents')
      .select('*')
      .eq('company_id', companyId)
      .order('tipo', { ascending: true })
      .then(({ data }) => {
        if (data) setAgents(data as IaAgent[])
        setLoading(false)
      })

    const channel = supabase
      .channel(`agents-status-${companyId}`)
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

