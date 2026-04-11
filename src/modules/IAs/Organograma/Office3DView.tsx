/**
 * Office3DView.tsx — Game-quality 3D office with animated agents & speech bubbles
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { IaAgent } from '../../../types'
import { buildOfficeScene, loadDeskPositions, saveDeskPositions, type DeskPos } from '../../../lib/three-office/OfficeScene'
import { AgentManager } from '../../../lib/three-office/AgentManager'
import { FPSControls } from '../../../lib/three-office/FPSControls'
import { useAuth } from '../../../contexts/AuthContext'

interface Props {
  agents: IaAgent[]
  tarefasCounts: Record<string, number>
  onSelectAgent: (a: IaAgent) => void
  onChat: (a: IaAgent) => void
}

const LAYOUTS: Record<string, { label: string; desks: DeskPos[] }> = {
  padrao: {
    label: 'Padrão (3 fileiras)',
    desks: [
      ...[-19,-15,-11].flatMap(x => [{ x, z:-6, ry:0 },{ x, z:0, ry:Math.PI }]),
      ...[-5,-1,3].flatMap(x   => [{ x, z:-6, ry:0 },{ x, z:0, ry:Math.PI }]),
      ...[9,13,17,21].flatMap(x=> [{ x, z:-6, ry:0 },{ x, z:0, ry:Math.PI }]),
    ],
  },
  aberto: {
    label: 'Open space',
    desks: [
      ...[-22,-18,-14,-10,-6,-2,2,6,10,14,18,22].flatMap(x =>
        [{ x, z:-5, ry:0 },{ x, z:1, ry:Math.PI }]
      ),
    ],
  },
  cabines: {
    label: 'Cabines',
    desks: [
      ...[-20,-16,-12,-8].flatMap(x => [{ x, z:-7, ry:0 },{ x, z:-4, ry:0 },{ x, z:-1, ry:Math.PI },{ x, z:2, ry:Math.PI }]),
      ...[2,6,10,14,18,22].flatMap(x => [{ x, z:-7, ry:0 },{ x, z:0, ry:Math.PI }]),
    ],
  },
}

const STATUS_COLOR: Record<string, string> = {
  online:     'bg-green-500',
  ocupada:    'bg-yellow-500',
  aguardando: 'bg-blue-500',
  offline:    'bg-gray-600',
  erro:       'bg-red-500',
  pausada:    'bg-orange-500',
}

// Wrap any view to guarantee it fills the container
function ViewSlot({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

export default function Office3DView({ agents, onSelectAgent, onChat }: Props) {
  const { companyId, isAdmin } = useAuth()
  const mountRef    = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<FPSControls | null>(null)
  const managerRef  = useRef<AgentManager | null>(null)
  const sceneRef    = useRef<THREE.Scene | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const rafRef      = useRef<number>(0)

  const [locked,  setLocked]  = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [showDeskPanel, setShowDeskPanel] = useState(false)
  const [activeLayout, setActiveLayout]   = useState<string>('padrao')
  const [showAgentList, setShowAgentList] = useState(false)
  const [isSprinting, setIsSprinting]     = useState(false)

  const applyLayout = useCallback((layoutKey: string) => {
    const layout = LAYOUTS[layoutKey]
    if (!layout) return
    saveDeskPositions(companyId ?? undefined, layout.desks)
    setActiveLayout(layoutKey)
    const scene = sceneRef.current
    const manager = managerRef.current
    if (!scene || !manager) return
    while (scene.children.length > 0) scene.remove(scene.children[0])
    buildOfficeScene(scene, layout.desks)
    manager.sync(agents)
  }, [companyId, agents])

  // Init Three.js
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1e2235)
    scene.fog = new THREE.FogExp2(0x1a1e2e, 0.018)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.1, 200)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const deskPos = loadDeskPositions(companyId ?? undefined)
    buildOfficeScene(scene, deskPos)

    const manager = new AgentManager(scene)
    manager.sync(agents)
    managerRef.current = manager

    const controls = new FPSControls(camera, renderer.domElement)
    controlsRef.current = controls

    const onLockChange = () => setLocked(document.pointerLockElement === renderer.domElement)
    document.addEventListener('pointerlockchange', onLockChange)

    const raycaster = new THREE.Raycaster()
    const center    = new THREE.Vector2(0, 0)

    const onClick = () => {
      if (!controls.isLocked()) return
      raycaster.setFromCamera(center, camera)
      const agentId = manager.raycast(raycaster)
      if (agentId) {
        const agent = agents.find(a => a.id === agentId)
        if (agent) onSelectAgent(agent)
      }
    }
    // Right-click = open chat
    const onContextMenu = (e: MouseEvent) => {
      if (!controls.isLocked()) return
      e.preventDefault()
      raycaster.setFromCamera(center, camera)
      const agentId = manager.raycast(raycaster)
      if (agentId) {
        const agent = agents.find(a => a.id === agentId)
        if (agent) onChat(agent)
      }
    }
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('contextmenu', onContextMenu)

    const ro = new ResizeObserver(() => {
      if (!mount) return
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    let lastTime = performance.now()
    let elapsed  = 0

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      const now = performance.now()
      const dt  = Math.min((now - lastTime) / 1000, 0.05)
      lastTime  = now
      elapsed  += dt

      controls.update(dt)

      // Update avatar animations
      manager.update(dt, elapsed)

      raycaster.setFromCamera(center, camera)
      setHovered(manager.raycast(raycaster))
      setIsSprinting(controls.isSprinting())

      renderer.render(scene, camera)

      // Update HTML overlays AFTER render
      manager.updateHTML(camera, renderer.domElement)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafRef.current)
      controls.dispose()
      manager.dispose()
      ro.disconnect()
      document.removeEventListener('pointerlockchange', onLockChange)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { managerRef.current?.sync(agents) }, [agents])

  const handleExit = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock()
  }, [])

  const hoveredAgent = hovered ? agents.find(a => a.id === hovered) : null

  return (
    <div className="relative w-full h-full bg-gray-950 overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* ── Crosshair ─────────────────────────────────────────────────────── */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-6 h-6">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/50" style={{ transform: 'translateY(-0.5px)' }} />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/50" style={{ transform: 'translateX(-0.5px)' }} />
            <div className="absolute inset-0 m-auto w-2 h-2 rounded-full border border-white/30" />
          </div>
        </div>
      )}

      {/* ── Click-to-start overlay ─────────────────────────────────────────── */}
      {!locked && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-sm cursor-pointer"
          onClick={() => rendererRef.current?.domElement.requestPointerLock()}
        >
          <div className="text-center select-none">
            <div className="text-6xl mb-4 drop-shadow-lg">🏢</div>
            <p className="text-white text-2xl font-bold mb-1 drop-shadow">Escritório 3D</p>
            <p className="text-gray-300 text-sm mb-7">Clique para entrar no escritório</p>
            <div className="inline-grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-400 bg-gray-900/80 border border-gray-700/60 rounded-2xl px-6 py-4 text-left shadow-2xl">
              <span><kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-200 font-mono mr-1">WASD</kbd> Mover</span>
              <span><kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-200 font-mono mr-1">Shift</kbd> Correr</span>
              <span><kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-200 font-mono mr-1">Mouse</kbd> Olhar</span>
              <span><kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-200 font-mono mr-1">Clique</kbd> Selecionar</span>
              <span><kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-200 font-mono mr-1">Dir.</kbd> Chat</span>
              <span><kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-200 font-mono mr-1">ESC</kbd> Sair</span>
            </div>
            {agents.length > 0 && (
              <p className="text-xs text-gray-500 mt-5">
                {agents.length} agente{agents.length !== 1 ? 's' : ''} no escritório
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── HUD when locked ───────────────────────────────────────────────── */}
      {locked && (
        <>
          {/* Top-left info bar */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-md text-white text-xs rounded-xl border border-white/10">
              <span className="text-gray-400">🏢</span>
              <span className="font-semibold">{agents.length} agente{agents.length !== 1 ? 's' : ''}</span>
              {isSprinting && (
                <span className="text-yellow-400 font-bold animate-pulse">⚡ Correndo</span>
              )}
            </div>
          </div>

          {/* Top-right controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={() => setShowAgentList(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-md hover:bg-black/70 text-white text-xs rounded-xl border border-white/10 transition-colors"
            >
              👥 Agentes
            </button>
            <button
              onClick={handleExit}
              className="flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-md hover:bg-black/70 text-white text-xs rounded-xl border border-white/10 transition-colors"
            >
              <kbd className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-300">ESC</kbd>
              Sair
            </button>
          </div>

          {/* Agent list panel */}
          {showAgentList && (
            <div className="absolute top-14 right-4 bg-gray-900/90 backdrop-blur-md border border-gray-700/60 rounded-2xl shadow-2xl w-64 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700/50">
                <p className="text-xs font-semibold text-gray-300">Agentes no escritório</p>
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {agents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { onSelectAgent(a); setShowAgentList(false) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: a.cor_hex || '#4e5eff' }}
                    >
                      {a.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{a.nome}</p>
                      {a.funcao && <p className="text-xs text-gray-500 truncate">{a.funcao}</p>}
                    </div>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[a.status] ?? 'bg-gray-600'}`} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mini instructions */}
          <div className="absolute bottom-4 left-4 text-xs text-gray-600 pointer-events-none">
            <span className="bg-black/40 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/5">
              Clique esq. = selecionar · Dir. = chat
            </span>
          </div>
        </>
      )}

      {/* ── Hovered agent tooltip ─────────────────────────────────────────── */}
      {locked && hoveredAgent && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 px-5 py-3 bg-gray-900/90 backdrop-blur-md border border-white/15 rounded-2xl text-center shadow-2xl pointer-events-none">
          <div className="flex items-center gap-3 justify-center mb-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: hoveredAgent.cor_hex || '#4e5eff' }}
            >
              {hoveredAgent.nome.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-white text-sm font-semibold">{hoveredAgent.nome}</p>
              {hoveredAgent.funcao && <p className="text-gray-400 text-xs">{hoveredAgent.funcao}</p>}
            </div>
          </div>
          <p className="text-xs text-gray-500">Clique para selecionar · Botão direito para chat</p>
        </div>
      )}

      {/* ── Desk layout panel (admin only, when not locked) ───────────────── */}
      {isAdmin && !locked && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={() => setShowDeskPanel(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-900/90 border border-gray-700 rounded-xl text-xs text-gray-300 hover:text-white hover:border-gray-500 transition-colors shadow-lg"
          >
            🪑 Layout das mesas
          </button>

          {showDeskPanel && (
            <div className="absolute bottom-11 right-0 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-56 p-3">
              <p className="text-xs font-semibold text-gray-300 mb-2.5">Layout de mesas</p>
              <div className="flex flex-col gap-1.5">
                {Object.entries(LAYOUTS).map(([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => { applyLayout(key); setShowDeskPanel(false) }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border transition-colors ${
                      activeLayout === key
                        ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {activeLayout === key && <span className="text-brand-400">✓</span>}
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2.5 leading-relaxed">
                Layout salvo por empresa no navegador.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── ViewSlot fallback (keeps layout stable) ───────────────────────── */}
      {false && <ViewSlot><></></ViewSlot>}
    </div>
  )
}
