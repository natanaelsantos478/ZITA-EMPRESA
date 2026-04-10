export type AnimState = 'idle' | 'typing' | 'talking' | 'walking'

export interface AgentAnim {
  state: AnimState
  speechText?: string
  speechUntil?: number   // timestamp ms
  walkFrom?: { cx: number; cy: number }
  walkTarget?: { cx: number; cy: number }
  walkStart?: number     // timestamp ms
  walkDuration?: number  // ms
  returnTo?: { cx: number; cy: number }
}

export type AnimMap = Map<string, AgentAnim>

// ─── Triggers ─────────────────────────────────────────────────────────────────

export function triggerTyping(map: AnimMap, agentId: string) {
  map.set(agentId, { state: 'typing' })
}

export function triggerTalk(map: AnimMap, agentId: string, text: string) {
  map.set(agentId, {
    state: 'talking',
    speechText: text.slice(0, 40),
    speechUntil: Date.now() + 4000,
  })
}

/** Walk from `from` toward `to`, show speech bubble on arrival, then return to desk */
export function triggerWalkAndTalk(
  map: AnimMap,
  agentId: string,
  from: { cx: number; cy: number },
  to: { cx: number; cy: number },
  speechText: string,
) {
  map.set(agentId, {
    state: 'walking',
    walkFrom: from,
    walkTarget: to,
    walkStart: Date.now(),
    walkDuration: 1200,
    returnTo: from,
    speechText,
  })
}

// ─── Position getter ──────────────────────────────────────────────────────────

/** Returns the current visual position of an agent considering walking state */
export function getAnimPos(
  anim: AgentAnim | undefined,
  defaultPos: { cx: number; cy: number },
): { cx: number; cy: number } {
  if (!anim || anim.state !== 'walking') return defaultPos
  if (!anim.walkFrom || !anim.walkTarget || !anim.walkStart || !anim.walkDuration) return defaultPos
  const raw = Math.min(1, (Date.now() - anim.walkStart) / anim.walkDuration)
  // ease in-out
  const t = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw
  return {
    cx: anim.walkFrom.cx + (anim.walkTarget.cx - anim.walkFrom.cx) * t,
    cy: anim.walkFrom.cy + (anim.walkTarget.cy - anim.walkFrom.cy) * t,
  }
}

// ─── Per-frame tick ───────────────────────────────────────────────────────────

export function tickAnims(map: AnimMap) {
  const now = Date.now()
  for (const [id, anim] of map.entries()) {
    if (anim.state === 'walking' && anim.walkStart && anim.walkDuration) {
      if (now - anim.walkStart > anim.walkDuration) {
        // Arrived → show speech bubble
        map.set(id, {
          state: 'talking',
          speechText: anim.speechText,
          speechUntil: now + 3500,
          returnTo: anim.returnTo,
        })
      }
    } else if (anim.state === 'talking' && anim.speechUntil && now > anim.speechUntil) {
      if (anim.returnTo) {
        // Walk back to desk
        const current = anim.walkTarget ?? anim.returnTo
        map.set(id, {
          state: 'walking',
          walkFrom: current,
          walkTarget: anim.returnTo,
          walkStart: now,
          walkDuration: 1000,
        })
      } else {
        map.set(id, { state: 'idle' })
      }
    }
  }
}
