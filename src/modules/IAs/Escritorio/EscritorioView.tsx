import { useRef, useState, useCallback, useEffect } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import type { IaAgent } from '../../../types'
import type { ThemeName, FurnitureItem, FurnitureType } from './types'
import { GRID_W, GRID_H } from './constants'
import { useEscritorioEngine } from './useEscritorioEngine'

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  agents:         IaAgent[]
  tarefasCounts:  Record<string, number>
  onSelectAgent:  (a: IaAgent) => void
  onChat:         (a: IaAgent) => void
  selectedId?:    string
  initialTheme?:  ThemeName
}

// ─── Layout & Inventory options ───────────────────────────────────────────────
const LAYOUTS: { key: ThemeName; label: string; emoji: string }[] = [
  { key: 'retro',        label: 'Retrô',        emoji: '🪵' },
  { key: 'moderno',      label: 'Moderno',      emoji: '🏢' },
  { key: 'profissional', label: 'Profissional', emoji: '⬛' },
]

const INVENTORY: { type: FurnitureType; emoji: string; label: string }[] = [
  { type: 'plant',        emoji: '🪴', label: 'Vaso'       },
  { type: 'lamp',         emoji: '💡', label: 'Luminária'  },
  { type: 'rug',          emoji: '🟫', label: 'Tapete'     },
  { type: 'bookshelf',    emoji: '📚', label: 'Estante'    },
  { type: 'coffee',       emoji: '☕', label: 'Café'       },
  { type: 'sofa',         emoji: '🛋️', label: 'Sofá'       },
  { type: 'meetingTable', emoji: '🪑', label: 'Reunião'    },
  { type: 'trash',        emoji: '🗑️', label: 'Lixeira'    },
  { type: 'cabinet',      emoji: '🗄️', label: 'Armário'    },
  { type: 'printer',      emoji: '🖨️', label: 'Impressora' },
  { type: 'wallArt',      emoji: '🖼️', label: 'Quadro'     },
  { type: 'desk',         emoji: '🖥️', label: 'Mesa'       },
  { type: 'chair',        emoji: '🪑', label: 'Cadeira'    },
  { type: 'monitor',      emoji: '💻', label: 'Monitor'    },
]

// ─── Default furniture layout (4 columns × 4 rows of workstations) ────────────
function generateDefaultFurniture(): FurnitureItem[] {
  const items: FurnitureItem[] = []
  let n = 0
  const id = () => `def_${n++}`

  // Desk columns starting positions (desk is 2 tiles wide)
  const deskCols = [2, 7, 12, 17]
  const deskRows = [2, 6, 10, 14]

  for (const row of deskRows) {
    for (const col of deskCols) {
      if (col + 1 >= GRID_W - 1 || row + 1 >= GRID_H - 1) continue
      items.push({ id: id(), type: 'desk',  tileX: col,     tileY: row,     rotation: 0 })
      items.push({ id: id(), type: 'chair', tileX: col + 1, tileY: row + 1, rotation: 0 })
    }
  }

  // Meeting area (bottom-right)
  if (GRID_W > 20 && GRID_H > 16) {
    items.push({ id: id(), type: 'meetingTable', tileX: 16, tileY: 12, rotation: 0 })
    items.push({ id: id(), type: 'sofa',         tileX: 17, tileY: 15, rotation: 0 })
  }

  // Corner decorations
  items.push({ id: id(), type: 'plant',     tileX: 1,         tileY: 1,         rotation: 0 })
  items.push({ id: id(), type: 'plant',     tileX: GRID_W - 3, tileY: 1,        rotation: 0 })
  items.push({ id: id(), type: 'bookshelf', tileX: GRID_W - 3, tileY: 4,        rotation: 0 })
  items.push({ id: id(), type: 'coffee',    tileX: GRID_W - 3, tileY: 7,        rotation: 0 })
  items.push({ id: id(), type: 'lamp',      tileX: GRID_W - 3, tileY: 9,        rotation: 0 })
  items.push({ id: id(), type: 'plant',     tileX: 1,         tileY: GRID_H - 3, rotation: 0 })

  return items
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EscritorioView({
  agents, tarefasCounts, onSelectAgent, onChat, initialTheme,
}: Props) {
  const { companyId } = useAuth()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lsKey     = `${companyId ?? 'zita'}_escritorio`

  const [theme, setTheme] = useState<ThemeName>(() =>
    initialTheme ?? (localStorage.getItem(`${lsKey}_theme`) as ThemeName | null) ?? 'retro'
  )
  const [bgLight, setBgLight] = useState(() =>
    localStorage.getItem(`${lsKey}_bglight`) === 'true'
  )
  const [furniture, setFurniture] = useState<FurnitureItem[]>(() => {
    try {
      const s = localStorage.getItem(`${lsKey}_furniture`)
      if (s) return JSON.parse(s) as FurnitureItem[]
    } catch { /* ignore */ }
    return generateDefaultFurniture()
  })
  const [placingType,   setPlacingType]   = useState<FurnitureType | null>(null)
  const [showInventory, setShowInventory] = useState(false)

  // ESC to cancel placement
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacingType(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Persist settings
  useEffect(() => { localStorage.setItem(`${lsKey}_theme`,     theme)           }, [theme, lsKey])
  useEffect(() => { localStorage.setItem(`${lsKey}_bglight`,   String(bgLight)) }, [bgLight, lsKey])
  useEffect(() => { localStorage.setItem(`${lsKey}_furniture`, JSON.stringify(furniture)) }, [furniture, lsKey])

  const handlePlaceFurniture = useCallback((item: FurnitureItem) => {
    setFurniture(prev => [...prev, item])
    // Keep placingType active so user can place multiple items of the same type
  }, [])

  const handleRemoveFurniture = useCallback((id: string) => {
    setFurniture(prev => prev.filter(f => f.id !== id))
  }, [])

  const { handleMouseDown, handleMouseMove, handleMouseUp, handleWheel } =
    useEscritorioEngine({
      canvasRef, agents, tarefasCounts, theme, bgLight, furniture,
      placingType,
      onSelectAgent, onChat,
      onPlaceFurniture:   handlePlaceFurniture,
      onRemoveFurniture:  handleRemoveFurniture,
    })

  const cursor = placingType ? 'crosshair' : 'grab'

  return (
    <div className="relative flex flex-col w-full flex-1 overflow-hidden bg-gray-950">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 flex-shrink-0 z-10 gap-2">
        {/* Layout selector */}
        <div className="flex items-center gap-1">
          {LAYOUTS.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                theme === key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5">
          {placingType && (
            <span className="text-xs text-yellow-400 mr-1">
              Clicando: {INVENTORY.find(i => i.type === placingType)?.emoji} {INVENTORY.find(i => i.type === placingType)?.label}
            </span>
          )}
          <button
            onClick={() => setBgLight(v => !v)}
            className="px-2.5 py-1 text-xs rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
          >
            {bgLight ? '🌙 Escuro' : '☀ Claro'}
          </button>
          <button
            onClick={() => { setShowInventory(v => !v); setPlacingType(null) }}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              showInventory
                ? 'bg-brand-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            🛍️ Itens
          </button>
          {placingType && (
            <button
              onClick={() => setPlacingType(null)}
              className="px-2 py-1 text-xs rounded-md bg-red-800 text-red-200 hover:bg-red-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Main area: canvas + inventory panel ────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="flex-1 min-w-0"
          style={{ cursor, imageRendering: 'pixelated' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
        />

        {/* Inventory panel */}
        {showInventory && (
          <div className="w-52 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800">
              <p className="text-xs font-semibold text-gray-300">DECORAÇÕES</p>
              <p className="text-xs text-gray-600 mt-0.5">Selecione · clique no mapa</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-2 gap-1.5">
                {INVENTORY.map(({ type, emoji, label }) => (
                  <button
                    key={type}
                    onClick={() => setPlacingType(p => p === type ? null : type)}
                    className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs transition-all ${
                      placingType === type
                        ? 'bg-brand-700 text-white ring-1 ring-brand-400'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <span className="text-lg leading-none">{emoji}</span>
                    <span className="leading-none mt-1">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-gray-800">
              <button
                onClick={() => { setFurniture(generateDefaultFurniture()); setPlacingType(null) }}
                className="w-full px-2 py-1.5 text-xs text-gray-500 hover:text-amber-400 hover:bg-gray-800 rounded-md transition-all"
              >
                ↺ Resetar layout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Placement hint bar */}
      {placingType && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gray-950/90 backdrop-blur border border-gray-700 rounded-full text-xs text-gray-300 pointer-events-none select-none">
          Clique no mapa para colocar &middot; Botão direito para remover &middot; ESC para cancelar
        </div>
      )}
    </div>
  )
}
