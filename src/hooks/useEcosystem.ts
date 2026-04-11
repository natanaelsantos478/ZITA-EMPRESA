/**
 * useEcosystem.ts
 *
 * Hook React que inicia o ecossistema de IAs no client.
 * - Ao montar: processa ações pendentes imediatamente
 * - Realtime: processa assim que chega uma ação nova
 * - Polling 30s: garante que nada seja perdido
 * - Retorna engine para uso direto na UI (enviar ações, salvar memórias, etc.)
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { IaAgent } from '../types'
import { EcosystemEngine } from '../lib/ecosystem/EcosystemEngine'
import type { IaAcao, IaMemoria } from '../lib/ecosystem/EcosystemEngine'
import { useAuth } from '../contexts/AuthContext'

export type { IaAcao, IaMemoria }

interface EcosystemState {
  pendingCount: number
  lastProcessed: Date | null
  isProcessing: boolean
}

export function useEcosystem(agents: IaAgent[]) {
  const { companyId } = useAuth()

  const engineRef  = useRef<EcosystemEngine | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const processingRef = useRef(false)

  const [state, setState] = useState<EcosystemState>({
    pendingCount:  0,
    lastProcessed: null,
    isProcessing:  false,
  })

  // IDs dos agentes que este cliente pode processar
  // (aqueles que têm Gemini key configurada — global ou própria)
  const globalKey = import.meta.env.VITE_GEMINI_KEY as string | undefined
  const processableIds = agents
    .filter(a => a.integracao_config?.gemini_api_key || globalKey)
    .map(a => a.id)

  // ── Core processing ────────────────────────────────────────────────────────

  const processQueue = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || processingRef.current || processableIds.length === 0) return

    processingRef.current = true
    setState(s => ({ ...s, isProcessing: true }))

    try {
      const pending = await engine.fetchPending(processableIds)

      if (pending.length > 0) {
        setState(s => ({ ...s, pendingCount: pending.length }))

        // Process sequentially to avoid hammering Gemini
        for (const acao of pending) {
          await engine.processAction(acao)
        }

        setState(s => ({
          ...s,
          pendingCount:  0,
          lastProcessed: new Date(),
        }))
      }
    } finally {
      processingRef.current = false
      setState(s => ({ ...s, isProcessing: false }))
    }
  }, [processableIds.join(',')])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending count (for badge) ──────────────────────────────────────────────

  const refreshCount = useCallback(async () => {
    if (!companyId || processableIds.length === 0) return
    const { count } = await supabase
      .from('ia_acoes')
      .select('id', { count: 'exact', head: true })
      .in('para_agent_id', processableIds)
      .eq('status', 'pendente')
    setState(s => ({ ...s, pendingCount: count ?? 0 }))
  }, [companyId, processableIds.join(',')])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init & realtime ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return

    const engine = new EcosystemEngine(agents, companyId)
    engineRef.current = engine

    // Process queue immediately on mount
    processQueue()
    refreshCount()

    // Poll every 30s (backup for missed realtime events)
    pollRef.current = setInterval(() => {
      processQueue()
      refreshCount()
    }, 30_000)

    // Realtime: trigger processing when a new pending action arrives
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(`ecosystem-${companyId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'ia_acoes',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const nova = payload.new as IaAcao
          if (nova.status === 'pendente' && processableIds.includes(nova.para_agent_id)) {
            processQueue()
          } else {
            refreshCount()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'ia_acoes',
          filter: `company_id=eq.${companyId}`,
        },
        () => refreshCount()
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (pollRef.current)    clearInterval(pollRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // Update engine when agents list changes
  useEffect(() => {
    engineRef.current?.updateAgents(agents)
  }, [agents])

  // ── Convenience wrappers (used directly in UI) ─────────────────────────────

  const sendAction = useCallback((
    ...args: Parameters<EcosystemEngine['sendAction']>
  ) => engineRef.current?.sendAction(...args) ?? Promise.resolve(null), [])

  const saveMemoria = useCallback((
    ...args: Parameters<EcosystemEngine['saveMemoria']>
  ) => engineRef.current?.saveMemoria(...args) ?? Promise.resolve(null), [])

  const fetchMemories = useCallback((agentId: string) =>
    engineRef.current?.fetchMemories(agentId) ?? Promise.resolve([]), [])

  const zeusBroadcast = useCallback((
    ...args: Parameters<EcosystemEngine['zeusBroadcast']>
  ) => engineRef.current?.zeusBroadcast(...args) ?? Promise.resolve(), [])

  const cancelAction = useCallback((id: string) =>
    engineRef.current?.cancelAction(id) ?? Promise.resolve(), [])

  const fetchHistory = useCallback((limit?: number) =>
    engineRef.current?.fetchHistory(limit) ?? Promise.resolve([]), [])

  return {
    engine:         engineRef.current,
    state,
    processableIds,
    // Action API
    sendAction,
    cancelAction,
    fetchHistory,
    // Memory API
    saveMemoria,
    fetchMemories,
    // Zeus
    zeusBroadcast,
    // Manual trigger
    processQueue,
  }
}
