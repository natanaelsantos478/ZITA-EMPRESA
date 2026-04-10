/**
 * Office2DView.tsx — Zelda-style top-down 2D office
 * Enhanced: multiple rooms, 4 themes, desk placement edit mode, room management
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Grid3X3 } from 'lucide-react'
import type { IaAgent, IaMensagem } from '../../../types'
import { useAuth } from '../../../contexts/AuthContext'
import { useRealtime } from '../../../hooks/useRealtime'

// ─── Animation state per agent ────────────────────────────────────────────────
interface AgentAnim {
  state: 'idle' | 'working' | 'walking' | 'talking'
  x: number; y: number
  homeX: number; homeY: number
  fromX: number; fromY: number
  targetX: number; targetY: number
  walkProgress: number
  walkPhase: number
  workTimer: number
  idlePhase: number
  bubble?: { text: string; expiresAt: number }
  afterWalk?: 'goHome' | 'talk'
}

// ─── Constants ──────────────────────────────────────────────────────────────
const TILE       = 48
const WALL_T     = 12
const CORRIDOR_W = 3 * TILE   // gap between rooms
const ROWS       = 14         // room height in tiles

const STATUS_COLOR: Record<string, string> = {
  online: '#22c55e', ocupada: '#eab308', aguardando: '#3b82f6',
  offline: '#6b7280', erro: '#ef4444', pausada: '#f97316',
}

// ─── Themes ──────────────────────────────────────────────────────────────────
type ThemeName = 'moderno' | 'retro' | 'scifi' | 'natureza'

interface Theme {
  f1: string; f2: string; grid: string
  wall: string; wallHL: string
  desk: string; deskHL: string; chair: string
  monitor: string; glow: string
  label: string; emoji: string
}

const THEMES: Record<ThemeName, Theme> = {
  moderno:  { f1:'#1a1e2a', f2:'#1d2232', grid:'#141822', wall:'#1e3a5f', wallHL:'#2b5080', desk:'#4a3820', deskHL:'#6b5530', chair:'#18183a', monitor:'#111122', glow:'#3a80ff', label:'Moderno',  emoji:'🏢' },
  retro:    { f1:'#3d2d0f', f2:'#352809', grid:'#1a1200', wall:'#1e3a5f', wallHL:'#2b5080', desk:'#7c5c2a', deskHL:'#a07840', chair:'#1a1a3a', monitor:'#111122', glow:'#5078ff', label:'Retrô',    emoji:'🪵' },
  scifi:    { f1:'#050a14', f2:'#080f1e', grid:'#0d1525', wall:'#0a1a30', wallHL:'#1a4070', desk:'#0d2840', deskHL:'#1a5080', chair:'#0a0a25', monitor:'#050510', glow:'#00e5ff', label:'Sci-Fi',   emoji:'🚀' },
  natureza: { f1:'#1a2a15', f2:'#162210', grid:'#0f1a0a', wall:'#163520', wallHL:'#2a5530', desk:'#2d4a20', deskHL:'#4a7030', chair:'#1a2a10', monitor:'#0d1a08', glow:'#22c55e', label:'Natureza', emoji:'🌿' },
}

// ─── Speech bubble ─────────────────────────────────────────────────────────────
function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
  ctx.font = '10px "Segoe UI",sans-serif'
  const words = text.split(' '), lines: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (ctx.measureText(t).width > 148) { if (line) lines.push(line); line = w } else line = t
  }
  if (line) lines.push(line)
  const shown = lines.slice(0, 3), lineH = 13
  const bw = Math.min(168, Math.max(...shown.map(l => ctx.measureText(l).width)) + 18)
  const bh = shown.length * lineH + 14
  const bx = cx - bw / 2, by = cy - 44 - bh
  ctx.fillStyle = 'rgba(14,18,32,0.93)'
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill()
  ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke()
  ctx.fillStyle = 'rgba(14,18,32,0.93)'
  ctx.beginPath(); ctx.moveTo(cx-5, by+bh); ctx.lineTo(cx+5, by+bh); ctx.lineTo(cx, by+bh+7); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(cx-4, by+bh-1); ctx.lineTo(cx, by+bh+7); ctx.lineTo(cx+4, by+bh-1); ctx.stroke()
  ctx.fillStyle = '#e8f0ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  shown.forEach((l, i) => ctx.fillText(l, bx + 9, by + 7 + i * lineH))
}

// ─── Room config ──────────────────────────────────────────────────────────────
interface SalaConfig {
  id: string
  nome: string
  theme: ThemeName
  cols: number
  desks: Array<{ col: number; row: number }>
}

const DEFAULT_DESKS_16 = [
  { col:2, row:2 }, { col:6, row:2 }, { col:10, row:2 },
  { col:2, row:8 }, { col:6, row:8 }, { col:10, row:8 },
]
const DEFAULT_DESKS_22 = [
  { col:2, row:2 }, { col:6, row:2 }, { col:10, row:2 }, { col:14, row:2 },
  { col:2, row:8 }, { col:6, row:8 }, { col:10, row:8 }, { col:14, row:8 },
]

const DEFAULT_SALAS: SalaConfig[] = [
  { id:'principal',     nome:'Sala Principal',    theme:'moderno',  cols:16, desks:DEFAULT_DESKS_16 },
  { id:'especialistas', nome:'Sala Especialistas', theme:'retro',   cols:16, desks:DEFAULT_DESKS_16 },
  { id:'escritorio',    nome:'Escritório Geral',   theme:'retro',   cols:22, desks:DEFAULT_DESKS_22 },
]

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawRoom(ctx: CanvasRenderingContext2D, sala: SalaConfig, ox: number) {
  const t = THEMES[sala.theme], W = sala.cols * TILE, H = ROWS * TILE
  const theme = sala.theme

  // ── Floor tiles with pixel-art sub-patterns per theme ──────────────────────
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < sala.cols; c++) {
      const tx = ox + c * TILE, ty = r * TILE
      const alt = (r + c) % 2 === 0

      if (theme === 'retro') {
        // Wood planks: warm horizontal strips
        ctx.fillStyle = alt ? '#c89050' : '#b87840'
        ctx.fillRect(tx, ty, TILE, TILE)
        ctx.fillStyle = '#7a4820'
        ctx.fillRect(tx, ty + TILE - 2, TILE, 2) // plank gap
        ctx.fillStyle = 'rgba(0,0,0,0.1)'
        ctx.fillRect(tx, ty, 1, TILE) // left grain
        ctx.fillStyle = 'rgba(255,200,100,0.12)'
        ctx.fillRect(tx + 3, ty + 6, TILE - 6, 2) // highlight streak

      } else if (theme === 'scifi') {
        // Metal grating: dark grid
        ctx.fillStyle = alt ? '#0d1520' : '#0a1018'
        ctx.fillRect(tx, ty, TILE, TILE)
        ctx.strokeStyle = '#1e2d40'; ctx.lineWidth = 1
        for (let gx = 0; gx <= TILE; gx += 8) {
          ctx.beginPath(); ctx.moveTo(tx + gx, ty); ctx.lineTo(tx + gx, ty + TILE); ctx.stroke()
        }
        for (let gy = 0; gy <= TILE; gy += 8) {
          ctx.beginPath(); ctx.moveTo(tx, ty + gy); ctx.lineTo(tx + TILE, ty + gy); ctx.stroke()
        }
        // Glow dots at intersections
        if ((r + c) % 4 === 0) {
          ctx.fillStyle = '#00e5ff22'
          ctx.fillRect(tx + TILE / 2 - 2, ty + TILE / 2 - 2, 4, 4)
        }

      } else if (theme === 'natureza') {
        // Grass tiles with flowers
        ctx.fillStyle = alt ? '#3d7a1e' : '#347018'
        ctx.fillRect(tx, ty, TILE, TILE)
        const seed = r * 100 + c
        if (seed % 5 === 0) {
          ctx.fillStyle = '#fff07a'; ctx.fillRect(tx + 8, ty + 10, 3, 3)
          ctx.fillStyle = '#ffcc00'; ctx.fillRect(tx + 9, ty + 11, 1, 1)
        } else if (seed % 3 === 0) {
          ctx.fillStyle = '#58c030'
          ctx.fillRect(tx + 18, ty + 20, 3, 6); ctx.fillRect(tx + 22, ty + 18, 3, 6)
        }
        ctx.fillStyle = 'rgba(0,0,0,0.06)'
        ctx.fillRect(tx + TILE - 2, ty, 2, TILE) // shadow right
        ctx.fillRect(tx, ty + TILE - 2, TILE, 2) // shadow bottom

      } else {
        // Moderno: dark stone / carpet tiles
        ctx.fillStyle = alt ? '#1a1e2a' : '#1d2232'
        ctx.fillRect(tx, ty, TILE, TILE)
        ctx.fillStyle = 'rgba(80,100,160,0.18)'
        ctx.fillRect(tx + TILE / 2 - 1, ty + 4, 2, TILE - 8)
        ctx.fillRect(tx + 4, ty + TILE / 2 - 1, TILE - 8, 2)
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(tx + 2, ty + 2, TILE - 4, 2) // subtle highlight
      }
    }
  }

  // ── Walls with pixel-art depth ─────────────────────────────────────────────
  const WC  = t.wall,  WH = t.wallHL
  // Top wall — shows "front face" below and "top face" above
  ctx.fillStyle = WC
  ctx.fillRect(ox, 0, W, WALL_T + 6)
  ctx.fillStyle = WH
  ctx.fillRect(ox, 0, W, WALL_T - 4)    // lighter top face
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(ox, WALL_T + 2, W, 4)    // dark shadow bottom of wall

  // Bottom wall
  ctx.fillStyle = WC; ctx.fillRect(ox, H - WALL_T, W, WALL_T)
  ctx.fillStyle = WH; ctx.fillRect(ox, H - WALL_T, W, 4)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(ox, H - 2, W, 2)

  // Side walls
  ctx.fillStyle = WC
  ctx.fillRect(ox, 0, WALL_T, H); ctx.fillRect(ox + W - WALL_T, 0, WALL_T, H)
  ctx.fillStyle = WH
  ctx.fillRect(ox, 0, 4, H); ctx.fillRect(ox + W - 4, 0, 4, H)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(ox, 0, 2, H); ctx.fillRect(ox + W - 2, 0, 2, H)

  // Brick / pattern on retro walls
  if (theme === 'retro' || theme === 'moderno') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    for (let bx = 0; bx < W; bx += 24) {
      ctx.fillRect(ox + bx, WALL_T - 6, 1, 6)
    }
    for (let bx = 12; bx < W; bx += 24) {
      ctx.fillRect(ox + bx, 0, 1, WALL_T - 6)
    }
  }
  if (theme === 'scifi') {
    // Cyan trim lines on scifi walls
    ctx.strokeStyle = t.glow + '55'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox + WALL_T, WALL_T); ctx.lineTo(ox + W - WALL_T, WALL_T); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox + WALL_T, H - WALL_T); ctx.lineTo(ox + W - WALL_T, H - WALL_T); ctx.stroke()
  }

  // Room name
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillText(sala.nome.toUpperCase(), ox + W / 2, H - 20)
}

function drawDesk(ctx: CanvasRenderingContext2D, t: Theme, ox: number, col: number, row: number) {
  const px = ox + col * TILE, py = row * TILE
  const dw = Math.round(TILE * 2.5), dh = Math.round(TILE * 1.15)
  const cx = px + dw / 2

  // Pixel shadow (hard offset, no blur)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(px + 4, py + 4, dw, dh)

  // Desk surface
  ctx.fillStyle = t.desk
  ctx.fillRect(px, py, dw, dh)
  // Pixel highlight: lighter top/left edges (3D effect)
  ctx.fillStyle = t.deskHL
  ctx.fillRect(px, py, dw, 4)
  ctx.fillRect(px, py, 4, dh)
  // Dark outline: right/bottom edges
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(px + dw - 3, py + 4, 3, dh - 4)
  ctx.fillRect(px + 4, py + dh - 3, dw - 7, 3)

  // Monitor (top-down: bright rectangle)
  const mw = 30, mh = 18, mx = cx - mw / 2, my = py + 5
  ctx.fillStyle = t.monitor
  ctx.fillRect(mx, my, mw, mh)
  ctx.fillStyle = t.glow + '66'
  ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4)
  ctx.fillStyle = t.glow + 'cc'
  ctx.fillRect(mx + 2, my + mh - 3, mw - 4, 2) // glow strip
  // Pixel outline on monitor
  ctx.fillStyle = '#000'
  ctx.fillRect(mx, my, mw, 2); ctx.fillRect(mx, my, 2, mh)
  ctx.fillRect(mx + mw - 2, my, 2, mh); ctx.fillRect(mx, my + mh - 2, mw, 2)
  // Monitor stand
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(cx - 3, my + mh, 6, 5)
  ctx.fillRect(cx - 9, my + mh + 4, 18, 3)

  // Chair (top-down square view)
  const chY = py + dh + 6
  ctx.fillStyle = t.chair
  ctx.fillRect(cx - 13, chY, 26, 18)
  ctx.fillStyle = t.deskHL + '66'
  ctx.fillRect(cx - 13, chY, 26, 4) // seat highlight
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(cx - 13, chY + 16, 26, 2) // shadow
  ctx.fillRect(cx - 13, chY, 3, 18)      // left leg
  ctx.fillRect(cx + 10, chY, 3, 18)      // right leg
}

function drawAgent(
  ctx: CanvasRenderingContext2D, agent: IaAgent,
  anim: AgentAnim, pulse: number, hovered: boolean, selected: boolean
): { id: string; cx: number; cy: number; r: number } {
  const bob =
    anim.state === 'working' ? Math.sin(anim.workTimer * 4) * 1.5 :
    anim.state === 'idle'    ? Math.sin(anim.idlePhase)    * 1.2 : 0
  const cx = anim.x, cy0 = anim.y, cy = cy0 + bob

  // Sprite dimensions (pixel-art proportions)
  const SW = 14, SH = 22            // sprite width / height
  const SX = Math.round(cx - SW/2)  // top-left x
  const SY = Math.round(cy - SH)    // top-left y (feet at cy)
  const color = agent.cor_hex || '#4e5eff'

  // Selection: pixel-corner brackets
  if (selected) {
    ctx.fillStyle = '#7487ff'
    const [bx, by, bw, bh] = [SX-5, SY-5, SW+10, SH+10]
    const bz = 6
    ctx.fillRect(bx, by, bz, 2); ctx.fillRect(bx, by, 2, bz)
    ctx.fillRect(bx+bw-bz, by, bz, 2); ctx.fillRect(bx+bw-2, by, 2, bz)
    ctx.fillRect(bx, by+bh-2, bz, 2); ctx.fillRect(bx, by+bh-bz, 2, bz)
    ctx.fillRect(bx+bw-bz, by+bh-2, bz, 2); ctx.fillRect(bx+bw-2, by+bh-bz, 2, bz)
    // Pulse box for ocupada
    if (agent.status === 'ocupada') {
      ctx.fillStyle = `rgba(234,179,8,${0.2+pulse*0.5})`
      const pOff = Math.round(3 + pulse * 5)
      ctx.fillRect(SX-pOff, SY-pOff, SW+pOff*2, 2)
      ctx.fillRect(SX-pOff, SY+SH+pOff-2, SW+pOff*2, 2)
      ctx.fillRect(SX-pOff, SY-pOff, 2, SH+pOff*2)
      ctx.fillRect(SX+SW+pOff-2, SY-pOff, 2, SH+pOff*2)
    }
  }
  if (hovered && !selected) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(SX-3, SY-3, SW+6, 2); ctx.fillRect(SX-3, SY-3, 2, SH+6)
    ctx.fillRect(SX+SW+1, SY-3, 2, SH+6); ctx.fillRect(SX-3, SY+SH+1, SW+6, 2)
  }

  // Shadow under feet (flat, no blur)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(SX + 1, cy0 + 1, SW - 2, 4)

  // ── Legs (only when walking) ─────────────────────────────────────────────────
  if (anim.state === 'walking') {
    const frame = Math.sin(anim.walkPhase * 8) > 0
    ctx.fillStyle = color
    ctx.fillRect(SX + 1, SY + SH - 8, 5, 9)       // left leg
    ctx.fillRect(SX + SW - 6, SY + SH - 8 + (frame ? -3 : 3), 5, 9) // right leg alternating
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(SX + 1, SY + SH + 1, 5, 1)
    ctx.fillRect(SX + SW - 6, SY + SH + (frame ? -2 : 4), 5, 1)
  }

  // ── Body (torso) ─────────────────────────────────────────────────────────────
  ctx.fillStyle = color
  ctx.fillRect(SX, SY + 9, SW, 13)
  // Pixel highlight left edge
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(SX, SY + 9, 2, 13)
  ctx.fillRect(SX, SY + 9, SW, 2)
  // Pixel shadow right/bottom edge
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(SX + SW - 2, SY + 11, 2, 11)
  ctx.fillRect(SX + 2, SY + 20, SW - 4, 2)

  // ── Head ─────────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#f0c87a'          // skin tone
  ctx.fillRect(SX + 2, SY + 1, SW - 4, 9)
  // Pixel hair / outfit top (colored)
  ctx.fillStyle = color
  ctx.fillRect(SX + 2, SY + 1, SW - 4, 3)
  // Face outline
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(SX + 2, SY + 1, 1, 9)        // left
  ctx.fillRect(SX + SW - 3, SY + 1, 1, 9)   // right
  ctx.fillRect(SX + 2, SY + 1, SW - 4, 1)   // top
  ctx.fillRect(SX + 2, SY + 9, SW - 4, 1)   // bottom (chin)
  // Eyes (2 dark pixels)
  ctx.fillStyle = '#1a0800'
  ctx.fillRect(SX + 4, SY + 5, 2, 2)
  ctx.fillRect(SX + SW - 6, SY + 5, 2, 2)

  // ── Zeus pixel crown ──────────────────────────────────────────────────────────
  if (agent.tipo === 'zeus') {
    ctx.fillStyle = '#f59e0b'
    ctx.fillRect(SX + 2, SY - 1, SW - 4, 3)   // crown base
    ctx.fillRect(SX + 2, SY - 4, 3, 3)          // left prong
    ctx.fillRect(SX + SW/2 - 1, SY - 6, 3, 5)  // center prong
    ctx.fillRect(SX + SW - 5, SY - 4, 3, 3)     // right prong
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(SX + 3, SY - 3, 1, 2)
    ctx.fillRect(SX + SW/2, SY - 5, 1, 4)
    ctx.fillRect(SX + SW - 4, SY - 3, 1, 2)
  }

  // ── Working: pixel keyboard flicker ──────────────────────────────────────────
  if (anim.state === 'working') {
    const ka = 0.4 + Math.sin(anim.workTimer * 6) * 0.35
    ctx.fillStyle = `rgba(100,180,255,${ka})`
    for (let ki = 0; ki < 3; ki++) ctx.fillRect(cx - 6 + ki * 5, cy0 + 3, 4, 2)
  }

  // ── Status indicator (pixel square top-right of sprite) ──────────────────────
  const dotC = STATUS_COLOR[agent.status] ?? '#6b7280'
  ctx.fillStyle = dotC
  ctx.fillRect(SX + SW + 2, SY, 5, 5)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(SX + SW + 2, SY, 5, 1); ctx.fillRect(SX + SW + 2, SY, 1, 5)
  ctx.fillRect(SX + SW + 6, SY, 1, 5); ctx.fillRect(SX + SW + 2, SY + 4, 5, 1)

  // ── Name tag (pixel-font style) ───────────────────────────────────────────────
  const lbl = agent.nome.length > 10 ? agent.nome.slice(0, 9) + '…' : agent.nome
  ctx.font = `${selected ? 'bold ' : ''}9px monospace`
  const tw = ctx.measureText(lbl).width
  const lx = cx - tw/2 - 3, ly = cy0 + 4
  ctx.fillStyle = selected ? 'rgba(50,60,200,0.9)' : 'rgba(0,0,0,0.72)'
  ctx.fillRect(lx, ly, tw + 6, 11)
  ctx.fillStyle = selected ? '#fff' : '#dde0e8'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(lbl, lx + 3, ly + 1)

  // ── Speech bubble ─────────────────────────────────────────────────────────────
  if (anim.bubble && Date.now() < anim.bubble.expiresAt) {
    drawBubble(ctx, anim.bubble.text, cx, SY - 4)
  }

  return { id: agent.id, cx, cy: cy0, r: SW/2 + 6 }
}

function drawCorridor(ctx: CanvasRenderingContext2D, ox: number) {
  const H = ROWS * TILE
  // Stone floor tiles (pixel art alternating blocks)
  for (let ry = 0; ry < H; ry += TILE) {
    for (let rx = 0; rx < CORRIDOR_W; rx += TILE) {
      const alt = ((ry / TILE) + (rx / TILE)) % 2 === 0
      ctx.fillStyle = alt ? '#181c24' : '#13171f'
      ctx.fillRect(ox + rx, ry, TILE, TILE)
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(ox + rx, ry + TILE - 2, TILE, 2)   // bottom seam
      ctx.fillRect(ox + rx + TILE - 2, ry, 2, TILE)   // right seam
    }
  }
  // Darker edges (wall strip each side)
  ctx.fillStyle = '#0c0f16'
  ctx.fillRect(ox, 0, 8, H); ctx.fillRect(ox + CORRIDOR_W - 8, 0, 8, H)
  // Pixel wall outline
  ctx.fillStyle = '#000'
  ctx.fillRect(ox, 0, 2, H); ctx.fillRect(ox + CORRIDOR_W - 2, 0, 2, H)
  // Torches on walls (every 3 tiles)
  for (let ty2 = TILE * 2; ty2 < H - TILE; ty2 += TILE * 3) {
    // Left torch
    ctx.fillStyle = '#5a3000'; ctx.fillRect(ox + 4, ty2 + 4, 5, 8)
    ctx.fillStyle = '#ff9900'; ctx.fillRect(ox + 4, ty2,     5, 5)
    ctx.fillStyle = '#ffdd00'; ctx.fillRect(ox + 5, ty2 + 1, 3, 3)
    ctx.fillStyle = '#fff8';   ctx.fillRect(ox + 6, ty2 + 1, 1, 2)
    // Right torch
    ctx.fillStyle = '#5a3000'; ctx.fillRect(ox + CORRIDOR_W - 9, ty2 + 4, 5, 8)
    ctx.fillStyle = '#ff9900'; ctx.fillRect(ox + CORRIDOR_W - 9, ty2,     5, 5)
    ctx.fillStyle = '#ffdd00'; ctx.fillRect(ox + CORRIDOR_W - 8, ty2 + 1, 3, 3)
    ctx.fillStyle = '#fff8';   ctx.fillRect(ox + CORRIDOR_W - 7, ty2 + 1, 1, 2)
  }
}

// ─── Room offset calculation ──────────────────────────────────────────────────
function roomOffsets(salas: SalaConfig[]): number[] {
  const offsets: number[] = []
  let x = 0
  for (let i = 0; i < salas.length; i++) {
    offsets.push(x)
    x += salas[i].cols * TILE + CORRIDOR_W
  }
  return offsets
}

// ─── Modal: Add / Edit Sala ───────────────────────────────────────────────────
function SalaModal({ sala, onSave, onClose }: {
  sala?: SalaConfig
  onSave: (data: Omit<SalaConfig,'id'>) => void
  onClose: () => void
}) {
  const [nome,  setNome]  = useState(sala?.nome  ?? '')
  const [theme, setTheme] = useState<ThemeName>(sala?.theme ?? 'moderno')
  const [cols,  setCols]  = useState(sala?.cols  ?? 16)

  const save = () => {
    if (!nome.trim()) return
    const desks = cols >= 22 ? DEFAULT_DESKS_22 : DEFAULT_DESKS_16
    onSave({ nome, theme, cols, desks: sala?.desks ?? desks })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold mb-4">{sala ? 'Editar sala' : 'Nova sala'}</h3>

        <label className="block text-xs text-gray-400 mb-1">Nome</label>
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-4 outline-none focus:border-brand-500" />

        <label className="block text-xs text-gray-400 mb-2">Tema</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(Object.keys(THEMES) as ThemeName[]).map(k => (
            <button key={k} onClick={() => setTheme(k)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                theme === k ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              <span>{THEMES[k].emoji}</span>{THEMES[k].label}
            </button>
          ))}
        </div>

        <label className="block text-xs text-gray-400 mb-2">Tamanho (largura em tiles)</label>
        <div className="flex gap-2 mb-5">
          {[12, 16, 22, 28].map(c => (
            <button key={c} onClick={() => setCols(c)}
              className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                cols === c ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}>{c}</button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">Cancelar</button>
          <button onClick={save} disabled={!nome.trim()} className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  agents: IaAgent[]
  tarefasCounts: Record<string, number>
  onSelectAgent: (a: IaAgent) => void
  onChat: (a: IaAgent) => void
  selectedId?: string
}

export default function Office2DView({ agents, onSelectAgent, selectedId }: Props) {
  const { companyId, isAdmin } = useAuth()
  const storageKey = `${companyId}_office2d_salas`

  const [salas, setSalas] = useState<SalaConfig[]>(() => {
    try { const r = localStorage.getItem(storageKey); if (r) return JSON.parse(r) } catch {}
    return DEFAULT_SALAS
  })

  const [zoom,      setZoom]      = useState(1.0)
  const [pan,       setPan]       = useState({ x: 0, y: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltip,   setTooltip]   = useState<{ x: number; y: number; agent: IaAgent } | null>(null)
  const [editMode,  setEditMode]  = useState(false)   // desk placement mode
  const [hoverTile, setHoverTile] = useState<{ salaIdx: number; col: number; row: number } | null>(null)

  // UI panels
  const [showSalaPanel, setShowSalaPanel] = useState(false)
  const [addSalaModal,  setAddSalaModal]  = useState(false)
  const [editSala,      setEditSala]      = useState<SalaConfig | null>(null)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const boundsRef   = useRef<Array<{ id: string; cx: number; cy: number; r: number }>>([])
  const animRef     = useRef<number>(0)
  const timeRef     = useRef(0)
  const panningRef  = useRef(false)
  const panStartRef = useRef({ mx:0, my:0, px:0, py:0 })
  // Animation state — lives in ref to avoid setState inside rAF
  const animsRef    = useRef<Map<string, AgentAnim>>(new Map())

  // Persist salas
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(salas)) }, [salas, storageKey])

  // Stable memoized values (fix re-render loops)
  const WORLD_H = ROWS * TILE
  const WORLD_W = useMemo(() => salas.reduce((acc, s) => acc + s.cols * TILE + CORRIDOR_W, 0), [salas])
  const offsets = useMemo(() => roomOffsets(salas), [salas])

  // Assign agents to rooms — stable with useCallback
  const agentsForSala = useCallback((idx: number): IaAgent[] => {
    const zeus = agents.filter(a => a.tipo === 'zeus')
    const esp  = agents.filter(a => a.tipo === 'especialista')
    const rest = agents.filter(a => a.tipo !== 'zeus' && a.tipo !== 'especialista')
    if (idx === 0) return zeus
    if (idx === 1) return esp
    const ri = idx - 2
    const perRoom = Math.ceil(rest.length / Math.max(1, salas.length - 2))
    return rest.slice(ri * perRoom, (ri + 1) * perRoom)
  }, [agents, salas])

  // Desk world position helper
  const deskPos = useCallback((si: number, di: number) => {
    const sala = salas[si]; if (!sala) return { x: 0, y: 0 }
    const slot = sala.desks[di % sala.desks.length]; if (!slot) return { x: 0, y: 0 }
    const dw = TILE * 2.6, dh = TILE * 1.2
    return { x: offsets[si] + slot.col * TILE + dw / 2, y: slot.row * TILE + dh + TILE * 0.95 }
  }, [salas, offsets])

  // Sync animation state when agents/salas change
  useEffect(() => {
    const map = animsRef.current
    salas.forEach((_, si) => {
      agentsForSala(si).forEach((agent, ai) => {
        const pos = deskPos(si, ai)
        if (!map.has(agent.id)) {
          map.set(agent.id, {
            state: agent.status === 'ocupada' ? 'working' : 'idle',
            x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y,
            fromX: pos.x, fromY: pos.y, targetX: pos.x, targetY: pos.y,
            walkProgress: 1, walkPhase: 0,
            workTimer: Math.random() * Math.PI * 2,
            idlePhase: Math.random() * Math.PI * 2,
          })
        } else {
          const a = map.get(agent.id)!
          a.homeX = pos.x; a.homeY = pos.y
          if (a.state === 'idle' && agent.status === 'ocupada') a.state = 'working'
          if (a.state === 'working' && agent.status !== 'ocupada') a.state = 'idle'
        }
      })
    })
    const allIds = new Set(agents.map(a => a.id))
    map.forEach((_, id) => { if (!allIds.has(id)) map.delete(id) })
  }, [agents, salas, agentsForSala, deskPos])

  // AI-to-AI message visualization
  useRealtime<IaMensagem>(
    'ia_mensagens',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (msg) => {
      if (msg.remetente_tipo !== 'ia' || !msg.remetente_id) return
      const sender = animsRef.current.get(msg.remetente_id)
      if (!sender || sender.state === 'walking') return
      // Find another agent to walk toward
      let tx = sender.homeX + 50, ty = sender.homeY
      animsRef.current.forEach((a, id) => {
        if (id !== msg.remetente_id) { tx = a.homeX; ty = a.homeY }
      })
      sender.fromX = sender.x; sender.fromY = sender.y
      sender.targetX = tx; sender.targetY = ty
      sender.walkProgress = 0; sender.state = 'walking'; sender.afterWalk = 'talk'
      sender.bubble = { text: msg.conteudo.slice(0, 120), expiresAt: Date.now() + 5000 }
    },
    'INSERT'
  )

  // Coordinate helpers
  const canvasToWorld = useCallback((cx: number, cy: number, canvas: HTMLCanvasElement) => {
    const offX = pan.x + canvas.width  / 2 - (WORLD_W * zoom) / 2
    const offY = pan.y + canvas.height / 2 - (WORLD_H * zoom) / 2
    return { wx: (cx - offX) / zoom, wy: (cy - offY) / zoom }
  }, [pan, zoom, WORLD_W, WORLD_H])

  // Main animation + draw loop (stable — minimal deps, reads from refs)
  useEffect(() => {
    const WALK_SPEED = 0.028
    const loop = () => {
      animRef.current = requestAnimationFrame(loop)
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d'); if (!ctx) return
      timeRef.current += 0.02
      const pulse = (Math.sin(timeRef.current) + 1) / 2
      const now = Date.now()

      // Update animation states (no setState — pure ref mutation)
      animsRef.current.forEach((a, id) => {
        a.idlePhase += 0.04; a.workTimer += 0.05
        if (a.state === 'walking') {
          a.walkProgress = Math.min(1, a.walkProgress + WALK_SPEED)
          a.walkPhase += WALK_SPEED * 1.5
          a.x = a.fromX + (a.targetX - a.fromX) * a.walkProgress
          a.y = a.fromY + (a.targetY - a.fromY) * a.walkProgress
          if (a.walkProgress >= 1) {
            if (a.afterWalk === 'talk') {
              a.state = 'talking'
              setTimeout(() => {
                const cur = animsRef.current.get(id); if (!cur) return
                cur.fromX = cur.x; cur.fromY = cur.y
                cur.targetX = cur.homeX; cur.targetY = cur.homeY
                cur.walkProgress = 0; cur.state = 'walking'; cur.afterWalk = 'goHome'
              }, 4000)
            } else {
              a.state = 'working'; a.x = a.homeX; a.y = a.homeY; a.afterWalk = undefined
            }
          }
        }
        if (a.state === 'talking' && a.bubble && now > a.bubble.expiresAt) a.bubble = undefined
      })

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.translate(
        pan.x + canvas.width  / 2 - (WORLD_W * zoom) / 2,
        pan.y + canvas.height / 2 - (WORLD_H * zoom) / 2
      )
      ctx.scale(zoom, zoom)

      // Corridors + rooms
      salas.forEach((sala, i) => {
        if (i > 0) drawCorridor(ctx, offsets[i] - CORRIDOR_W)
        drawRoom(ctx, sala, offsets[i])
        const t = THEMES[sala.theme]
        sala.desks.forEach(d => drawDesk(ctx, t, offsets[i], d.col, d.row))
      })

      // Edit mode tile highlight
      if (editMode && hoverTile) {
        const ox = offsets[hoverTile.salaIdx]
        ctx.fillStyle = 'rgba(250,204,21,0.25)'
        ctx.fillRect(ox + hoverTile.col * TILE, hoverTile.row * TILE, TILE, TILE)
      }

      // Agents
      const newBounds: typeof boundsRef.current = []
      salas.forEach((sala, i) => {
        agentsForSala(i).forEach((agent, ai) => {
          const anim = animsRef.current.get(agent.id)
          if (!anim) {
            // Fallback: draw at desk position if anim not yet initialized
            const slot = sala.desks[ai % sala.desks.length]; if (!slot) return
            const dw = TILE * 2.6, dh = TILE * 1.2
            const fallback: AgentAnim = {
              state:'idle', x: offsets[i]+slot.col*TILE+dw/2, y: slot.row*TILE+dh+TILE*0.95,
              homeX:0,homeY:0,fromX:0,fromY:0,targetX:0,targetY:0,
              walkProgress:1,walkPhase:0,workTimer:0,idlePhase:timeRef.current
            }
            const b = drawAgent(ctx, agent, fallback, pulse, agent.id===hoveredId, agent.id===selectedId)
            newBounds.push(b); return
          }
          const b = drawAgent(ctx, agent, anim, pulse, agent.id===hoveredId, agent.id===selectedId)
          newBounds.push(b)
        })
      })
      boundsRef.current = newBounds
      ctx.restore()
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan, hoveredId, selectedId, editMode, hoverTile, salas, offsets, agentsForSala, WORLD_W, WORLD_H])

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const parent = canvas.parentElement; if (!parent) return
    const ro = new ResizeObserver(() => {
      canvas.width  = parent.clientWidth
      canvas.height = parent.clientHeight
    })
    ro.observe(parent)
    canvas.width  = parent.clientWidth
    canvas.height = parent.clientHeight
    return () => ro.disconnect()
  }, [])

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top

    if (panningRef.current) {
      setPan({ x: panStartRef.current.px + (mx - panStartRef.current.mx), y: panStartRef.current.py + (my - panStartRef.current.my) })
      return
    }
    const { wx, wy } = canvasToWorld(mx, my, canvas)

    // Edit mode: find hovered tile in a sala
    if (editMode) {
      let found: typeof hoverTile = null
      salas.forEach((sala, i) => {
        const ox = offsets[i]
        if (wx >= ox && wx < ox + sala.cols * TILE && wy >= 0 && wy < ROWS * TILE) {
          const col = Math.floor((wx - ox) / TILE)
          const row = Math.floor(wy / TILE)
          found = { salaIdx: i, col, row }
        }
      })
      setHoverTile(found)
      return
    }

    // Agent hover
    let hit: string | null = null
    for (const b of boundsRef.current) {
      if (Math.hypot(wx - b.cx, wy - b.cy) <= b.r) { hit = b.id; break }
    }
    setHoveredId(hit)
    if (hit) {
      const agent = agents.find(a => a.id === hit)
      if (agent) setTooltip({ x: e.clientX, y: e.clientY, agent })
    } else {
      setTooltip(null)
    }
  }, [agents, canvasToWorld, editMode, salas, offsets])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    if (!hoveredId && !editMode) {
      panningRef.current = true
      const rect = canvasRef.current!.getBoundingClientRect()
      panStartRef.current = { mx: e.clientX-rect.left, my: e.clientY-rect.top, px: pan.x, py: pan.y }
    }
  }, [hoveredId, editMode, pan])

  const handleMouseUp = useCallback(() => { panningRef.current = false }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { wx, wy } = canvasToWorld(e.clientX-rect.left, e.clientY-rect.top, canvas)

    if (editMode && hoverTile) {
      // Toggle desk at clicked tile
      setSalas(prev => prev.map((sala, i) => {
        if (i !== hoverTile.salaIdx) return sala
        const col = hoverTile.col, row = hoverTile.row
        const exists = sala.desks.some(d => d.col === col && d.row === row)
        const newDesks = exists
          ? sala.desks.filter(d => !(d.col === col && d.row === row))
          : [...sala.desks, { col, row }]
        return { ...sala, desks: newDesks }
      }))
      return
    }

    for (const b of boundsRef.current) {
      if (Math.hypot(wx - b.cx, wy - b.cy) <= b.r) {
        const agent = agents.find(a => a.id === b.id)
        if (agent) onSelectAgent(agent)
        return
      }
    }
  }, [agents, canvasToWorld, editMode, hoverTile, onSelectAgent])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)))
  }, [])

  // Sala management
  const addSala = (data: Omit<SalaConfig,'id'>) => {
    setSalas(prev => [...prev, { ...data, id: crypto.randomUUID() }])
  }
  const updateSala = (id: string, data: Omit<SalaConfig,'id'>) => {
    setSalas(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
  }
  const deleteSala = (id: string) => setSalas(prev => prev.filter(s => s.id !== id))
  const moveSala = (id: string, dir: -1 | 1) => {
    setSalas(prev => {
      const idx = prev.findIndex(s => s.id === id)
      const ni = idx + dir
      if (ni < 0 || ni >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[ni]] = [next[ni], next[idx]]
      return next
    })
  }

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: editMode ? 'crosshair' : hoveredId ? 'pointer' : 'grab', imageRendering: 'pixelated' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { panningRef.current = false; setHoverTile(null) }}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isAdmin && (
          <button
            onClick={() => { setEditMode(e => !e); setHoverTile(null) }}
            title="Editar posição das mesas"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              editMode
                ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            {editMode ? 'Clique para colocar/remover mesa' : 'Editar mesas'}
          </button>
        )}
        <button
          onClick={() => setShowSalaPanel(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Salas
        </button>
      </div>

      {/* Room panel */}
      {showSalaPanel && (
        <div className="absolute top-14 right-4 z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-64 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-300">Gerenciar Salas</span>
            <button onClick={() => setAddSalaModal(true)} className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {salas.map((sala, i) => (
              <div key={sala.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700">
                <span className="text-sm">{THEMES[sala.theme].emoji}</span>
                <span className="flex-1 text-xs text-white truncate">{sala.nome}</span>
                <div className="flex gap-0.5">
                  <button onClick={() => moveSala(sala.id, -1)} disabled={i===0} className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronLeft className="w-3 h-3" /></button>
                  <button onClick={() => moveSala(sala.id,  1)} disabled={i===salas.length-1} className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronRight className="w-3 h-3" /></button>
                  <button onClick={() => setEditSala(sala)} className="p-0.5 text-gray-600 hover:text-blue-400"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => deleteSala(sala.id)} disabled={salas.length <= 1} className="p-0.5 text-gray-600 hover:text-red-400 disabled:opacity-20"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-gray-900/80 border border-gray-800 rounded-xl p-1.5">
        <button onClick={() => setZoom(z => Math.min(2.5, z+0.15))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-lg font-bold">+</button>
        <button onClick={() => setZoom(1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-white hover:bg-gray-800 rounded-lg text-xs" title="Reset">{Math.round(zoom*100)}%</button>
        <button onClick={() => setZoom(z => Math.max(0.3, z-0.15))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-lg font-bold">−</button>
      </div>

      {/* Info bar */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-gray-900/80 border border-gray-800 rounded-xl text-xs text-gray-500">
        🏢 {agents.length} agente{agents.length!==1?'s':''} · {salas.length} sala{salas.length!==1?'s':''} · scroll = zoom
      </div>

      {/* Tooltip */}
      {tooltip && !editMode && (
        <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x+14, top: tooltip.y-10 }}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl min-w-[140px]">
            <p className="text-sm font-semibold text-white">{tooltip.agent.nome}</p>
            {tooltip.agent.funcao && <p className="text-xs text-gray-400 mt-0.5">{tooltip.agent.funcao}</p>}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[tooltip.agent.status] ?? '#6b7280' }} />
              <span className="text-xs text-gray-500 capitalize">{tooltip.agent.status}</span>
              {tooltip.agent.tipo === 'zeus' && <span className="text-xs text-yellow-500 ml-1">👑 Mestre</span>}
            </div>
            <p className="text-xs text-gray-700 mt-1.5">Clique para abrir painel</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-gray-900/80 border border-gray-800 rounded-2xl p-8">
            <p className="text-4xl mb-3">🏢</p>
            <p className="text-gray-400 text-sm">O escritório está vazio.</p>
            <p className="text-gray-600 text-xs mt-1">Cadastre IAs em Configurações.</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {addSalaModal && <SalaModal onSave={addSala} onClose={() => setAddSalaModal(false)} />}
      {editSala     && <SalaModal sala={editSala} onSave={d => updateSala(editSala.id, d)} onClose={() => setEditSala(null)} />}
    </div>
  )
}
