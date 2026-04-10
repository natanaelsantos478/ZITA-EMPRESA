import type { IaAgent } from '../../../../types'
import { TILE, WALL_T, CORRIDOR_W, ROWS, THEMES, STATUS_COLOR } from './types'
import type { Theme, SalaConfig, LayoutMode } from './types'
import type { AgentAnim } from './animations'

export interface AgentBounds { id: string; cx: number; cy: number; r: number }

// ─── Room ─────────────────────────────────────────────────────────────────────
export function drawRoom(ctx: CanvasRenderingContext2D, sala: SalaConfig, ox: number) {
  const t = THEMES[sala.theme]
  const W = sala.cols * TILE, H = ROWS * TILE
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < sala.cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? t.f1 : t.f2
      ctx.fillRect(ox + c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
    }
  }
  ctx.strokeStyle = t.grid; ctx.lineWidth = 1
  for (let c = 0; c <= sala.cols; c++) {
    ctx.beginPath(); ctx.moveTo(ox + c * TILE, 0); ctx.lineTo(ox + c * TILE, H); ctx.stroke()
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(ox, r * TILE); ctx.lineTo(ox + W, r * TILE); ctx.stroke()
  }
  ctx.fillStyle = t.wall
  ctx.fillRect(ox, 0, W, WALL_T)
  ctx.fillRect(ox, H - WALL_T, W, WALL_T)
  ctx.fillRect(ox, 0, WALL_T, H)
  ctx.fillRect(ox + W - WALL_T, 0, WALL_T, H)
  ctx.fillStyle = t.wallHL
  ctx.fillRect(ox, 0, W, 3)
  ctx.fillRect(ox, 0, 3, H)
  ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillText(sala.nome, ox + W / 2, H - 18)
}

// ─── Desk ─────────────────────────────────────────────────────────────────────
export function drawDesk(ctx: CanvasRenderingContext2D, t: Theme, ox: number, col: number, row: number) {
  const px = ox + col * TILE, py = row * TILE
  const dw = TILE * 2.6, dh = TILE * 1.2, cx = px + dw / 2
  ctx.fillStyle = t.desk
  ctx.beginPath(); ctx.roundRect(px, py, dw, dh, 6); ctx.fill()
  ctx.strokeStyle = t.deskHL; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(px + 2, py + 2, dw - 4, dh - 4, 4); ctx.stroke()
  const mw = 28, mh = 18, mx = cx - mw / 2, my = py + 6
  ctx.fillStyle = t.monitor; ctx.fillRect(mx, my, mw, mh)
  ctx.fillStyle = t.glow + '55'; ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4)
  ctx.fillStyle = '#333'
  ctx.beginPath(); ctx.arc(cx, py + mh + 10, 3, 0, Math.PI * 2); ctx.fill()
  const cy2 = py + dh + 8
  ctx.fillStyle = t.chair
  ctx.beginPath(); ctx.ellipse(cx, cy2 + 10, 16, 12, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillRect(cx - 14, cy2 - 2, 28, 7)
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export function drawAgent(
  ctx: CanvasRenderingContext2D,
  agent: IaAgent,
  px: number, py: number,
  pulse: number,
  hovered: boolean,
  selected: boolean,
  layout: LayoutMode,
  anim?: AgentAnim,
): AgentBounds {
  const cx = px, cy = py

  if (layout === 'profissional') {
    const r = 14
    if (selected) {
      ctx.strokeStyle = '#7487ff'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2); ctx.stroke()
    }
    if (hovered && !selected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 4, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = agent.cor_hex || '#4e5eff'
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(agent.nome.charAt(0).toUpperCase(), cx, cy)
    ctx.fillStyle = STATUS_COLOR[agent.status] ?? '#6b7280'
    ctx.beginPath(); ctx.arc(cx + r * 0.7, cy + r * 0.7, 4, 0, Math.PI * 2); ctx.fill()
    _drawLabel(ctx, agent, cx, cy, r, selected, hovered, 'normal')
    _drawAnim(ctx, anim, cx, cy, r)
    return { id: agent.id, cx, cy, r: r + 8 }
  }

  if (layout === 'retro') {
    const s = Math.round(12 + pulse * 1.5)
    if (selected) {
      ctx.strokeStyle = '#7487ff'; ctx.lineWidth = 2
      ctx.strokeRect(cx - s - 6, cy - s - 6, (s + 6) * 2, (s + 6) * 2)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(cx - s + 2, cy - s + 4, s * 2, s * 2)
    ctx.fillStyle = agent.cor_hex || '#4e5eff'
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2)
    ctx.fillStyle = '#ffcc99'
    ctx.fillRect(cx - s + 2, cy - s + 2, s * 2 - 4, Math.round(s * 1.1))
    ctx.fillStyle = '#222'
    ctx.fillRect(cx - 4, cy - s + 4, 3, 3)
    ctx.fillRect(cx + 2, cy - s + 4, 3, 3)
    if (agent.tipo === 'zeus') {
      ctx.fillStyle = '#f59e0b'
      for (let dx = -s; dx <= s; dx += 4) {
        const h = Math.abs(dx) < 4 ? 10 : 6
        ctx.fillRect(cx + dx - 1, cy - s - h, 3, h)
      }
    }
    ctx.fillStyle = STATUS_COLOR[agent.status] ?? '#6b7280'
    ctx.fillRect(cx + s - 4, cy + s - 4, 5, 5)
    _drawLabel(ctx, agent, cx, cy, s, selected, hovered, 'mono')
    _drawAnim(ctx, anim, cx, cy, s)
    return { id: agent.id, cx, cy, r: s + 8 }
  }

  // moderno (default)
  const r = 14 + pulse * 1.5
  if (selected) {
    ctx.strokeStyle = '#7487ff'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(116,135,255,0.3)'; ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(cx, cy, r + 12, 0, Math.PI * 2); ctx.stroke()
  }
  if (hovered && !selected) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + 4, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = agent.cor_hex || '#4e5eff'
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#ffcc99'
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.55, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath(); ctx.arc(cx - 4, cy - r * 0.2, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 4, cy - r * 0.2, 2.5, 0, Math.PI * 2); ctx.fill()
  if (agent.tipo === 'zeus') {
    ctx.fillStyle = '#f59e0b'; ctx.beginPath()
    ctx.moveTo(cx - 10, cy - r - 2); ctx.lineTo(cx - 7, cy - r - 10)
    ctx.lineTo(cx, cy - r - 5); ctx.lineTo(cx + 7, cy - r - 10)
    ctx.lineTo(cx + 10, cy - r - 2); ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = STATUS_COLOR[agent.status] ?? '#6b7280'
  ctx.beginPath(); ctx.arc(cx + r * 0.65, cy + r * 0.65, 5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.stroke()
  if (agent.status === 'ocupada') {
    ctx.strokeStyle = `rgba(234,179,8,${0.4 + pulse * 0.4})`; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, r + 4 + pulse * 4, 0, Math.PI * 2); ctx.stroke()
  }
  _drawLabel(ctx, agent, cx, cy, r, selected, hovered, 'normal')
  _drawAnim(ctx, anim, cx, cy, r)
  return { id: agent.id, cx, cy, r: r + 6 }
}

function _drawLabel(
  ctx: CanvasRenderingContext2D, agent: IaAgent,
  cx: number, cy: number, r: number,
  selected: boolean, hovered: boolean,
  font: 'normal' | 'mono',
) {
  const fs = selected || hovered ? 12 : 10
  const family = font === 'mono' ? 'monospace' : "'Segoe UI',sans-serif"
  ctx.font = `${selected ? 'bold' : 'normal'} ${fs}px ${family}`
  const lbl = agent.nome.length > 10 ? agent.nome.slice(0, 9) + '…' : agent.nome
  const tw = ctx.measureText(lbl).width
  const lx = cx - tw / 2 - 4, ly = cy + Math.round(r) + 6
  ctx.fillStyle = selected ? 'rgba(74,87,255,0.85)' : 'rgba(0,0,0,0.65)'
  ctx.beginPath(); ctx.roundRect(lx, ly, tw + 8, fs + 6, 3); ctx.fill()
  ctx.fillStyle = selected ? '#fff' : '#e5e7eb'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(lbl, cx, ly + (fs + 6) / 2)
}

function _drawAnim(
  ctx: CanvasRenderingContext2D,
  anim: AgentAnim | undefined,
  cx: number, cy: number, r: number,
) {
  if (anim?.state === 'typing') {
    const t = Date.now() / 400
    for (let i = 0; i < 3; i++) {
      const p = (Math.sin(t + i * 1.2) + 1) / 2
      ctx.fillStyle = `rgba(100,150,255,${0.5 + p * 0.5})`
      ctx.beginPath(); ctx.arc(cx - 5 + i * 5, cy - r - 6 - p * 3, 2, 0, Math.PI * 2); ctx.fill()
    }
  }
  if (anim?.state === 'talking' && anim.speechText) {
    const bx = cx + r + 8, by = cy - 12
    ctx.font = '9px sans-serif'
    const text = anim.speechText.length > 18 ? anim.speechText.slice(0, 18) + '…' : anim.speechText
    const bw = Math.min(ctx.measureText(text).width + 14, 114)
    const bh = 20
    ctx.fillStyle = 'rgba(20,22,40,0.92)'
    ctx.beginPath(); ctx.roundRect(bx, by - bh / 2, bw, bh, 4); ctx.fill()
    ctx.strokeStyle = 'rgba(120,140,255,0.4)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(20,22,40,0.92)'
    ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.lineTo(bx, by - 4); ctx.lineTo(bx, by + 4)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#d1d5db'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(text, bx + 6, by)
  }
}

// ─── Corridor ─────────────────────────────────────────────────────────────────
export function drawCorridor(ctx: CanvasRenderingContext2D, ox: number) {
  const H = ROWS * TILE
  ctx.fillStyle = '#111118'; ctx.fillRect(ox, 0, CORRIDOR_W, H)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  for (let y = TILE; y < H; y += TILE * 2) {
    ctx.beginPath()
    ctx.moveTo(ox + CORRIDOR_W / 2, y)
    ctx.lineTo(ox + CORRIDOR_W / 2 - 8, y + 14)
    ctx.lineTo(ox + CORRIDOR_W / 2 + 8, y + 14)
    ctx.closePath(); ctx.fill()
  }
}

// ─── Room offsets ─────────────────────────────────────────────────────────────
export function roomOffsets(salas: SalaConfig[]): number[] {
  const offsets: number[] = []
  let x = 0
  for (const sala of salas) {
    offsets.push(x)
    x += sala.cols * TILE + CORRIDOR_W
  }
  return offsets
}
