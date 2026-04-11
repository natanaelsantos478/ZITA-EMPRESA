import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { IaAgent, IaConversa, IaMensagem } from '../types'
import { useAuth } from '../contexts/AuthContext'

// ── Gemini integration ────────────────────────────────────────────────────────
// Key priority: agent.integracao_config.gemini_api_key → VITE_GEMINI_KEY
async function callGemini(
  agent: IaAgent,
  history: IaMensagem[],
  userMessage: string,
): Promise<string | null> {
  const apiKey =
    (agent.integracao_config?.gemini_api_key as string | undefined) ||
    (import.meta.env.VITE_GEMINI_KEY as string | undefined)

  if (!apiKey) return null

  const systemPrompt =
    agent.personalidade?.prompt_sistema ||
    `Você é ${agent.nome}${agent.funcao ? `, especializado em ${agent.funcao}` : ''}. Responda sempre em português do Brasil de forma clara e objetiva.`

  // Build conversation history in Gemini format (must alternate user/model)
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  for (const m of history) {
    if (m.remetente_tipo === 'sistema') continue
    const role = m.remetente_tipo === 'humano' ? 'user' : 'model'
    // Gemini requires strict alternation — skip consecutive same-role messages
    const last = contents[contents.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += '\n' + m.conteudo
    } else {
      contents.push({ role, parts: [{ text: m.conteudo }] })
    }
  }
  // Add current user message
  const last = contents[contents.length - 1]
  if (last?.role === 'user') {
    last.parts[0].text += '\n' + userMessage
  } else {
    contents.push({ role: 'user', parts: [{ text: userMessage }] })
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: agent.personalidade?.temperatura ?? 0.7,
            maxOutputTokens: agent.personalidade?.max_tokens ?? 1024,
          },
        }),
      }
    )

    if (!resp.ok) {
      console.error('[Gemini] HTTP error', resp.status, await resp.text())
      return null
    }

    const data = await resp.json()
    return (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? null
  } catch (err) {
    console.error('[Gemini] fetch error', err)
    return null
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useChat(agent: IaAgent) {
  const agentId = agent.id
  const { user, profile, companyId } = useAuth()
  const [conversa, setConversa] = useState<IaConversa | null>(null)
  const [mensagens, setMensagens] = useState<IaMensagem[]>([])
  const [loading, setLoading] = useState(false)
  const [typing, setTyping] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const initConversa = useCallback(async () => {
    if (!companyId || !user) return
    setLoading(true)

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
      .channel(`chat-${conversa.id}-${Date.now()}`)
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

    // 1. Inserir mensagem humana
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

    // 2. Tentar Gemini primeiro
    const geminiReply = await callGemini(agent, mensagens, conteudo)

    if (geminiReply) {
      await supabase.from('ia_mensagens').insert({
        conversa_id: conversa.id,
        company_id: companyId,
        remetente_tipo: 'ia',
        remetente_nome: agent.nome,
        conteudo: geminiReply,
        conteudo_tipo: 'text',
        metadados: { modelo: 'gemini-2.0-flash', gemini: true },
        tokens_prompt: 0,
        tokens_resposta: 0,
      })
      setTyping(false)
      return
    }

    // 3. Fallback: tentar edge function ia-dispatcher
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
        // Modo demonstração — resposta genérica
        await supabase.from('ia_mensagens').insert({
          conversa_id: conversa.id,
          company_id: companyId,
          remetente_tipo: 'ia',
          remetente_nome: agent.nome,
          conteudo: `Olá! Sou ${agent.nome}. Recebi sua mensagem. Para ativar respostas inteligentes, configure a chave Gemini nas configurações.`,
          conteudo_tipo: 'text',
          metadados: { modo: 'demo' },
          tokens_prompt: 0,
          tokens_resposta: 0,
        })
      }
    } catch {
      setTyping(false)
    }
  }, [conversa, companyId, profile, agentId, agent, mensagens])

  return { conversa, mensagens, loading, typing, initConversa, loadConversa, sendMessage }
}
