import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface RealtimeOptions<T> {
  channel: string
  table: string
  filter?: string
  onInsert?: (row: T) => void
  onUpdate?: (row: T) => void
  onDelete?: (oldRow: Partial<T>) => void
}

export function useRealtime<T>({
  channel,
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
}: RealtimeOptions<T>) {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = supabase
      .channel(channel)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, filter },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === 'INSERT' && onInsert) onInsert(payload.new as T)
          if (payload.eventType === 'UPDATE' && onUpdate) onUpdate(payload.new as T)
          if (payload.eventType === 'DELETE' && onDelete) onDelete(payload.old as Partial<T>)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [channel, table, filter, onInsert, onUpdate, onDelete])
}
