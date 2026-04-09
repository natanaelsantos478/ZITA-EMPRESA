import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Pencil, Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useAgentStatus } from '../../../hooks/useAgentStatus'
import { supabase } from '../../../lib/supabase'
import type { IaAgent } from '../../../types'
import Personagem2D from './Personagem2D'
import Sala2D, { type SalaConfig } from './Sala2D'
import ControleIAPanel from '../ControleIA/ControleIAPanel'
import ChatIA from '../Chat/ChatIA'

// ─── Customise Character Modal ────────────────────────────────────────────────
const FACE_OPTIONS = ['😐', '😊', '🤖', '😎', '🧠']

function CustomizeModal({ agent, onClose }: { agent: IaAgent; onClose: () => void }) {
  const [faceIdx, setFaceIdx] = useState<number>(
    (agent.integracao_config?.avatar_2d as any)?.rosto ?? 0
  )

  const save = async () => {
    const current = (agent.integracao_config ?? {}) as Record<string, unknown>
    await supabase.from('ia_agents').update({
      integracao_config: { ...current, avatar_2d: { rosto: faceIdx } },
    }).eq('id', agent.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-semibold mb-4">Personalizar {agent.nome}</h3>

        <p className="text-xs text-gray-400 mb-2">Rosto</p>
        <div className="flex gap-3 mb-6">
          {FACE_OPTIONS.map((f, i) => (
            <button
              key={i}
              onClick={() => setFaceIdx(i)}
              className={`text-2xl p-2 rounded-xl border-2 transition-colors ${
                faceIdx === i ? 'border-brand-500 bg-brand-500/10' : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">
            Cancelar
          </button>
          <button onClick={save} className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
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

        <label className="block text-xs text-gray-400 mb-1">Cor</label>
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
  { id: 'zeus', nome: 'Sala Principal', cor: '#eab308', x: 40, y: 80, w: 300, h: 240 },
  { id: 'especialistas', nome: 'Sala Especialistas', cor: '#4e5eff', x: 380, y: 80, w: 300, h: 240 },
  { id: 'escritorio', nome: 'Escritório Geral', cor: '#22c55e', x: 720, y: 80, w: 320, h: 240 },
]

// ─── Main component ───────────────────────────────────────────────────────────
export default function Escritorio2D() {
  const { companyId, isAdmin } = useAuth()
  const { agents } = useAgentStatus()

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })

  const canvasRef = useRef<HTMLDivElement>(null)

  // Salas — loaded from localStorage
  const storageKey = `${companyId}_2d_salas`
  const [salas, setSalas] = useState<SalaConfig[]>(() => {
    try {
      const raw = localStorage.getItem(`${companyId}_2d_salas`)
      if (raw) return JSON.parse(raw)
    } catch {}
    return DEFAULT_SALAS
  })

  // Agent positions in 2D (within their sala, relative to canvas)
  const posKey = `${companyId}_2d_positions`
  const [agentPos, setAgentPos] = useState<Record<string, { x: number; y: number; salaId: string }>>(() => {
    try {
      const raw = localStorage.getItem(`${companyId}_2d_positions`)
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  })

  // Sala drag
  const [draggingSala, setDraggingSala] = useState<string | null>(null)
  const [salasDragStart, setSalasDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 })

  // UI
  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IaAgent | null>(null)
  const [customizeAgent, setCustomizeAgent] = useState<IaAgent | null>(null)
  const [showSalaModal, setShowSalaModal] = useState(false)
  const [editingSala, setEditingSala] = useState<SalaConfig | null>(null)

  // Agent drag
  const [draggingAgent, setDraggingAgent] = useState<string | null>(null)
  const [agentDragStart, setAgentDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 })

  // Persist to localStorage
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(salas)) }, [salas, storageKey])
  useEffect(() => { localStorage.setItem(posKey, JSON.stringify(agentPos)) }, [agentPos, posKey])

  // Auto-place new agents
  useEffect(() => {
    setAgentPos((prev) => {
      const next = { ...prev }
      let changed = false
      agents.forEach((a, idx) => {
        if (!next[a.id]) {
          const sala = a.tipo === 'zeus' ? 'zeus'
            : a.tipo === 'especialista' ? 'especialistas'
            : 'escritorio'
          const salaConf = salas.find((s) => s.id === sala) ?? salas[0]
          next[a.id] = {
            x: salaConf.x + 24 + (idx % 4) * 84,
            y: salaConf.y + 60 + Math.floor(idx / 4) * 100,
            salaId: sala,
          }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [agents, salas])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-sala]')) return
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

  const addSala = (data: Omit<SalaConfig, 'id'>) => {
    setSalas((prev) => [...prev, { ...data, id: crypto.randomUUID() }])
  }

  const deleteSala = (id: string) => {
    setSalas((prev) => prev.filter((s) => s.id !== id))
  }

  // Build connections
  const connections: Array<{ from: string; to: string }> = []
  agents.forEach((a) => {
    if (a.organograma_parent_id && agentPos[a.organograma_parent_id] && agentPos[a.id]) {
      connections.push({ from: a.organograma_parent_id, to: a.id })
    }
  })

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-950">
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle, #6b7280 1px, transparent 1px)',
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x % (28 * zoom)}px ${pan.y % (28 * zoom)}px`,
        }}
      />

      {/* Toolbar */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 bg-gray-900 border border-gray-800 rounded-xl p-2 shadow-lg">
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={() => { setZoom(0.9); setPan({ x: 20, y: 20 }) }} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <Maximize2 className="w-4 h-4" />
        </button>
        {isAdmin && (
          <>
            <div className="border-t border-gray-800 my-0.5" />
            <button onClick={() => setShowSalaModal(true)} title="Nova sala" className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
              <Plus className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/80 border border-gray-800 rounded-full px-3 py-1 text-xs text-gray-500">
        {Math.round(zoom * 100)}%
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={(e) => { e.preventDefault(); setZoom((z) => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001))) }}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute' }}>

          {/* Salas */}
          {salas.map((sala) => (
            <div key={sala.id} data-sala={sala.id} style={{ position: 'absolute' }}>
              <Sala2D
                sala={sala}
                onDragStart={startSalaDrag}
                isAdmin={isAdmin}
              >
                {/* Characters in this sala */}
                {agents
                  .filter((a) => (agentPos[a.id]?.salaId ?? 'escritorio') === sala.id)
                  .map((agent) => {
                    const pos = agentPos[agent.id]
                    if (!pos) return null
                    // Position relative to sala
                    const relX = pos.x - sala.x
                    const relY = pos.y - sala.y - 32 /* title bar */
                    return (
                      <div
                        key={agent.id}
                        data-agent2d={agent.id}
                        style={{ position: 'absolute', left: relX, top: relY, cursor: 'grab' }}
                        onMouseDown={(e) => startAgentDrag(agent.id, e)}
                        onDoubleClick={() => setCustomizeAgent(agent)}
                      >
                        <Personagem2D
                          agent={agent}
                          onClick={() => setSelectedAgent(agent)}
                        />
                      </div>
                    )
                  })
                }
              </Sala2D>

              {/* Edit/Delete sala buttons — admin only */}
              {isAdmin && (
                <div
                  className="absolute flex gap-1"
                  style={{ top: sala.y - 28, left: sala.x + sala.w - 56 }}
                >
                  <button
                    onClick={() => setEditingSala(sala)}
                    className="p-1 bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 text-gray-400 hover:text-white transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteSala(sala.id)}
                    className="p-1 bg-gray-800 hover:bg-red-900 rounded-md border border-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* SVG connection lines */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '4000px', height: '3000px', pointerEvents: 'none' }}>
            {connections.map(({ from, to }) => {
              const fp = agentPos[from]
              const tp = agentPos[to]
              if (!fp || !tp) return null
              const fromAgent = agents.find((a) => a.id === from)
              const color = fromAgent?.cor_hex ?? '#4e5eff'
              return (
                <line
                  key={`${from}-${to}`}
                  x1={fp.x + 22} y1={fp.y + 44}
                  x2={tp.x + 22} y2={tp.y + 44}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                  strokeDasharray="6,4"
                />
              )
            })}
          </svg>

          {agents.length === 0 && (
            <div style={{ position: 'absolute', left: 200, top: 300, width: 400 }} className="flex flex-col items-center justify-center">
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

      {/* Panels */}
      {selectedAgent && (
        <ControleIAPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => setChatAgent(selectedAgent)}
        />
      )}
      {chatAgent && <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />}
      {customizeAgent && <CustomizeModal agent={customizeAgent} onClose={() => setCustomizeAgent(null)} />}
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
