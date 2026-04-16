import { useState, useEffect, useRef, useCallback } from 'react'
import type { IaAgent } from '../../../types'
import type { SalaConfig } from './Sala2D'

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type SimActivityState = 'SITTING'

export interface AgentSimState {
  agentId: string
  state:   SimActivityState
  targetX: number
  targetY: number
  homeX:   number
  homeY:   number
  salaId:  string
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

// ─── Hook principal ──────────────────────────────────────────────────────────

export function useAgentSimulation(opts: SimOptions): {
  simStates: Record<string, AgentSimState>
} {
  const [simStates, setSimStates] = useState<Record<string, AgentSimState>>({})

  const posRef = useRef(opts.agentPos)
  const salasRef = useRef(opts.salas)
  const furRef = useRef(opts.salaFurniture)

  useEffect(() => { posRef.current = opts.agentPos },      [opts.agentPos])
  useEffect(() => { salasRef.current = opts.salas },       [opts.salas])
  useEffect(() => { furRef.current = opts.salaFurniture }, [opts.salaFurniture])

  const initAgent = useCallback((agent: IaAgent): AgentSimState => {
    const pos  = posRef.current[agent.id]
    const sala = salasRef.current.find(s => s.id === (pos?.salaId ?? 'escritorio'))

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
      homeX = sala.x + best.x + 4
      homeY = sala.y + 28 + best.y + 4
    }

    return {
      agentId: agent.id,
      state:   'SITTING',
      targetX: homeX,
      targetY: homeY,
      homeX,
      homeY,
      salaId:  pos?.salaId ?? 'escritorio',
    }
  }, [])

  useEffect(() => {
    setSimStates(prev => {
      const next = { ...prev }
      let changed = false
      for (const agent of opts.agents) {
        const newSala = opts.agentPos[agent.id]?.salaId ?? 'escritorio'
        if (!next[agent.id] || next[agent.id].salaId !== newSala) {
          next[agent.id] = initAgent(agent)
          changed = true
        }
      }
      for (const id of Object.keys(next)) {
        if (!opts.agents.find(a => a.id === id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [opts.agents, opts.agentPos, initAgent])

  return { simStates }
}
