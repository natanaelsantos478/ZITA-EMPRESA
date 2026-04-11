import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Pencil, Trash2, ZoomIn, ZoomOut, Maximize2, RotateCw } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import type { IaAgent } from '../../../types'
import Personagem2D, { AGENT_CIRCLE_CX_OFFSET, AGENT_CIRCLE_CY_OFFSET } from './Personagem2D'
import Sala2D, { type SalaConfig } from './Sala2D'
import ControleIAPanel from '../ControleIA/ControleIAPanel'
import ChatIA from '../Chat/ChatIA'
import { DeskIcon, ChairIcon } from './FurnitureIcons'
import { useAgentSimulation, type FurnitureItem, type FurnitureMap } from './useAgentSimulation'

// ─── Debounce helper ──────────────────────────────────────────────────────────
function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>
  return (...args: T) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

// ─── Add/Edit Sala Modal ──────────────────────────────────────────────────────
function SalaModal({
  sala, onSave, onClose,
}: {
  sala?: SalaConfig
  onSave: (s: Omit<SalaConfig, 'id'>) => void
  onClose: () => void
}) {
  const [nome, setNome] = useState(sala?.nome ?? '')
  const [cor, setCor] = useState(sala?.cor ?? '#4e5eff')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-semibold mb-4">{sala ? 'Editar sala' : 'Nova sala'}</h3>

        <label className="block text-xs text-gray-400 mb-1">Nome</label>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-4 outline-none focus:border-brand-500"
        />

        <label className="block text-xs text-gray-400 mb-1">Cor de identificação</label>
        <div className="flex gap-3 mb-6 flex-wrap">
          {['#4e5eff','#22c55e','#eab308','#ef4444','#a855f7','#f97316','#06b6d4'].map((c) => (
            <button
              key={c}
              onClick={() => setCor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${cor === c ? 'border-white scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)}
            className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent" />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">
            Cancelar
          </button>
          <button
            disabled={!nome.trim()}
            onClick={() => { if (nome.trim()) { onSave({ nome, cor, x: sala?.x ?? 60, y: sala?.y ?? 60, w: sala?.w ?? 320, h: sala?.h ?? 260 }); onClose() } }}
            className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Default salas ─────────────────────────────────────────────────────────────
const DEFAULT_SALAS: SalaConfig[] = [
  { id: 'zeus',         nome: 'Sala Principal',      cor: '#eab308', x: 40,  y: 80, w: 300, h: 260 },
  { id: 'especialistas',nome: 'Sala Especialistas',  cor: '#4e5eff', x: 380, y: 80, w: 300, h: 260 },
  { id: 'escritorio',   nome: 'Escritório Geral',    cor: '#22c55e', x: 720, y: 80, w: 320, h: 260 },
]

// ─── Default furniture por sala ───────────────────────────────────────────────
function makeDefaultFurniture(salaId: string): FurnitureItem[] {
  const items: FurnitureItem[] = []
  for (let i = 0; i < 4; i++) {
    const col = 20 + (i % 2) * 110
    const row = 40 + Math.floor(i / 2) * 100
    items.push({ id: `${salaId}-desk-${i}`,  type: 'desk',  x: col,      y: row,      rotation: 0 })
    items.push({ id: `${salaId}-chair-${i}`, type: 'chair', x: col + 14, y: row + 36, rotation: 0 })
  }
  return items
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Escritorio2DProps {
  agents: IaAgent[]
  tarefasCounts?: Record<string, number>
}

export default function Escritorio2D({ agents, tarefasCounts: _tarefasCounts = {} }: Escritorio2DProps) {
  const { companyId, isAdmin } = useAuth()

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })

  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Salas ──────────────────────────────────────────────────────────────────
  const storageKey = `${companyId}_2d_salas`
  const [salas, setSalas] = useState<SalaConfig[]>(() => {
    try {
      const raw = localStorage.getItem(`${companyId}_2d_salas`)
      if (raw) return JSON.parse(raw)
    } catch {}
    return DEFAULT_SALAS
  })

  // ── Posições dos agentes (canônicas / cadeira de origem) ──────────────────
  const posKey = `${companyId}_2d_positions`
  const [agentPos, setAgentPos] = useState<Record<string, { x: number; y: number; salaId: string }>>(() => {
    try {
      const raw = localStorage.getItem(`${companyId}_2d_positions`)
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  })

  // ── Móveis por sala ────────────────────────────────────────────────────────
  const furnitureKey = `${companyId}_2d_furniture`
  const [salaFurniture, setSalaFurniture] = useState<FurnitureMap>(() => {
    try {
      const raw = localStorage.getItem(`${companyId}_2d_furniture`)
      if (raw) return JSON.parse(raw)
    } catch {}
    // Semear móveis padrão nas salas iniciais
    return {
      zeus:          makeDefaultFurniture('zeus'),
      especialistas: makeDefaultFurniture('especialistas'),
      escritorio:    makeDefaultFurniture('escritorio'),
    }
  })

  // ── Estados de drag ────────────────────────────────────────────────────────
  const [draggingSala,     setDraggingSala]     = useState<string | null>(null)
  const [salasDragStart,   setSalasDragStart]   = useState({ mx: 0, my: 0, ox: 0, oy: 0 })
  const [draggingAgent,    setDraggingAgent]    = useState<string | null>(null)
  const [agentDragStart,   setAgentDragStart]   = useState({ mx: 0, my: 0, ox: 0, oy: 0 })

  // ── Furniture management ───────────────────────────────────────────────────
  const [furnitureDeleteMode,   setFurnitureDeleteMode]   = useState(false)
  const [selectedFurnitureId,   setSelectedFurnitureId]   = useState<string | null>(null)
  const [selectedFurnitureSala, setSelectedFurnitureSala] = useState<string | null>(null)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent,     setChatAgent]     = useState<IaAgent | null>(null)
  const [showSalaModal, setShowSalaModal] = useState(false)
  const [editingSala,   setEditingSala]   = useState<SalaConfig | null>(null)

  // ── Ticker para expirar balões de chat ─────────────────────────────────────
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // ── Simulação Sims-like ────────────────────────────────────────────────────
  const { simStates } = useAgentSimulation({
    agents,
    agentPos,
    salas,
    salaFurniture,
    enabled: true,
  })

  // ── Persitência com debounce ───────────────────────────────────────────────
  const debouncedSaveSalas = useCallback(
    debounce((v: SalaConfig[]) => localStorage.setItem(storageKey, JSON.stringify(v)), 800),
    [storageKey],
  )
  const debouncedSavePos = useCallback(
    debounce((v: Record<string, unknown>) => localStorage.setItem(posKey, JSON.stringify(v)), 800),
    [posKey],
  )
  const debouncedSaveFur = useCallback(
    debounce((v: FurnitureMap) => localStorage.setItem(furnitureKey, JSON.stringify(v)), 800),
    [furnitureKey],
  )
  useEffect(() => { debouncedSaveSalas(salas) },        [salas,         debouncedSaveSalas])
  useEffect(() => { debouncedSavePos(agentPos) },       [agentPos,      debouncedSavePos])
  useEffect(() => { debouncedSaveFur(salaFurniture) },  [salaFurniture, debouncedSaveFur])

  // ── Auto-colocar novos agentes ─────────────────────────────────────────────
  useEffect(() => {
    setAgentPos((prev) => {
      const next = { ...prev }
      let changed = false
      agents.forEach((a, idx) => {
        if (!next[a.id]) {
          const salaId = a.tipo === 'zeus' ? 'zeus'
            : a.tipo === 'especialista' ? 'especialistas'
            : 'escritorio'
          const salaConf = salas.find((s) => s.id === salaId) ?? salas[0]
          // Tentar posicionar na cadeira disponível
          const chairs = (salaFurniture[salaId] ?? []).filter(f => f.type === 'chair')
          const chair  = chairs[idx % Math.max(chairs.length, 1)]
          const chairX = chair ? salaConf.x + chair.x + 4 : salaConf.x + 24 + (idx % 4) * 84
          const chairY = chair ? salaConf.y + 28 + chair.y + 4 : salaConf.y + 60 + Math.floor(idx / 4) * 100
          next[a.id] = { x: chairX, y: chairY, salaId }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [agents, salas, salaFurniture])

  // ── Handlers de input ──────────────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-sala]'))    return
    if ((e.target as HTMLElement).closest('[data-agent2d]')) return
    setIsPanning(true)
    setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y })
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: panStart.px + (e.clientX - panStart.mx), y: panStart.py + (e.clientY - panStart.my) })
      return
    }
    if (draggingSala) {
      const dx = (e.clientX - salasDragStart.mx) / zoom
      const dy = (e.clientY - salasDragStart.my) / zoom
      setSalas((prev) => prev.map((s) =>
        s.id === draggingSala ? { ...s, x: salasDragStart.ox + dx, y: salasDragStart.oy + dy } : s
      ))
      return
    }
    if (draggingAgent) {
      const dx = (e.clientX - agentDragStart.mx) / zoom
      const dy = (e.clientY - agentDragStart.my) / zoom
      setAgentPos((prev) => ({
        ...prev,
        [draggingAgent]: { ...prev[draggingAgent], x: agentDragStart.ox + dx, y: agentDragStart.oy + dy },
      }))
    }
  }, [isPanning, panStart, draggingSala, salasDragStart, zoom, draggingAgent, agentDragStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    setDraggingSala(null)
    setDraggingAgent(null)
  }, [])

  const startSalaDrag = (e: React.MouseEvent, salaId: string) => {
    e.stopPropagation()
    const sala = salas.find((s) => s.id === salaId)
    if (!sala) return
    setDraggingSala(salaId)
    setSalasDragStart({ mx: e.clientX, my: e.clientY, ox: sala.x, oy: sala.y })
  }

  const startAgentDrag = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const pos = agentPos[agentId]
    if (!pos) return
    setDraggingAgent(agentId)
    setAgentDragStart({ mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y })
  }

  // ── Sala actions ────────────────────────────────────────────────────────────
  const addSala = (data: Omit<SalaConfig, 'id'>) => {
    const newId = crypto.randomUUID()
    setSalas((prev) => [...prev, { ...data, id: newId }])
    setSalaFurniture((prev) => ({ ...prev, [newId]: makeDefaultFurniture(newId) }))
  }

  const deleteSala = (id: string) => {
    setSalas((prev) => prev.filter((s) => s.id !== id))
  }

  // ── Furniture actions ──────────────────────────────────────────────────────
  const removeFurniture = (salaId: string, itemId: string) => {
    setSalaFurniture((prev) => ({
      ...prev,
      [salaId]: (prev[salaId] ?? []).filter((f) => f.id !== itemId),
    }))
  }

  const handleRotateFurniture = () => {
    if (!selectedFurnitureId || !selectedFurnitureSala) return
    setSalaFurniture((prev) => ({
      ...prev,
      [selectedFurnitureSala]: (prev[selectedFurnitureSala] ?? []).map((f) =>
        f.id === selectedFurnitureId
          ? { ...f, rotation: ((f.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
          : f
      ),
    }))
  }

  // ── Build org-chart connections ────────────────────────────────────────────
  const connections: Array<{ from: string; to: string }> = []
  agents.forEach((a) => {
    if (a.organograma_parent_id && agentPos[a.organograma_parent_id] && agentPos[a.id]) {
      connections.push({ from: a.organograma_parent_id, to: a.id })
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#0b0d13' }}>

      {/* ── Toolbar de admin ─────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 py-1.5"
          style={{ backgroundColor: '#0d0f14', borderBottom: '1px solid #2d3142', height: '38px' }}
        >
          <button
            onClick={() => setShowSalaModal(true)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-400 hover:text-white rounded-md transition-colors"
            style={{ background: '#1a1d27', border: '1px solid #2d3142' }}
          >
            <Plus className="w-3.5 h-3.5" /> Nova Sala
          </button>
          <button
            onClick={handleRotateFurniture}
            disabled={!selectedFurnitureId}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-400 hover:text-white rounded-md transition-colors disabled:opacity-40"
            style={{ background: '#1a1d27', border: '1px solid #2d3142' }}
            title={selectedFurnitureId ? 'Rotacionar móvel selecionado' : 'Selecione um móvel primeiro'}
          >
            <RotateCw className="w-3.5 h-3.5" /> Rotacionar
          </button>
          <button
            onClick={() => { setFurnitureDeleteMode(v => !v); setSelectedFurnitureId(null) }}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors"
            style={furnitureDeleteMode
              ? { color: '#fca5a5', background: 'rgba(153,27,27,0.3)', border: '1px solid rgba(185,28,28,0.5)' }
              : { color: '#9ca3af', background: '#1a1d27', border: '1px solid #2d3142' }
            }
          >
            <Trash2 className="w-3.5 h-3.5" />
            {furnitureDeleteMode ? 'Clique no móvel' : 'Apagar móvel'}
          </button>
          {selectedFurnitureId && !furnitureDeleteMode && (
            <span className="text-xs text-gray-500 ml-2">
              Móvel selecionado — clique Rotacionar para girar
            </span>
          )}
        </div>
      )}

      {/* ── Dot grid ─────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          top: isAdmin ? '38px' : 0,
          backgroundImage: 'radial-gradient(circle, #6b7280 1px, transparent 1px)',
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x % (28 * zoom)}px ${pan.y % (28 * zoom)}px`,
        }}
      />

      {/* ── Toolbar de zoom (canto inferior esquerdo) ────────────────────── */}
      <div
        className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 rounded-xl p-2 shadow-lg"
        style={{ background: '#141720', border: '1px solid #2d3142' }}
      >
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={() => { setZoom(0.9); setPan({ x: 20, y: 20 }) }}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* ── Indicador de zoom ────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-full px-3 py-1 text-xs text-gray-500"
        style={{ background: 'rgba(20,23,32,0.85)', border: '1px solid #2d3142' }}>
        {Math.round(zoom * 100)}%
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ top: isAdmin ? '38px' : 0 }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={(e) => {
          e.preventDefault()
          setZoom((z) => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)))
        }}
      >
        <div style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
        }}>

          {/* ── Salas ──────────────────────────────────────────────────── */}
          {salas.map((sala) => (
            <div key={sala.id} data-sala={sala.id} style={{ position: 'absolute' }}>
              <Sala2D sala={sala} onDragStart={startSalaDrag} isAdmin={isAdmin}>

                {/* ── Móveis (detrás dos agentes) ─────────────────────── */}
                {(salaFurniture[sala.id] ?? []).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      left: item.x,
                      top: item.y,
                      zIndex: 1,
                      cursor: furnitureDeleteMode ? 'pointer' : 'default',
                      outline: selectedFurnitureId === item.id && !furnitureDeleteMode
                        ? '2px solid rgba(78,94,255,0.7)'
                        : 'none',
                      borderRadius: '3px',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (furnitureDeleteMode) {
                        removeFurniture(sala.id, item.id)
                      } else {
                        setSelectedFurnitureId(item.id)
                        setSelectedFurnitureSala(sala.id)
                      }
                    }}
                    title={furnitureDeleteMode ? 'Clique para remover' : 'Clique para selecionar'}
                  >
                    {item.type === 'desk'  && <DeskIcon />}
                    {item.type === 'chair' && <ChairIcon rotation={item.rotation} />}
                  </div>
                ))}

                {/* ── Agentes com simulação Sims-like ─────────────────── */}
                {agents
                  .filter((a) => (agentPos[a.id]?.salaId ?? 'escritorio') === sala.id)
                  .map((agent) => {
                    const pos = agentPos[agent.id]
                    const sim = simStates[agent.id]
                    if (!pos) return null

                    // Usar posição simulada ou posição canônica
                    const absX = sim ? sim.targetX : pos.x
                    const absY = sim ? sim.targetY : pos.y
                    const relX = absX - sala.x
                    const relY = absY - sala.y - 28 /* title bar */

                    const isMoving = sim?.state !== 'SITTING' && sim?.state !== undefined
                    const hasBubble = !!(sim?.chatMessage && sim.chatExpiry && now < sim.chatExpiry)

                    return (
                      <div
                        key={agent.id}
                        data-agent2d={agent.id}
                        style={{
                          position: 'absolute',
                          left: relX,
                          top: relY,
                          cursor: 'grab',
                          zIndex: 10,
                          transition: isMoving ? 'left 1.8s ease, top 1.8s ease' : 'none',
                        }}
                        onMouseDown={(e) => startAgentDrag(agent.id, e)}
                      >
                        {/* Balão de conversa */}
                        {hasBubble && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              marginBottom: '6px',
                              maxWidth: '150px',
                              textAlign: 'center',
                              zIndex: 20,
                              pointerEvents: 'none',
                            }}
                          >
                            <div
                              className="px-2 py-1 text-white rounded-md shadow-lg whitespace-normal text-[10px] leading-tight"
                              style={{
                                background: '#1e2235',
                                border: '1px solid #3a4060',
                              }}
                            >
                              {sim!.chatMessage}
                            </div>
                            {/* Seta do balão */}
                            <div style={{
                              margin: '0 auto',
                              width: 0, height: 0,
                              borderLeft: '5px solid transparent',
                              borderRight: '5px solid transparent',
                              borderTop: '5px solid #3a4060',
                            }} />
                          </div>
                        )}

                        {/* Indicador de atividade (banheiro) */}
                        {sim?.state === 'BATHROOM' && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              marginBottom: '4px',
                              fontSize: '16px',
                              zIndex: 20,
                              pointerEvents: 'none',
                            }}
                          >
                            🚻
                          </div>
                        )}

                        <Personagem2D
                          agent={agent}
                          onClick={() => setSelectedAgent(agent)}
                        />
                      </div>
                    )
                  })}
              </Sala2D>

              {/* ── Botões editar/apagar sala ──────────────────────────── */}
              {isAdmin && (
                <div
                  className="absolute flex gap-1"
                  style={{ top: sala.y - 28, left: sala.x + sala.w - 56 }}
                >
                  <button
                    onClick={() => setEditingSala(sala)}
                    className="p-1 rounded-md border text-gray-400 hover:text-white transition-colors"
                    style={{ background: '#1a1d27', border: '1px solid #2d3142' }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteSala(sala.id)}
                    className="p-1 rounded-md border text-gray-400 hover:text-red-400 transition-colors"
                    style={{ background: '#1a1d27', border: '1px solid #2d3142' }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* ── Linhas SVG de hierarquia (org-chart) ─────────────────── */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '4000px', height: '3000px', pointerEvents: 'none' }}>
            <defs>
              {connections.map(({ from }) => {
                const fromAgent = agents.find((a) => a.id === from)
                const color = fromAgent?.cor_hex ?? '#4e5eff'
                return (
                  <marker
                    key={`arrow-${from}`}
                    id={`arrow-${from}`}
                    viewBox="0 0 8 8"
                    refX="7" refY="4"
                    markerWidth="6" markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill={color} opacity={0.6} />
                  </marker>
                )
              })}
            </defs>

            {connections.map(({ from, to }) => {
              const fp = agentPos[from]
              const tp = agentPos[to]
              if (!fp || !tp) return null
              const fromAgent = agents.find((a) => a.id === from)
              const color = fromAgent?.cor_hex ?? '#4e5eff'
              const x1 = fp.x + AGENT_CIRCLE_CX_OFFSET
              const y1 = fp.y + AGENT_CIRCLE_CY_OFFSET
              const x2 = tp.x + AGENT_CIRCLE_CX_OFFSET
              const y2 = tp.y + AGENT_CIRCLE_CY_OFFSET
              const cy1 = y1 + (y2 - y1) * 0.4
              const cy2 = y2 - (y2 - y1) * 0.4
              return (
                <path
                  key={`${from}-${to}`}
                  d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                  fill="none"
                  markerEnd={`url(#arrow-${from})`}
                />
              )
            })}
          </svg>

          {agents.length === 0 && (
            <div style={{ position: 'absolute', left: 200, top: 300, width: 400 }}
              className="flex flex-col items-center justify-center">
              <p className="text-gray-600 text-sm">Nenhuma IA cadastrada.</p>
              {isAdmin && (
                <a href="/configuracoes/ias" className="text-brand-400 text-sm mt-1 hover:underline">
                  Adicionar primeira IA →
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Panels ─────────────────────────────────────────────────────────── */}
      {selectedAgent && (
        <ControleIAPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => setChatAgent(selectedAgent)}
        />
      )}
      {chatAgent && <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />}
      {showSalaModal && (
        <SalaModal onSave={addSala} onClose={() => setShowSalaModal(false)} />
      )}
      {editingSala && (
        <SalaModal
          sala={editingSala}
          onSave={(data) => {
            setSalas((prev) => prev.map((s) => s.id === editingSala.id ? { ...s, ...data } : s))
          }}
          onClose={() => setEditingSala(null)}
        />
      )}
    </div>
  )
}
