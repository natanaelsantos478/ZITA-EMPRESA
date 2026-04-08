import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export function useRealtime<T>(
  table: string,
  filter: string | undefined,
  callback: (payload: T) => void,
  event: RealtimeEvent = '*'
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const channelName = `${table}-${filter ?? 'all'}-${Date.now()}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pgConfig: any = { event, schema: 'public', table }
    if (filter) pgConfig.filter = filter

    const channel = supabase
      .channel(channelName)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, pgConfig, (payload: any) => {
        callbackRef.current(payload.new as T)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter, event])
}
