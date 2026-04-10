/**
 * Office2DView.tsx — Zelda-style top-down 2D office
 * Layouts: moderno | retro | profissional
 * Animações: typing, talking, walking (IA→IA via realtime)
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Grid3X3 } from 'lucide-react'
import type { IaAgent, IaMensagem } from '../../../types'
import { useAuth } from '../../../contexts/AuthContext'
import { useRealtime } from '../../../hooks/useRealtime'
import { TILE, CORRIDOR_W, ROWS, THEMES, STATUS_COLOR, DEFAULT_SALAS } from './office2d/types'
import type { SalaConfig, LayoutMode } from './office2d/types'
import { drawRoom, drawDesk, drawAgent, drawCorridor, roomOffsets } from './office2d/drawing'
import type { AgentBounds } from './office2d/drawing'
import { triggerTyping, triggerTalk, triggerWalkAndTalk, getAnimPos, tickAnims } from './office2d/animations'
import type { AnimMap } from './office2d/animations'
import { SalaModal } from './office2d/SalaModal'

const WORLD_H = ROWS * TILE  // constant – does not depend on salas

interface Props {
  agents: IaAgent[]
  tarefasCounts: Record<string, number>
  onSelectAgent: (a: IaAgent) => void
  onChat: (a: IaAgent) => void
  selectedId?: string
}

export default function Office2DView({ agents, onSelectAgent, selectedId }: Props) {
  const { companyId, isAdmin } = useAuth()
  const salasKey  = `${companyId}_office2d_salas`
  const layoutKey = `${companyId}_office2d_layout`

  const [salas, setSalas] = useState<SalaConfig[]>(() => {
    try { const r = localStorage.getItem(salasKey);  if (r) return JSON.parse(r) } catch {}
    return DEFAULT_SALAS
  })
  const [layout, setLayout] = useState<LayoutMode>(() =>
    (localStorage.getItem(layoutKey) as LayoutMode | null) ?? 'moderno'
  )
  const [zoom,      setZoom]      = useState(1.0)
  const [pan,       setPan]       = useState({ x: 0, y: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltip,   setTooltip]   = useState<{ x: number; y: number; agent: IaAgent } | null>(null)
  const [editMode,  setEditMode]  = useState(false)
  const [hoverTile, setHoverTile] = useState<{ salaIdx: number; col: number; row: number } | null>(null)
  const [showSalaPanel, setShowSalaPanel] = useState(false)
  const [addSalaModal,  setAddSalaModal]  = useState(false)
  const [editSala,      setEditSala]      = useState<SalaConfig | null>(null)

  // Canvas refs
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const boundsRef   = useRef<AgentBounds[]>([])
  const animRef     = useRef<number>(0)
  const timeRef     = useRef(0)
  const panningRef  = useRef(false)
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const animsRef    = useRef<AnimMap>(new Map())

  // Volatile-state refs (so draw() can have stable [] deps)
  const salasRef     = useRef(salas)
  const layoutRef    = useRef(layout)
  const zoomRef      = useRef(zoom)
  const panRef       = useRef(pan)
  const hoveredIdRef = useRef(hoveredId)
  const selectedIdRef = useRef(selectedId)
  const editModeRef  = useRef(editMode)
  const hoverTileRef = useRef(hoverTile)

  useEffect(() => { salasRef.current = salas },         [salas])
  useEffect(() => { layoutRef.current = layout },       [layout])
  useEffect(() => { zoomRef.current = zoom },           [zoom])
  useEffect(() => { panRef.current = pan },             [pan])
  useEffect(() => { hoveredIdRef.current = hoveredId }, [hoveredId])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { editModeRef.current = editMode },   [editMode])
  useEffect(() => { hoverTileRef.current = hoverTile }, [hoverTile])

  // Persist
  useEffect(() => { localStorage.setItem(salasKey,  JSON.stringify(salas)) }, [salas, salasKey])
  useEffect(() => { localStorage.setItem(layoutKey, layout) },               [layout, layoutKey])

  // Stable computed values
  const offsets = useMemo(() => roomOffsets(salas), [salas])
  const offsetsRef = useRef(offsets)
  useEffect(() => { offsetsRef.current = offsets }, [offsets])

  const WORLD_W = useMemo(() => salas.reduce((acc, s) => acc + s.cols * TILE + CORRIDOR_W, 0), [salas])
  const worldWRef = useRef(WORLD_W)
  useEffect(() => { worldWRef.current = WORLD_W }, [WORLD_W])

  // Agent group refs (for stable agentsForSala)
  const zeusRef = useRef(agents.filter(a => a.tipo === 'zeus'))
  const espRef  = useRef(agents.filter(a => a.tipo === 'especialista'))
  const restRef = useRef(agents.filter(a => a.tipo !== 'zeus' && a.tipo !== 'especialista'))
  const agentsRef = useRef(agents)
  useEffect(() => {
    agentsRef.current = agents
    zeusRef.current = agents.filter(a => a.tipo === 'zeus')
    espRef.current  = agents.filter(a => a.tipo === 'especialista')
    restRef.current = agents.filter(a => a.tipo !== 'zeus' && a.tipo !== 'especialista')
  }, [agents])

  const agentsForSala = useCallback((idx: number): IaAgent[] => {
    if (idx === 0) return zeusRef.current
    if (idx === 1) return espRef.current
    const restIdx = idx - 2
    const perRoom = Math.ceil(restRef.current.length / Math.max(1, salasRef.current.length - 2))
    return restRef.current.slice(restIdx * perRoom, (restIdx + 1) * perRoom)
  }, [])

  // Stable canvasToWorld
  const canvasToWorld = useCallback((cx: number, cy: number, canvas: HTMLCanvasElement) => {
    const zoom = zoomRef.current, pan = panRef.current, W = worldWRef.current
    const offX = pan.x + canvas.width  / 2 - (W * zoom) / 2
    const offY = pan.y + canvas.height / 2 - (WORLD_H * zoom) / 2
    return { wx: (cx - offX) / zoom, wy: (cy - offY) / zoom }
  }, [])

  // ─── Draw loop (stable – deps=[]) ────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const salas     = salasRef.current
    const offsets   = offsetsRef.current
    const zoom      = zoomRef.current
    const pan       = panRef.current
    const hoveredId = hoveredIdRef.current
    const selectedId = selectedIdRef.current
    const editMode  = editModeRef.current
    const hoverTile = hoverTileRef.current
    const layout    = layoutRef.current
    const W         = worldWRef.current

    tickAnims(animsRef.current)
    timeRef.current += 0.02
    const pulse = (Math.sin(timeRef.current) + 1) / 2

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(
      pan.x + canvas.width  / 2 - (W * zoom) / 2,
      pan.y + canvas.height / 2 - (WORLD_H * zoom) / 2,
    )
    ctx.scale(zoom, zoom)
    if (layout === 'retro') { ctx.imageSmoothingEnabled = false }

    salas.forEach((sala, i) => {
      if (i > 0) drawCorridor(ctx, offsets[i] - CORRIDOR_W)
      drawRoom(ctx, sala, offsets[i])
      const t = THEMES[sala.theme]
      sala.desks.forEach(d => drawDesk(ctx, t, offsets[i], d.col, d.row))
    })

    if (editMode && hoverTile) {
      const ox = offsets[hoverTile.salaIdx]
      ctx.fillStyle = 'rgba(250,204,21,0.25)'
      ctx.fillRect(ox + hoverTile.col * TILE, hoverTile.row * TILE, TILE, TILE)
    }

    const newBounds: AgentBounds[] = []
    salas.forEach((sala, i) => {
      agentsForSala(i).forEach((agent, ai) => {
        const slot = sala.desks[ai % sala.desks.length]; if (!slot) return
        const dw = TILE * 2.6, dh = TILE * 1.2
        const deskPos = {
          cx: offsets[i] + slot.col * TILE + dw / 2,
          cy: slot.row * TILE + dh + TILE * 0.95,
        }
        const anim = animsRef.current.get(agent.id)
        const pos  = getAnimPos(anim, deskPos)
        const b = drawAgent(ctx, agent, pos.cx, pos.cy, pulse,
          agent.id === hoveredId, agent.id === selectedId, layout, anim)
        newBounds.push(b)
      })
    })
    boundsRef.current = newBounds
    ctx.restore()
  }, [agentsForSala])   // agentsForSala is stable; everything else via refs

  useEffect(() => {
    const loop = () => { draw(); animRef.current = requestAnimationFrame(loop) }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const parent = canvas.parentElement; if (!parent) return
    const ro = new ResizeObserver(() => {
      canvas.width = parent.clientWidth; canvas.height = parent.clientHeight
    })
    ro.observe(parent)
    canvas.width = parent.clientWidth; canvas.height = parent.clientHeight
    return () => ro.disconnect()
  }, [])

  // ─── IA→IA realtime ──────────────────────────────────────────────────────────
  useRealtime<IaMensagem>(
    'ia_mensagens',
    companyId ? `company_id=eq.${companyId}` : undefined,
    (msg) => {
      if (msg.remetente_tipo !== 'ia' || !msg.remetente_id) return
      const salas   = salasRef.current
      const offsets = offsetsRef.current
      const sender  = agentsRef.current.find(a => a.id === msg.remetente_id)
      if (!sender) return
      const text = (msg.conteudo ?? '').slice(0, 40)

      // Find sender desk position
      let senderPos: { cx: number; cy: number } | null = null
      outerLoop: for (let i = 0; i < salas.length; i++) {
        const roomAgents = agentsForSala(i)
        const ai = roomAgents.findIndex(a => a.id === sender.id)
        if (ai < 0) continue
        const slot = salas[i].desks[ai % salas[i].desks.length]
        if (!slot) continue
        const dw = TILE * 2.6, dh = TILE * 1.2
        senderPos = {
          cx: offsets[i] + slot.col * TILE + dw / 2,
          cy: slot.row * TILE + dh + TILE * 0.95,
        }
        break outerLoop
      }
      if (!senderPos) return

      // Try to find recipient (another IA in conversation)
      const otherAgents = agentsRef.current.filter(
        a => a.id !== sender.id && a.tipo !== 'zeus',
      )
      if (otherAgents.length > 0) {
        // Pick a random other agent as "recipient"
        const recipient = otherAgents[Math.floor(Math.random() * otherAgents.length)]
        let recipientPos: { cx: number; cy: number } | null = null
        for (let i = 0; i < salas.length; i++) {
          const roomAgents = agentsForSala(i)
          const ai = roomAgents.findIndex(a => a.id === recipient.id)
          if (ai < 0) continue
          const slot = salas[i].desks[ai % salas[i].desks.length]
          if (!slot) continue
          const dw = TILE * 2.6, dh = TILE * 1.2
          recipientPos = {
            cx: offsets[i] + slot.col * TILE + dw / 2,
            cy: slot.row * TILE + dh + TILE * 0.95,
          }
          break
        }
        if (recipientPos) {
          triggerTyping(animsRef.current, sender.id)
          setTimeout(() => {
            if (recipientPos) triggerWalkAndTalk(animsRef.current, sender.id, senderPos!, recipientPos, text)
          }, 1000)
          return
        }
      }

      // Fallback: just typing → talking
      triggerTyping(animsRef.current, sender.id)
      setTimeout(() => triggerTalk(animsRef.current, sender.id, text), 1200)
    },
    'INSERT',
  )

  // ─── Mouse handlers ───────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top

    if (panningRef.current) {
      setPan({ x: panStartRef.current.px + (mx - panStartRef.current.mx), y: panStartRef.current.py + (my - panStartRef.current.my) })
      return
    }
    const { wx, wy } = canvasToWorld(mx, my, canvas)

    if (editModeRef.current) {
      let found: typeof hoverTile = null
      salasRef.current.forEach((sala, i) => {
        const ox = offsetsRef.current[i]
        if (wx >= ox && wx < ox + sala.cols * TILE && wy >= 0 && wy < ROWS * TILE)
          found = { salaIdx: i, col: Math.floor((wx - ox) / TILE), row: Math.floor(wy / TILE) }
      })
      setHoverTile(found); return
    }

    let hit: string | null = null
    for (const b of boundsRef.current) {
      if (Math.hypot(wx - b.cx, wy - b.cy) <= b.r) { hit = b.id; break }
    }
    setHoveredId(hit)
    if (hit) {
      const agent = agentsRef.current.find(a => a.id === hit)
      if (agent) setTooltip({ x: e.clientX, y: e.clientY, agent })
    } else { setTooltip(null) }
  }, [canvasToWorld])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    if (!hoveredIdRef.current && !editModeRef.current) {
      panningRef.current = true
      const rect = canvasRef.current!.getBoundingClientRect()
      panStartRef.current = { mx: e.clientX - rect.left, my: e.clientY - rect.top, px: panRef.current.x, py: panRef.current.y }
    }
  }, [])

  const handleMouseUp = useCallback(() => { panningRef.current = false }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { wx, wy } = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, canvas)

    if (editModeRef.current && hoverTileRef.current) {
      const { salaIdx, col, row } = hoverTileRef.current
      setSalas(prev => prev.map((sala, i) => {
        if (i !== salaIdx) return sala
        const exists = sala.desks.some(d => d.col === col && d.row === row)
        return { ...sala, desks: exists ? sala.desks.filter(d => !(d.col === col && d.row === row)) : [...sala.desks, { col, row }] }
      }))
      return
    }

    for (const b of boundsRef.current) {
      if (Math.hypot(wx - b.cx, wy - b.cy) <= b.r) {
        const agent = agentsRef.current.find(a => a.id === b.id)
        if (agent) onSelectAgent(agent)
        return
      }
    }
  }, [canvasToWorld, onSelectAgent])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)))
  }, [])

  // ─── Sala management ─────────────────────────────────────────────────────────
  const addSala    = (data: Omit<SalaConfig, 'id'>) => setSalas(prev => [...prev, { ...data, id: crypto.randomUUID() }])
  const updateSala = (id: string, data: Omit<SalaConfig, 'id'>) => setSalas(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
  const deleteSala = (id: string) => setSalas(prev => prev.filter(s => s.id !== id))
  const moveSala   = (id: string, dir: -1 | 1) => setSalas(prev => {
    const idx = prev.findIndex(s => s.id === id), ni = idx + dir
    if (ni < 0 || ni >= prev.length) return prev
    const next = [...prev];[next[idx], next[ni]] = [next[ni], next[idx]]; return next
  })

  const LAYOUT_OPTIONS: { value: LayoutMode; label: string; emoji: string }[] = [
    { value: 'moderno',       label: 'Moderno',       emoji: '🏢' },
    { value: 'retro',         label: 'Retrô',         emoji: '🪵' },
    { value: 'profissional',  label: 'Profissional',  emoji: '💼' },
  ]

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: editMode ? 'crosshair' : hoveredId ? 'pointer' : 'grab', imageRendering: layout === 'retro' ? 'pixelated' : 'auto' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { panningRef.current = false; setHoverTile(null) }}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {/* Layout toggle */}
        <div className="flex items-center gap-0.5 bg-gray-900/80 border border-gray-700 rounded-lg p-0.5">
          {LAYOUT_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setLayout(o.value)} title={o.label}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                layout === o.value ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}>
              <span>{o.emoji}</span>{o.label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button onClick={() => { setEditMode(e => !e); setHoverTile(null) }} title="Editar mesas"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              editMode ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
            }`}>
            <Grid3X3 className="w-3.5 h-3.5" />
            {editMode ? 'Clique para colocar/remover mesa' : 'Editar mesas'}
          </button>
        )}
        <button onClick={() => setShowSalaPanel(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white transition-colors">
          <Plus className="w-3.5 h-3.5" />Salas
        </button>
      </div>

      {/* Room panel */}
      {showSalaPanel && (
        <div className="absolute top-14 right-4 z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-64 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-300">Gerenciar Salas</span>
            <button onClick={() => setAddSalaModal(true)} className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex flex-col gap-1">
            {salas.map((sala, i) => (
              <div key={sala.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700">
                <span className="text-sm">{THEMES[sala.theme].emoji}</span>
                <span className="flex-1 text-xs text-white truncate">{sala.nome}</span>
                <div className="flex gap-0.5">
                  <button onClick={() => moveSala(sala.id, -1)} disabled={i === 0} className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronLeft className="w-3 h-3" /></button>
                  <button onClick={() => moveSala(sala.id,  1)} disabled={i === salas.length - 1} className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20"><ChevronRight className="w-3 h-3" /></button>
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
        <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-lg font-bold">+</button>
        <button onClick={() => setZoom(1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-white hover:bg-gray-800 rounded-lg text-xs" title="Reset">{Math.round(zoom * 100)}%</button>
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-lg font-bold">−</button>
      </div>

      {/* Info bar */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-gray-900/80 border border-gray-800 rounded-xl text-xs text-gray-500">
        🏢 {agents.length} agente{agents.length !== 1 ? 's' : ''} · {salas.length} sala{salas.length !== 1 ? 's' : ''} · scroll = zoom
      </div>

      {/* Tooltip */}
      {tooltip && !editMode && (
        <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
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

      {addSalaModal && <SalaModal onSave={addSala} onClose={() => setAddSalaModal(false)} />}
      {editSala && <SalaModal sala={editSala} onSave={d => updateSala(editSala.id, d)} onClose={() => setEditSala(null)} />}
    </div>
  )
}
