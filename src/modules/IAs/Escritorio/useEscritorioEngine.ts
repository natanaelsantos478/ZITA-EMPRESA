import { useRef, useEffect, useCallback } from 'react'
import type { RefObject } from 'react'
import type { IaAgent } from '../../../types'
import type { ThemeName, FurnitureItem, FurnitureType, Camera } from './types'
import { TILE, PIXEL, GRID_W, GRID_H } from './constants'
import { THEMES } from './themes'
import { drawBackground, drawFloorTile, drawWalls } from './sprites/tiles'
import { drawFurniture } from './sprites/furniture'
import { drawAgent } from './sprites/characters'
import type { AgentRenderInfo } from './sprites/characters'

// ─── Constants ────────────────────────────────────────────────────────────────
const S = 1            // base scale (tiles are TILE*S = 32px in world space)
const DEFAULT_ZOOM = 1.5

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentAnim { idlePhase: number }
interface DragState  { dragging: boolean; startX: number; startY: number; lastX: number; lastY: number }

interface Props {
  canvasRef:         RefObject<HTMLCanvasElement | null>
  agents:            IaAgent[]
  tarefasCounts:     Record<string, number>
  theme:             ThemeName
  bgLight:           boolean
  furniture:         FurnitureItem[]
  placingType?:      FurnitureType | null
  onSelectAgent?:    (a: IaAgent) => void
  onChat?:           (a: IaAgent) => void
  onPlaceFurniture?: (item: FurnitureItem) => void
  onRemoveFurniture?:(id: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mapStatus(s: string): AgentRenderInfo['status'] {
  if (s === 'online' || s === 'ocupada') return 'active'
  if (s === 'aguardando')               return 'idle'
  if (s === 'erro')                     return 'error'
  return 'offline'
}

function tileSize() { return TILE * S }

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useEscritorioEngine({
  canvasRef, agents, tarefasCounts: _tarefas,
  theme, bgLight, furniture,
  placingType,
  onSelectAgent, onChat,
  onPlaceFurniture, onRemoveFurniture,
}: Props) {
  // Stable refs for values used inside rAF (avoids stale closures)
  const agentsRef    = useRef(agents)
  const themeRef     = useRef(theme)
  const bgLightRef   = useRef(bgLight)
  const furnitureRef = useRef(furniture)
  useEffect(() => { agentsRef.current    = agents    }, [agents])
  useEffect(() => { themeRef.current     = theme     }, [theme])
  useEffect(() => { bgLightRef.current   = bgLight   }, [bgLight])
  useEffect(() => { furnitureRef.current = furniture }, [furniture])

  const cameraRef     = useRef<Camera>({
    x: 0, y: 0, targetX: 0, targetY: 0,
    zoom: DEFAULT_ZOOM, targetZoom: DEFAULT_ZOOM,
  })
  const animsRef      = useRef<Map<string, AgentAnim>>(new Map())
  const frameRef      = useRef(0)
  const rafRef        = useRef(0)
  const dragRef       = useRef<DragState>({ dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0 })
  const placingRef    = useRef(placingType)
  const hoverTileRef  = useRef<{ col: number; row: number } | null>(null)
  useEffect(() => { placingRef.current = placingType }, [placingType])

  // ── Compute world coords from canvas coords ────────────────────────────────
  const canvasToWorld = useCallback((cx: number, cy: number): [number, number] => {
    const canvas = canvasRef.current!
    const cam    = cameraRef.current
    const W = canvas.width, H = canvas.height
    return [
      (cx - W / 2) / cam.zoom + cam.x,
      (cy - H / 2) / cam.zoom + cam.y,
    ]
  }, [canvasRef])

  // ── Agent tile positions (world coords) ───────────────────────────────────
  const agentWorldPositions = useCallback((): Array<{ agent: IaAgent; wx: number; wy: number }> => {
    const ts = tileSize()
    const roomW = GRID_W * ts
    const roomH = GRID_H * ts
    const ox = -roomW / 2
    const oy = -roomH / 2
    const desks = furnitureRef.current.filter(f => f.type === 'desk')
    return agentsRef.current.map((agent, i) => {
      if (desks[i]) {
        const d = desks[i]
        // Center-x of 2-tile-wide desk, one tile below (in front)
        return { agent, wx: ox + (d.tileX + 1) * ts, wy: oy + (d.tileY + 1) * ts }
      }
      // Fallback: grid positions across corridor
      const col = 2 + (i % (GRID_W - 4))
      const row = 2 + Math.floor(i / (GRID_W - 4)) * 4
      return { agent, wx: ox + col * ts, wy: oy + row * ts }
    })
  }, [])

  // ── Main draw function ─────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const t   = THEMES[themeRef.current]
    const cam = cameraRef.current
    const ts  = tileSize()
    const W = canvas.width, H = canvas.height

    // Smooth lerp camera
    cam.x    += (cam.targetX    - cam.x)    * 0.12
    cam.y    += (cam.targetY    - cam.y)    * 0.12
    cam.zoom += (cam.targetZoom - cam.zoom) * 0.12

    // Background (outside room)
    drawBackground(ctx, t, bgLightRef.current, W, H)

    // World transform
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.translate(W / 2 - cam.x * cam.zoom, H / 2 - cam.y * cam.zoom)
    ctx.scale(cam.zoom, cam.zoom)

    const roomW = GRID_W * ts
    const roomH = GRID_H * ts
    const ox = -roomW / 2
    const oy = -roomH / 2

    // Floor tiles (inner grid only)
    for (let row = 1; row < GRID_H - 1; row++) {
      for (let col = 1; col < GRID_W - 1; col++) {
        drawFloorTile(ctx, themeRef.current, t, ox + col * ts, oy + row * ts, col, row, S)
      }
    }

    // Walls
    drawWalls(ctx, themeRef.current, t, ox, oy, GRID_W, GRID_H, S)

    // Furniture
    for (const item of furnitureRef.current) {
      drawFurniture(ctx, item.type, t, ox + item.tileX * ts, oy + item.tileY * ts, S)
    }

    // Hover tile highlight (when placing furniture)
    if (placingRef.current && hoverTileRef.current) {
      const { col, row } = hoverTileRef.current
      ctx.fillStyle = 'rgba(100,220,100,0.35)'
      ctx.fillRect(ox + col * ts, oy + row * ts, ts, ts)
      ctx.strokeStyle = 'rgba(100,220,100,0.9)'
      ctx.lineWidth = 2
      ctx.strokeRect(ox + col * ts + 1, oy + row * ts + 1, ts - 2, ts - 2)
    }

    // Agents
    frameRef.current++
    for (const { agent, wx, wy } of agentWorldPositions()) {
      if (!animsRef.current.has(agent.id)) {
        animsRef.current.set(agent.id, { idlePhase: (Math.random() * 90) | 0 })
      }
      const anim = animsRef.current.get(agent.id)!
      anim.idlePhase = (anim.idlePhase + 1) % 90
      const blinkFrame = anim.idlePhase > 84 ? 1 : 0  // blink for 6 frames in 90

      drawAgent(ctx, themeRef.current, {
        id: agent.id,
        name: agent.nome,
        colorHex: agent.cor_hex,
        status: mapStatus(agent.status),
        isZeus: agent.tipo === 'zeus',
      }, wx, wy, S, blinkFrame)
    }

    ctx.restore()
  }, [canvasRef, agentWorldPositions])

  // ── rAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    const loop = () => { if (!alive) return; draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(rafRef.current) }
  }, [draw])

  // ── Canvas resize observer ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      canvas.width  = Math.round(rect.width)
      canvas.height = Math.round(rect.height)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [canvasRef])

  // ── Mouse: pan ─────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY }
  }, [])

  // Helper: canvas event → tile coords
  const eventToTile = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const [wx, wy] = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const ts = tileSize()
    const ox = -GRID_W * ts / 2
    const oy = -GRID_H * ts / 2
    const col = Math.floor((wx - ox) / ts)
    const row = Math.floor((wy - oy) / ts)
    if (col < 1 || col >= GRID_W - 1 || row < 1 || row >= GRID_H - 1) return null
    return { col, row }
  }, [canvasRef, canvasToWorld])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Update hover tile for placement highlight
    if (placingRef.current) {
      hoverTileRef.current = eventToTile(e)
    }
    const d = dragRef.current
    if (!d.dragging) return
    const dx = e.clientX - d.lastX
    const dy = e.clientY - d.lastY
    d.lastX = e.clientX
    d.lastY = e.clientY
    const cam = cameraRef.current
    cam.targetX -= dx / cam.zoom
    cam.targetY -= dy / cam.zoom
  }, [eventToTile])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current
    const dx = Math.abs(e.clientX - d.startX)
    const dy = Math.abs(e.clientY - d.startY)
    d.dragging = false
    if (dx + dy > 4) return   // was a drag

    // Furniture placement mode
    if (placingRef.current) {
      const tile = eventToTile(e)
      if (tile) {
        onPlaceFurniture?.({
          id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: placingRef.current,
          tileX: tile.col, tileY: tile.row,
          rotation: 0,
        })
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const [wx, wy] = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top)

    // Right-click on furniture = remove
    if (e.button === 2) {
      const ts = tileSize()
      const ox = -GRID_W * ts / 2
      const oy = -GRID_H * ts / 2
      for (const item of [...furnitureRef.current].reverse()) {
        const ix = ox + item.tileX * ts, iy = oy + item.tileY * ts
        if (wx >= ix && wx < ix + ts && wy >= iy && wy < iy + ts) {
          onRemoveFurniture?.(item.id)
          return
        }
      }
    }

    // Agent hit test
    const p = PIXEL * S
    const hitW = 8 * p, hitH = 17 * p
    for (const { agent, wx: ax, wy: ay } of agentWorldPositions()) {
      if (wx >= ax - hitW / 2 && wx <= ax + hitW / 2 && wy >= ay && wy <= ay + hitH) {
        if (e.detail >= 2) onChat?.(agent)
        else onSelectAgent?.(agent)
        return
      }
    }
  }, [canvasRef, canvasToWorld, eventToTile, agentWorldPositions, onSelectAgent, onChat, onPlaceFurniture, onRemoveFurniture])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const cam = cameraRef.current
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    cam.targetZoom = Math.max(0.4, Math.min(3.5, cam.targetZoom * factor))
  }, [])

  return { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel }
}
