import type { ThemeName } from '../types'
import { PIXEL } from '../constants'

export interface AgentRenderInfo {
  id: string
  name: string
  colorHex: string            // cor_hex from IA profile
  status: 'active' | 'idle' | 'error' | 'offline'
  isZeus?: boolean            // Zeus gets golden crown (retro)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function darken(hex: string, factor: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.floor(((n >> 16) & 0xff) * factor))
  const g = Math.min(255, Math.floor(((n >> 8) & 0xff) * factor))
  const b = Math.min(255, Math.floor((n & 0xff) * factor))
  return `rgb(${r},${g},${b})`
}

const STATUS_DOT: Record<string, string> = {
  active: '#22c55e',
  idle:   '#f59e0b',
  error:  '#ef4444',
  offline:'#6b7280',
}

// ─── Main entry: draw one agent sprite at canvas coords (cx, cy = top-center) ─
export function drawAgent(
  ctx: CanvasRenderingContext2D,
  theme: ThemeName,
  agent: AgentRenderInfo,
  cx: number,       // canvas x — center of sprite
  cy: number,       // canvas y — top of sprite
  scale: number,
  frame: number     // 0 = normal, 1 = blink frame
) {
  const p = PIXEL * scale

  if (theme === 'profissional') {
    drawAgent_profissional(ctx, agent, cx, cy, p)
    return
  }

  if (theme === 'moderno') {
    drawAgent_moderno(ctx, agent, cx, cy, p, frame)
  } else {
    drawAgent_retro(ctx, agent, cx, cy, p, frame)
  }
}

// ─── Profissional: just a colored circle + name ────────────────────────────────
function drawAgent_profissional(
  ctx: CanvasRenderingContext2D,
  agent: AgentRenderInfo,
  cx: number, cy: number, p: number
) {
  // Approximate circle with layered rects (diamond shape)
  const r = p * 3
  ctx.fillStyle = agent.colorHex
  ctx.fillRect(cx - r + p, cy,           r * 2 - p * 2, p)      // top cap
  ctx.fillRect(cx - r,     cy + p,       r * 2,         p * 4)  // wide middle
  ctx.fillRect(cx - r + p, cy + p * 5,  r * 2 - p * 2, p)      // bottom cap
  // Inner highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(cx - r + p, cy + p, p, p * 3)

  // Status dot (top-right)
  ctx.fillStyle = STATUS_DOT[agent.status] ?? STATUS_DOT.offline
  ctx.fillRect(cx + r - p, cy, p, p)

  // Name below
  ctx.fillStyle = '#94a3b8'
  ctx.font = `${Math.max(9, Math.round(p * 2.2))}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(agent.name.slice(0, 10), cx, cy + p * 8)
}

// ─── Retro: Zelda LTTP-style pixel sprite ─────────────────────────────────────
function drawAgent_retro(
  ctx: CanvasRenderingContext2D,
  agent: AgentRenderInfo,
  cx: number, cy: number, p: number,
  frame: number
) {
  const head  = agent.colorHex
  const body  = darken(head, 0.65)
  const limb  = darken(head, 0.50)
  const blink = frame === 1

  // Zeus crown
  if (agent.isZeus) {
    ctx.fillStyle = '#ffd700'
    ctx.fillRect(cx - 3 * p + p,     cy - 2 * p, p, 2 * p)  // left spike
    ctx.fillRect(cx - 3 * p + 3 * p, cy - 3 * p, p, 3 * p)  // center spike
    ctx.fillRect(cx - 3 * p + 5 * p, cy - 2 * p, p, 2 * p)  // right spike
    ctx.fillStyle = '#b8860b'
    ctx.fillRect(cx - 3 * p + p, cy, 5 * p, p)               // crown band
  }

  // Head (6×6 art px, centered: starts at cx - 3p)
  const hx = cx - 3 * p
  ctx.fillStyle = head
  ctx.fillRect(hx + p, cy, 6 * p, 6 * p)
  // Head shading
  ctx.fillStyle = darken(head, 0.75)
  ctx.fillRect(hx + p, cy + 5 * p, 6 * p, p)   // bottom edge
  ctx.fillRect(hx + 6 * p, cy + p, p, 4 * p)   // right edge
  // Head highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(hx + p, cy, p, p)

  // Eyes
  if (!blink) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(hx + 2 * p, cy + 2 * p, p, p)
    ctx.fillRect(hx + 4 * p, cy + 2 * p, p, p)
    ctx.fillStyle = '#1a1a1a'
    const d = Math.max(2, Math.round(p * 0.45))
    ctx.fillRect(hx + 2 * p, cy + 2 * p, d, d)
    ctx.fillRect(hx + 4 * p, cy + 2 * p, d, d)
  } else {
    ctx.fillStyle = darken(head, 0.6)
    const bh = Math.max(2, Math.round(p * 0.4))
    ctx.fillRect(hx + 2 * p, cy + 2 * p + Math.round(p * 0.3), p, bh)
    ctx.fillRect(hx + 4 * p, cy + 2 * p + Math.round(p * 0.3), p, bh)
  }

  // Belt buckle on retro body
  const bx = hx + p   // body starts 1p further right (body is 4p wide, centered)
  ctx.fillStyle = body
  ctx.fillRect(bx + p, cy + 6 * p, 4 * p, 6 * p)
  ctx.fillStyle = '#c8a840'
  ctx.fillRect(bx + 2 * p, cy + 10 * p, 2 * p, p)  // belt
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(bx + p, cy + 6 * p, p, 5 * p)        // body highlight

  // Arms
  ctx.fillStyle = limb
  ctx.fillRect(bx, cy + 7 * p, p, 4 * p)
  ctx.fillRect(bx + 5 * p, cy + 7 * p, p, 4 * p)

  // Legs
  ctx.fillStyle = limb
  ctx.fillRect(bx + p, cy + 12 * p, 2 * p, 3 * p)
  ctx.fillRect(bx + 3 * p, cy + 12 * p, 2 * p, 3 * p)
  ctx.fillStyle = darken(limb, 0.7)
  ctx.fillRect(bx + p, cy + 14 * p, 2 * p, p)
  ctx.fillRect(bx + 3 * p, cy + 14 * p, 2 * p, p)

  _drawStatusAndLabel(ctx, agent, cx, cy, p, '#ffd700')
}

// ─── Moderno: clean office look (suit/collar, no hat) ─────────────────────────
function drawAgent_moderno(
  ctx: CanvasRenderingContext2D,
  agent: AgentRenderInfo,
  cx: number, cy: number, p: number,
  frame: number
) {
  const head  = agent.colorHex
  const body  = '#1e3a5f'    // dark suit jacket
  const limb  = darken(head, 0.55)
  const blink = frame === 1

  const hx = cx - 3 * p
  // Head (6×6)
  ctx.fillStyle = head
  ctx.fillRect(hx + p, cy, 6 * p, 6 * p)
  ctx.fillStyle = darken(head, 0.75)
  ctx.fillRect(hx + p, cy + 5 * p, 6 * p, p)
  ctx.fillRect(hx + 6 * p, cy + p, p, 4 * p)

  // Eyes
  if (!blink) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(hx + 2 * p, cy + 2 * p, p, p)
    ctx.fillRect(hx + 4 * p, cy + 2 * p, p, p)
    ctx.fillStyle = '#1a1a1a'
    const d = Math.max(2, Math.round(p * 0.45))
    ctx.fillRect(hx + 2 * p, cy + 2 * p, d, d)
    ctx.fillRect(hx + 4 * p, cy + 2 * p, d, d)
    // Mouth
    ctx.fillStyle = darken(head, 0.55)
    ctx.fillRect(hx + 3 * p, cy + 4 * p, 2 * p, Math.max(1, Math.round(p * 0.4)))
  } else {
    const bh = Math.max(2, Math.round(p * 0.4))
    ctx.fillStyle = darken(head, 0.6)
    ctx.fillRect(hx + 2 * p, cy + 2 * p + Math.round(p * 0.3), p, bh)
    ctx.fillRect(hx + 4 * p, cy + 2 * p + Math.round(p * 0.3), p, bh)
  }

  const bx = hx + p
  // Jacket body
  ctx.fillStyle = body
  ctx.fillRect(bx + p, cy + 6 * p, 4 * p, 6 * p)
  // White shirt / collar
  ctx.fillStyle = '#f0f4f8'
  ctx.fillRect(bx + 2 * p, cy + 6 * p, 2 * p, 2 * p)
  // Lapels
  ctx.fillStyle = darken(body, 0.8)
  ctx.fillRect(bx + 2 * p, cy + 7 * p, p, p)
  ctx.fillRect(bx + 3 * p, cy + 7 * p, p, p)
  // Jacket highlight
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fillRect(bx + p, cy + 6 * p, p, 5 * p)

  // Arms (suit sleeves)
  ctx.fillStyle = body
  ctx.fillRect(bx, cy + 7 * p, p, 4 * p)
  ctx.fillRect(bx + 5 * p, cy + 7 * p, p, 4 * p)
  // Cuffs
  ctx.fillStyle = '#f0f4f8'
  ctx.fillRect(bx, cy + 10 * p, p, p)
  ctx.fillRect(bx + 5 * p, cy + 10 * p, p, p)

  // Legs (dark trousers)
  ctx.fillStyle = '#1a2540'
  ctx.fillRect(bx + p, cy + 12 * p, 2 * p, 3 * p)
  ctx.fillRect(bx + 3 * p, cy + 12 * p, 2 * p, 3 * p)
  // Shoes
  ctx.fillStyle = limb
  ctx.fillRect(bx + p, cy + 14 * p, 2 * p, p)
  ctx.fillRect(bx + 3 * p, cy + 14 * p, 2 * p, p)

  _drawStatusAndLabel(ctx, agent, cx, cy, p, '#1e2d3d')
}

// ─── Shared: status dot + name label ──────────────────────────────────────────
function _drawStatusAndLabel(
  ctx: CanvasRenderingContext2D,
  agent: AgentRenderInfo,
  cx: number, cy: number, p: number,
  labelColor: string
) {
  // Status dot (top-right of head area)
  const dotSize = Math.max(3, Math.round(p * 0.8))
  ctx.fillStyle = STATUS_DOT[agent.status] ?? STATUS_DOT.offline
  ctx.fillRect(cx + 3 * p, cy - Math.max(2, Math.round(p * 0.5)), dotSize, dotSize)

  // Name label below sprite
  ctx.fillStyle = labelColor
  ctx.font = `bold ${Math.max(9, Math.round(p * 2.2))}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(agent.name.slice(0, 8), cx, cy + 17 * p)
}
