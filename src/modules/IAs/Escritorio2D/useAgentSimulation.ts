import { useState, useEffect, useRef, useCallback } from 'react'
import type { IaAgent } from '../../../types'
import type { SalaConfig } from './Sala2D'

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type SimActivityState = 'SITTING' | 'WALKING' | 'BATHROOM' | 'CHATTING'

export interface AgentSimState {
  agentId:        string
  state:          SimActivityState
  targetX:        number   // posição canvas absoluta (x)
  targetY:        number   // posição canvas absoluta (y)
  homeX:          number   // cadeira de origem (X)
  homeY:          number   // cadeira de origem (Y)
  stateTimer:     number   // ticks de 1000ms restantes no estado atual
  salaId:         string
  chatPartnerId?: string
  chatMessage?:   string
  chatExpiry?:    number   // Date.now() + 4000ms
}

export type FurnitureItem = {
  id: string
  type: 'desk' | 'chair'
  x: number
  y: number
  rotation: 0 | 90 | 180 | 270
}

export type FurnitureMap = Record<string, FurnitureItem[]>

interface SimOptions {
  agents:        IaAgent[]
  agentPos:      Record<string, { x: number; y: number; salaId: string }>
  salas:         SalaConfig[]
  salaFurniture: FurnitureMap
  enabled:       boolean
}

// ─── Frases de conversa casual em PT-BR ─────────────────────────────────────

const CHAT_MESSAGES = [
  'Viu o relatório de ontem?',
  'Reunião às 15h confirmada!',
  'Preciso de acesso ao sistema.',
  'Esse bug está me enlouquecendo...',
  'O cliente aprovou a proposta!',
  'Deploy feito, tudo ok.',
  'Alguém tem o login do dashboard?',
  'Fechei mais uma tarefa hoje!',
  'A API está um pouco lenta.',
  'Vou tomar um café, quer?',
  'Olha esse resultado aqui!',
  'Mandei o e-mail pro cliente.',
  'Preciso revisar esse código.',
  'Você viu a nova feature?',
  'Erro 500 em produção!!',
  'Já resolvi, era só um typo.',
  'Integração funcionando!',
  'Zeus delegou uma tarefa nova.',
  'Reunião de alinhamento amanhã.',
  'Sprint terminando na sexta.',
  'Acabei de processar 50 tickets!',
  'Tem uma análise pendente aqui.',
  'Fluxo automatizado rodando!',
  'Viu aquele novo relatório?',
  'Finalizei a análise de dados.',
]

// ─── Probabilidades de transição (por tick de 1000ms) ───────────────────────

const TRANSITIONS: Record<SimActivityState, { next: SimActivityState; prob: number }[]> = {
  SITTING:  [
    { next: 'WALKING',  prob: 0.04 },
    { next: 'BATHROOM', prob: 0.02 },
    { next: 'CHATTING', prob: 0.03 },
  ],
  WALKING:  [{ next: 'SITTING', prob: 0.28 }],
  BATHROOM: [{ next: 'SITTING', prob: 0.33 }],
  CHATTING: [{ next: 'SITTING', prob: 0.28 }],
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Lógica de transição entre estados ───────────────────────────────────────

function transitionTo(
  agent: IaAgent,
  s: AgentSimState,
  next: SimActivityState,
  agents: IaAgent[],
  agentPos: Record<string, { x: number; y: number; salaId: string }>,
  salas: SalaConfig[],
): Partial<AgentSimState> {
  const sala = salas.find(sl => sl.id === s.salaId)

  if (next === 'WALKING' && sala) {
    // Andar para posição aleatória dentro da sala
    const padding = 30
    const innerX = sala.x + padding + Math.random() * (sala.w - padding * 2)
    const innerY = sala.y + 28 + padding + Math.random() * (sala.h - 28 - padding * 2)
    return {
      state: 'WALKING',
      targetX: Math.max(sala.x + 10, Math.min(sala.x + sala.w - 70, innerX)),
      targetY: Math.max(sala.y + 40, Math.min(sala.y + sala.h - 70, innerY)),
      stateTimer: rand(3, 7),
    }
  }

  if (next === 'BATHROOM' && sala) {
    // Agente sai da sala para o banheiro
    return {
      state: 'BATHROOM',
      targetX: sala.x - 55,
      targetY: sala.y + 20,
      stateTimer: rand(4, 9),
    }
  }

  if (next === 'CHATTING') {
    // Encontrar colega na mesma sala
    const colleagues = agents.filter(a =>
      a.id !== agent.id &&
      (agentPos[a.id]?.salaId ?? 'escritorio') === s.salaId
    )
    if (colleagues.length === 0) {
      // Sem colegas, continuar sentado
      return { state: 'SITTING', targetX: s.homeX, targetY: s.homeY, stateTimer: 0 }
    }
    const partner = pickRandom(colleagues)
    const partnerPos = agentPos[partner.id]
    if (!partnerPos) return { state: 'SITTING', targetX: s.homeX, targetY: s.homeY, stateTimer: 0 }

    // Mover levemente em direção ao parceiro
    const dx = partnerPos.x - s.targetX
    const dy = partnerPos.y - s.targetY
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const moveX = s.targetX + (dx / dist) * Math.min(24, dist * 0.4)
    const moveY = s.targetY + (dy / dist) * Math.min(24, dist * 0.4)

    return {
      state: 'CHATTING',
      targetX: moveX,
      targetY: moveY,
      stateTimer: rand(5, 11),
      chatPartnerId: partner.id,
      chatMessage: pickRandom(CHAT_MESSAGES),
      chatExpiry: Date.now() + 4200,
    }
  }

  // Default: voltar para casa (cadeira)
  return {
    state: 'SITTING',
    targetX: s.homeX,
    targetY: s.homeY,
    stateTimer: rand(2, 5),
    chatPartnerId: undefined,
    chatMessage: undefined,
    chatExpiry: undefined,
  }
}

// ─── Tick principal da simulação ──────────────────────────────────────────────

function tick(
  prev: Record<string, AgentSimState>,
  agents: IaAgent[],
  agentPos: Record<string, { x: number; y: number; salaId: string }>,
  salas: SalaConfig[],
): Record<string, AgentSimState> {
  const now = Date.now()
  const next = { ...prev }

  for (const agent of agents) {
    const s = prev[agent.id]
    if (!s) continue

    // Expirar balão de chat
    if (s.chatExpiry && now > s.chatExpiry && s.chatMessage) {
      next[agent.id] = { ...s, chatMessage: undefined, chatExpiry: undefined, chatPartnerId: undefined }
      continue
    }

    // Decrementar timer
    if (s.stateTimer > 0) {
      next[agent.id] = { ...s, stateTimer: s.stateTimer - 1 }
      continue
    }

    // Tentar transição de estado
    const transitions = TRANSITIONS[s.state]
    let transitioned = false
    for (const { next: nextState, prob } of transitions) {
      if (Math.random() < prob) {
        const patch = transitionTo(agent, s, nextState, agents, agentPos, salas)
        next[agent.id] = { ...s, ...patch } as AgentSimState
        transitioned = true
        break
      }
    }
    if (!transitioned) {
      next[agent.id] = { ...s, stateTimer: rand(1, 3) }
    }
  }

  return next
}

// ─── Hook principal ──────────────────────────────────────────────────────────

export function useAgentSimulation(opts: SimOptions): {
  simStates: Record<string, AgentSimState>
} {
  const [simStates, setSimStates] = useState<Record<string, AgentSimState>>({})
  const [visible, setVisible]     = useState(!document.hidden)

  // Refs estáveis para evitar stale closures no interval
  const agentsRef = useRef(opts.agents)
  const posRef    = useRef(opts.agentPos)
  const salasRef  = useRef(opts.salas)
  const furRef    = useRef(opts.salaFurniture)

  useEffect(() => { agentsRef.current = opts.agents },        [opts.agents])
  useEffect(() => { posRef.current    = opts.agentPos },      [opts.agentPos])
  useEffect(() => { salasRef.current  = opts.salas },         [opts.salas])
  useEffect(() => { furRef.current    = opts.salaFurniture }, [opts.salaFurniture])

  // Page Visibility API — pausa simulação quando aba oculta
  useEffect(() => {
    const h = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  // Inicializar estados dos agentes quando lista muda
  const initAgent = useCallback(
    (agent: IaAgent): AgentSimState => {
      const pos  = posRef.current[agent.id]
      const sala = salasRef.current.find(s => s.id === (pos?.salaId ?? 'escritorio'))

      // Tentar encontrar cadeira mais próxima na sala
      let homeX = pos?.x ?? 100
      let homeY = pos?.y ?? 100
      const furniture = furRef.current[pos?.salaId ?? ''] ?? []
      const chairs = furniture.filter(f => f.type === 'chair')
      if (chairs.length > 0 && sala) {
        const best = chairs.reduce((closest, ch) => {
          const dx1 = (sala.x + ch.x) - homeX
          const dy1 = (sala.y + 28 + ch.y) - homeY
          const dx2 = (sala.x + closest.x) - homeX
          const dy2 = (sala.y + 28 + closest.y) - homeY
          return dx1 * dx1 + dy1 * dy1 < dx2 * dx2 + dy2 * dy2 ? ch : closest
        })
        if (sala) {
          homeX = sala.x + best.x + 4
          homeY = sala.y + 28 + best.y + 4
        }
      }

      return {
        agentId:    agent.id,
        state:      'SITTING',
        targetX:    homeX,
        targetY:    homeY,
        homeX,
        homeY,
        stateTimer: rand(2, 8),
        salaId:     pos?.salaId ?? 'escritorio',
      }
    },
    [],
  )

  useEffect(() => {
    setSimStates(prev => {
      const next = { ...prev }
      let changed = false
      for (const agent of opts.agents) {
        if (!next[agent.id]) {
          next[agent.id] = initAgent(agent)
          changed = true
        } else if (next[agent.id].salaId !== (opts.agentPos[agent.id]?.salaId ?? 'escritorio')) {
          // Agente mudou de sala — reinicializar
          next[agent.id] = initAgent(agent)
          changed = true
        }
      }
      // Remover agentes deletados
      for (const id of Object.keys(next)) {
        if (!opts.agents.find(a => a.id === id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [opts.agents, opts.agentPos, initAgent])

  // Loop de simulação — 1 tick por segundo
  useEffect(() => {
    if (!opts.enabled || !visible) return
    const id = setInterval(() => {
      setSimStates(prev =>
        tick(prev, agentsRef.current, posRef.current, salasRef.current)
      )
    }, 1000)
    return () => clearInterval(id)
  }, [opts.enabled, visible])

  return { simStates }
}
