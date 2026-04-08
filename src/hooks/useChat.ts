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

  const initConversa = useCallback(async () => {
    if (!companyId || !user) return
    setLoading(true)

    // Criar nova conversa
    const { data: conv } = await supabase
      .from('ia_conversas')
      .insert({
        company_id: companyId,
        agent_id: agentId,
        iniciada_por: user.id,
        status: 'ativa',
        contexto: {},
      })
      .select()
      .single()

    if (conv) {
      setConversa(conv as IaConversa)
      setMensagens([])
    }
    setLoading(false)
  }, [companyId, user, agentId])

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

    if (conv) setConversa(conv as IaConversa)
    if (msgs) setMensagens(msgs as IaMensagem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!conversa) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`chat-${conversa.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ia_mensagens', filter: `conversa_id=eq.${conversa.id}` },
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversa?.id])

  const sendMessage = useCallback(async (conteudo: string) => {
    if (!conversa || !companyId || !profile) return

    // Inserir mensagem humana
    const { data: msgHumana } = await supabase
      .from('ia_mensagens')
      .insert({
        conversa_id: conversa.id,
        company_id: companyId,
        remetente_tipo: 'humano',
        remetente_id: profile.id,
        remetente_nome: profile.nome,
        conteudo,
        conteudo_tipo: 'text',
        metadados: {},
        tokens_prompt: 0,
        tokens_resposta: 0,
      })
      .select()
      .single()

    if (msgHumana) {
      setMensagens((prev) => {
        if (prev.find((m) => m.id === (msgHumana as IaMensagem).id)) return prev
        return [...prev, msgHumana as IaMensagem]
      })
    }

    setTyping(true)

    // Chamar ia-dispatcher via Edge Function
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const resp = await supabase.functions.invoke('ia-dispatcher', {
        body: {
          conversa_id: conversa.id,
          agent_id: agentId,
          mensagem: conteudo,
          company_id: companyId,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (resp.error) {
        // Modo demonstração — inserir resposta simulada
        await supabase.from('ia_mensagens').insert({
          conversa_id: conversa.id,
          company_id: companyId,
          remetente_tipo: 'ia',
          remetente_nome: 'Zeus',
          conteudo: 'Recebi sua mensagem. Estou processando sua solicitação.',
          conteudo_tipo: 'text',
          metadados: { modo: 'demo' },
          tokens_prompt: 0,
          tokens_resposta: 0,
        })
      }
    } catch {
      setTyping(false)
    }
  }, [conversa, companyId, profile, agentId])

  return { conversa, mensagens, loading, typing, initConversa, loadConversa, sendMessage }
}
