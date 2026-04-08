/**
 * Office2DView.tsx — Zelda-style top-down 2D office
 *
 * Canvas 2D rendering:
 * - Tiled wood floor + walls
 * - Desks, monitors, chairs seen from above
 * - Agent characters: top-down circle sprite with color, name, status dot
 * - Click agent to select, hover for tooltip
 * - Simple idle animation (breath scale pulse)
 * - Zoom with wheel, pan with drag
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { IaAgent } from '../../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const TILE   = 48          // pixels per floor tile
const COLS   = 22          // floor tiles wide
const ROWS   = 16          // floor tiles tall

const W = COLS * TILE      // 1056
const H = ROWS * TILE      // 768

const STATUS_COLOR: Record<string, string> = {
  online:    '#22c55e',
  ocupada:   '#eab308',
  aguardando:'#3b82f6',
  offline:   '#6b7280',
  erro:      '#ef4444',
  pausada:   '#f97316',
}

// Desk layout: { col, row } in tile coordinates (top-left corner of desk area)
const DESK_SLOTS = [
  { col: 2,  row: 2  }, { col: 6,  row: 2  }, { col: 10, row: 2  },
  { col: 14, row: 2  }, { col: 18, row: 2  },
  { col: 2,  row: 10 }, { col: 6,  row: 10 }, { col: 10, row: 10 },
  { col: 14, row: 10 }, { col: 18, row: 10 },
]

interface AgentBounds { id: string; cx: number; cy: number; r: number }

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawFloor(ctx: CanvasRenderingContext2D) {
  // Base floor colour
  ctx.fillStyle = '#2a2008'
  ctx.fillRect(0, 0, W, H)

  // Wood plank tiles (alternating shades)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const shade = (r + c) % 2 === 0 ? '#3d2d0f' : '#352809'
      ctx.fillStyle = shade
      ctx.fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
    }
  }

  // Subtle grid lines
  ctx.strokeStyle = '#1a1200'
  ctx.lineWidth = 1
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H); ctx.stroke()
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE); ctx.stroke()
  }
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  const thickness = 12
  ctx.fillStyle = '#1e3a5f'
  ctx.fillRect(0, 0, W, thickness)           // top
  ctx.fillRect(0, H - thickness, W, thickness) // bottom
  ctx.fillRect(0, 0, thickness, H)           // left
  ctx.fillRect(W - thickness, 0, thickness, H) // right

  // Wall highlight
  ctx.fillStyle = '#2b5080'
  ctx.fillRect(0, 0, W, 3)
  ctx.fillRect(0, 0, 3, H)
}

function drawDesk(ctx: CanvasRenderingContext2D, px: number, py: number) {
  const dw = TILE * 2.6   // desk width
  const dh = TILE * 1.2   // desk depth
  const cx = px + dw / 2

  // Desk surface (top-down, brown wood)
  ctx.fillStyle = '#7c5c2a'
  ctx.beginPath()
  ctx.roundRect(px, py, dw, dh, 6)
  ctx.fill()

  // Desk edge highlight
  ctx.strokeStyle = '#a07840'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(px + 2, py + 2, dw - 4, dh - 4, 4)
  ctx.stroke()

  // Monitor (seen from above — just a dark rectangle with glowing screen)
  const mw = 28; const mh = 18
  const mx = cx - mw / 2; const my = py + 6
  ctx.fillStyle = '#111122'
  ctx.fillRect(mx, my, mw, mh)
  ctx.fillStyle = '#1a2a8a'
  ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4)
  // Screen glow
  ctx.fillStyle = 'rgba(80,120,255,0.15)'
  ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4)

  // Monitor stand dot
  ctx.fillStyle = '#333'
  ctx.beginPath(); ctx.arc(cx, py + mh + 10, 3, 0, Math.PI * 2); ctx.fill()

  // Chair (behind desk, seen from above — D-shape)
  const chairY = py + dh + 8
  ctx.fillStyle = '#1a1a3a'
  ctx.beginPath()
  ctx.ellipse(cx, chairY + 10, 16, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2a2a5a'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Chair back (small rectangle above)
  ctx.fillStyle = '#22225a'
  ctx.fillRect(cx - 14, chairY - 2, 28, 7)
}

function drawAgent(
  ctx: CanvasRenderingContext2D,
  agent: IaAgent,
  px: number,
  py: number,
  pulse: number,       // 0–1 breath animation
  hovered: boolean,
  selected: boolean
): AgentBounds {
  const r  = 14 + pulse * 1.5
  const cx = px
  const cy = py

  // Selection ring
  if (selected) {
    ctx.strokeStyle = '#7487ff'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2); ctx.stroke()

    ctx.strokeStyle = 'rgba(116,135,255,0.3)'
    ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(cx, cy, r + 12, 0, Math.PI * 2); ctx.stroke()
  }

  // Hover ring
  if (hovered && !selected) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke()
  }

  // Body shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + 4, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill()

  // Body circle (agent color)
  const agentColor = agent.cor_hex || '#4e5eff'
  ctx.fillStyle = agentColor
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()

  // Body border
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()

  // Head (lighter circle top portion) — top-down head illusion
  ctx.fillStyle = '#ffcc99'
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.55, 0, Math.PI * 2); ctx.fill()

  // Eyes
  ctx.fillStyle = '#222'
  ctx.beginPath(); ctx.arc(cx - 4, cy - r * 0.2, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 4, cy - r * 0.2, 2.5, 0, Math.PI * 2); ctx.fill()

  // Zeus crown
  if (agent.tipo === 'zeus') {
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.moveTo(cx - 10, cy - r - 2)
    ctx.lineTo(cx - 7,  cy - r - 10)
    ctx.lineTo(cx,      cy - r - 5)
    ctx.lineTo(cx + 7,  cy - r - 10)
    ctx.lineTo(cx + 10, cy - r - 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#d97706'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Status dot (bottom-right)
  const dotColor = STATUS_COLOR[agent.status] ?? '#6b7280'
  ctx.fillStyle = dotColor
  ctx.beginPath(); ctx.arc(cx + r * 0.65, cy + r * 0.65, 5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Pulsing ring if 'ocupada'
  if (agent.status === 'ocupada') {
    ctx.strokeStyle = `rgba(234,179,8,${0.4 + pulse * 0.4})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, r + 4 + pulse * 4, 0, Math.PI * 2); ctx.stroke()
  }

  // Name label below
  const fontSize = selected || hovered ? 12 : 10
  ctx.font = `${selected ? 'bold' : 'normal'} ${fontSize}px 'Segoe UI', sans-serif`
  const label = agent.nome.length > 10 ? agent.nome.slice(0, 9) + '…' : agent.nome
  const textW = ctx.measureText(label).width

  // Label background
  ctx.fillStyle = selected ? 'rgba(74,87,255,0.85)' : 'rgba(0,0,0,0.65)'
  const lx = cx - textW / 2 - 4
  const ly = cy + r + 6
  ctx.beginPath(); ctx.roundRect(lx, ly, textW + 8, fontSize + 6, 3); ctx.fill()

  ctx.fillStyle = selected ? '#fff' : '#e5e7eb'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, ly + (fontSize + 6) / 2)

  return { id: agent.id, cx, cy, r: r + 6 }
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
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const boundsRef  = useRef<AgentBounds[]>([])
  const animRef    = useRef<number>(0)
  const timeRef    = useRef(0)

  // Pan + zoom state
  const [zoom, setZoom]       = useState(1.0)
  const [pan,  setPan]        = useState({ x: 0, y: 0 })
  const panningRef            = useRef(false)
  const panStartRef           = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltip, setTooltip]     = useState<{ x: number; y: number; agent: IaAgent } | null>(null)

  // ── Draw loop ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    timeRef.current += 0.02
    const pulse = (Math.sin(timeRef.current) + 1) / 2  // 0 → 1

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pan.x + canvas.width / 2 - (W * zoom) / 2, pan.y + canvas.height / 2 - (H * zoom) / 2)
    ctx.scale(zoom, zoom)

    drawFloor(ctx)
    drawWalls(ctx)

    // Draw all desks
    DESK_SLOTS.forEach(({ col, row }) => {
      drawDesk(ctx, col * TILE, row * TILE)
    })

    // Draw agents
    const newBounds: AgentBounds[] = []
    agents.forEach((agent, i) => {
      const slot = DESK_SLOTS[i % DESK_SLOTS.length]
      const dw = TILE * 2.6
      const dh = TILE * 1.2
      // Seat position: centered on desk chair
      const ax = slot.col * TILE + dw / 2
      const ay = slot.row * TILE + dh + TILE * 0.95

      const bounds = drawAgent(
        ctx, agent, ax, ay, pulse,
        agent.id === hoveredId,
        agent.id === selectedId
      )
      newBounds.push(bounds)
    })
    boundsRef.current = newBounds

    ctx.restore()
  }, [agents, zoom, pan, hoveredId, selectedId])

  useEffect(() => {
    const loop = () => {
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // ── Resize canvas ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => {
      canvas.width  = parent.clientWidth
      canvas.height = parent.clientHeight
    })
    ro.observe(parent)
    canvas.width  = parent.clientWidth
    canvas.height = parent.clientHeight
    return () => ro.disconnect()
  }, [])

  // ── Canvas→world coordinate helpers ─────────────────────────────────────────
  const canvasToWorld = useCallback((cx: number, cy: number, canvas: HTMLCanvasElement) => {
    const offsetX = pan.x + canvas.width  / 2 - (W * zoom) / 2
    const offsetY = pan.y + canvas.height / 2 - (H * zoom) / 2
    return { wx: (cx - offsetX) / zoom, wy: (cy - offsetY) / zoom }
  }, [pan, zoom])

  // ── Mouse events ────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (panningRef.current) {
      setPan({
        x: panStartRef.current.px + (mx - panStartRef.current.mx),
        y: panStartRef.current.py + (my - panStartRef.current.my),
      })
      return
    }

    const { wx, wy } = canvasToWorld(mx, my, canvas)

    let hit: string | null = null
    for (const b of boundsRef.current) {
      const dist = Math.hypot(wx - b.cx, wy - b.cy)
      if (dist <= b.r) { hit = b.id; break }
    }
    setHoveredId(hit)

    if (hit) {
      const agent = agents.find(a => a.id === hit)
      if (agent) setTooltip({ x: e.clientX, y: e.clientY, agent })
    } else {
      setTooltip(null)
    }
  }, [agents, canvasToWorld])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    if (!hoveredId) {
      panningRef.current = true
      const rect = canvasRef.current!.getBoundingClientRect()
      panStartRef.current = {
        mx: e.clientX - rect.left,
        my: e.clientY - rect.top,
        px: pan.x, py: pan.y,
      }
    }
  }, [hoveredId, pan])

  const handleMouseUp = useCallback(() => {
    panningRef.current = false
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { wx, wy } = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, canvas)

    for (const b of boundsRef.current) {
      if (Math.hypot(wx - b.cx, wy - b.cy) <= b.r) {
        const agent = agents.find(a => a.id === b.id)
        if (agent) onSelectAgent(agent)
        return
      }
    }
  }, [agents, onSelectAgent, canvasToWorld])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2.5, Math.max(0.4, z - e.deltaY * 0.001)))
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { wx, wy } = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, canvas)
    for (const b of boundsRef.current) {
      if (Math.hypot(wx - b.cx, wy - b.cy) <= b.r) {
        const agent = agents.find(a => a.id === b.id)
        if (agent) onSelectAgent(agent)
        return
      }
    }
  }, [agents, onSelectAgent, canvasToWorld])

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: hoveredId ? 'pointer' : panningRef.current ? 'grabbing' : 'grab', imageRendering: 'pixelated' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-gray-900/80 border border-gray-800 rounded-xl p-1.5">
        <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-lg font-bold transition-colors">+</button>
        <button onClick={() => setZoom(1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-white hover:bg-gray-800 rounded-lg text-xs transition-colors" title="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-lg font-bold transition-colors">−</button>
      </div>

      {/* Agent count */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-gray-900/80 border border-gray-800 rounded-xl text-xs text-gray-500">
        🏢 {agents.length} agente{agents.length !== 1 ? 's' : ''} · scroll para zoom · arraste para mover
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl min-w-[140px]">
            <p className="text-sm font-semibold text-white">{tooltip.agent.nome}</p>
            {tooltip.agent.funcao && <p className="text-xs text-gray-400 mt-0.5">{tooltip.agent.funcao}</p>}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[tooltip.agent.status] ?? '#6b7280' }}
              />
              <span className="text-xs text-gray-500 capitalize">{tooltip.agent.status}</span>
              {tooltip.agent.tipo === 'zeus' && (
                <span className="text-xs text-yellow-500 ml-1">👑 Mestre</span>
              )}
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
    </div>
  )
}
