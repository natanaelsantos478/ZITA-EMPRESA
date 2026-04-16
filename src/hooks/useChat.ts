import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { IaConversa, IaMensagem } from '../types'
import { useAuth } from '../contexts/AuthContext'

export function useChat(agentId: string) {
  const { user, profile, companyId } = useAuth()
  const [conversa, setConversa] = useState<IaConversa | null>(null)
  const [mensagens, setMensagens] = useState<IaMensagem[]>([])
  const [loading, setLoading] = useState(false)
  const [typing, setTyping] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const conversaRef = useRef<IaConversa | null>(null)

  // Refs for auth values — avoids recreating callbacks on token refresh
  const userRef    = useRef(user)
  const profileRef = useRef(profile)
  const companyIdRef = useRef(companyId)
  useEffect(() => { userRef.current    = user },    [user])
  useEffect(() => { profileRef.current = profile }, [profile])
  useEffect(() => { companyIdRef.current = companyId }, [companyId])

  const createConversa = useCallback(async (): Promise<IaConversa | null> => {
    const cid = companyIdRef.current
    const uid = userRef.current
    if (!cid || !uid) return null

    const { data: conv, error } = await supabase
      .from('ia_conversas')
      .insert({ company_id: cid, agent_id: agentId, iniciada_por: uid.id, status: 'ativa', contexto: {} })
      .select()
      .single()

    if (conv) return conv as IaConversa

    // SELECT after INSERT can silently fail due to RLS timing — fallback: fetch most recent
    if (error) {
      const { data: existing } = await supabase
        .from('ia_conversas')
        .select('*')
        .eq('company_id', cid)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return (existing as IaConversa) ?? null
    }
    return null
  }, [agentId])

  const initConversa = useCallback(async () => {
    if (!companyIdRef.current || !userRef.current) return
    setLoading(true)
    const conv = await createConversa()
    if (conv) {
      conversaRef.current = conv
      setConversa(conv)
      setMensagens([])
    }
    setLoading(false)
  }, [agentId, createConversa])

  const loadConversa = useCallback(async (conversaId: string) => {
    setLoading(true)
    const { data: conv } = await supabase
      .from('ia_conversas')
      .select('*')
      .eq('id', conversaId)
      .single()

    const { data: msgs } = await supabase
      .from('ia_mensagens')
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true })

    if (conv) { conversaRef.current = conv as IaConversa; setConversa(conv as IaConversa) }
    if (msgs) setMensagens(msgs as IaMensagem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const id = conversaRef.current?.id ?? conversa?.id
    if (!id) return

    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ia_mensagens', filter: `conversa_id=eq.${id}` },
        (payload) => {
          const nova = payload.new as IaMensagem
          setMensagens((prev) => {
            if (prev.find((m) => m.id === nova.id)) return prev
            return [...prev, nova]
          })
          setTyping(false)
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [conversa?.id])

  const sendMessage = useCallback(async (conteudo: string) => {
    const cid     = companyIdRef.current
    const prof    = profileRef.current
    if (!cid || !prof || !userRef.current) return

    let activeConversa = conversaRef.current ?? conversa
    if (!activeConversa) {
      const newConv = await createConversa()
      if (!newConv) return
      conversaRef.current = newConv
      setConversa(newConv)
      activeConversa = newConv
    }

    const { data: msgHumana, error: msgErr } = await supabase
      .from('ia_mensagens')
      .insert({
        conversa_id: activeConversa.id,
        company_id: cid,
        remetente_tipo: 'humano',
        remetente_id: prof.id,
        remetente_nome: prof.nome,
        conteudo,
        conteudo_tipo: 'texto',
        metadados: {},
        tokens_prompt: 0,
        tokens_resposta: 0,
      })
      .select()
      .single()

    if (msgErr) console.error('[useChat] INSERT mensagem:', msgErr.message)

    if (msgHumana) {
      setMensagens((prev) => {
        if (prev.find((m) => m.id === (msgHumana as IaMensagem).id)) return prev
        return [...prev, msgHumana as IaMensagem]
      })
    }

    setTyping(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const resp = await supabase.functions.invoke('ia-dispatcher', {
        body: {
          conversa_id: activeConversa.id,
          agent_id: agentId,
          mensagem: conteudo,
          company_id: cid,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (resp.error) setTyping(false)
    } catch {
      setTyping(false)
    }
  }, [conversa, agentId, createConversa])

  return { conversa, mensagens, loading, typing, initConversa, loadConversa, sendMessage }
}
