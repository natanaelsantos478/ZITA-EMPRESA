import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { IAAgent } from '../types'

type StatusCallback = (agentId: string, status: IAAgent['status']) => void

export function useAgentStatus(companyId: string, onStatusChange: StatusCallback) {
  useEffect(() => {
    const channel = supabase
      .channel(`agent-status-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ia_agents',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const agent = payload.new as IAAgent
          if (agent?.id && agent?.status) {
            onStatusChange(agent.id, agent.status)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, onStatusChange])
}
