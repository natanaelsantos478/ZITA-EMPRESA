import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ChatMessage } from '../types'

const SESSION_PREFIX = 'zita_chat_'

function getSessionId(agentId: string): string {
  const key = `${SESSION_PREFIX}${agentId}`
  let sid = sessionStorage.getItem(key)
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem(key, sid)
  }
  return sid
}

export function useChat(agentId: string, companyId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  const sessionId = getSessionId(agentId)

  useEffect(() => {
    if (!agentId) return

    setLoading(true)
    supabase
      .from('chat_messages')
      .select('*')
      .eq('company_id', companyId)
      .eq('agent_id', agentId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMessages(data ?? [])
        setLoading(false)
      })
  }, [agentId, companyId, sessionId])

  // Realtime subscription for new messages
  useEffect(() => {
    if (!agentId) return

    const channel = supabase
      .channel(`chat-${agentId}-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage
          if (msg.session_id === sessionId) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId, sessionId])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return

      setSending(true)

      // Optimistically add user message
      const tempId = `temp-${Date.now()}`
      const userMsg: ChatMessage = {
        id: tempId,
        company_id: companyId,
        agent_id: agentId,
        session_id: sessionId,
        role: 'user',
        content,
        is_action: false,
        action_type: null,
        action_data: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      // Persist user message
      await supabase.from('chat_messages').insert({
        company_id: companyId,
        agent_id: agentId,
        session_id: sessionId,
        role: 'user',
        content,
        is_action: false,
      })

      // Show typing indicator
      setIsTyping(true)
      setSending(false)

      // Hide typing after 1.5s (real response comes via realtime or we add placeholder)
      setTimeout(() => setIsTyping(false), 1500)
    },
    [agentId, companyId, sessionId, sending],
  )

  const clearHistory = useCallback(async () => {
    await supabase
      .from('chat_messages')
      .delete()
      .eq('company_id', companyId)
      .eq('agent_id', agentId)
      .eq('session_id', sessionId)
    setMessages([])
  }, [agentId, companyId, sessionId])

  return { messages, loading, sending, isTyping, sendMessage, clearHistory }
}
