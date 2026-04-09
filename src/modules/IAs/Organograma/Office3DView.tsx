/**
 * Office3DView.tsx — Three.js FPS office, large 3-zone space
 * Admin: desk placement panel to customise layout
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

// Preset desk layouts for the 3-zone office
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
    label: 'Cabines (individual)',
    desks: [
      ...[-20,-16,-12,-8].flatMap(x => [{ x, z:-7, ry:0 },{ x, z:-4, ry:0 },{ x, z:-1, ry:Math.PI },{ x, z:2, ry:Math.PI }]),
      ...[2,6,10,14,18,22].flatMap(x => [{ x, z:-7, ry:0 },{ x, z:0, ry:Math.PI }]),
    ],
  },
}

export default function Office3DView({ agents, onSelectAgent }: Props) {
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

  // Apply a preset layout
  const applyLayout = useCallback((layoutKey: string) => {
    const layout = LAYOUTS[layoutKey]
    if (!layout) return
    saveDeskPositions(companyId ?? undefined, layout.desks)
    setActiveLayout(layoutKey)
    // Rebuild scene with new desks
    const scene = sceneRef.current
    const manager = managerRef.current
    if (!scene || !manager) return
    // Remove all objects and rebuild
    while (scene.children.length > 0) scene.remove(scene.children[0])
    buildOfficeScene(scene, layout.desks)
    manager.sync(agents)
  }, [companyId, agents])

  // Init Three.js
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x23263a)
    scene.fog = new THREE.Fog(0x1a1c22, 40, 100)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.1, 300)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
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
    renderer.domElement.addEventListener('click', onClick)

    const ro = new ResizeObserver(() => {
      if (!mount) return
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    let lastTime = performance.now()
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      const now = performance.now()
      const dt  = Math.min((now - lastTime) / 1000, 0.05)
      lastTime  = now
      controls.update(dt)
      raycaster.setFromCamera(center, camera)
      setHovered(manager.raycast(raycaster))
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafRef.current)
      controls.dispose()
      manager.dispose()
      ro.disconnect()
      document.removeEventListener('pointerlockchange', onLockChange)
      renderer.domElement.removeEventListener('click', onClick)
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
    <div className="relative w-full h-full bg-gray-950">
      <div ref={mountRef} className="w-full h-full" />

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-5 h-5">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/60" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/60" />
        </div>
      </div>

      {/* Click-to-start */}
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          onClick={() => rendererRef.current?.domElement.requestPointerLock()}>
          <div className="text-center">
            <div className="text-5xl mb-4">🏢</div>
            <p className="text-white text-xl font-semibold mb-1">Escritório 3D</p>
            <p className="text-gray-400 text-sm mb-6">Clique para entrar</p>
            <div className="inline-flex flex-col gap-1.5 text-xs text-gray-500 bg-gray-900/80 border border-gray-700 rounded-xl px-5 py-3 text-left">
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">WASD</kbd> mover</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Shift</kbd> correr</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Mouse</kbd> olhar</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Clique</kbd> selecionar IA</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">ESC</kbd> sair</span>
            </div>
          </div>
        </div>
      )}

      {/* HUD when locked */}
      {locked && (
        <>
          <button onClick={handleExit}
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg border border-white/10">
            <kbd className="bg-gray-800 px-1.5 py-0.5 rounded">ESC</kbd> sair
          </button>
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 text-white text-xs rounded-lg border border-white/10">
            🏢 {agents.length} agente{agents.length!==1?'s':''}
          </div>
        </>
      )}

      {/* Hovered agent label */}
      {locked && hoveredAgent && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 border border-white/10 rounded-xl text-center">
          <p className="text-white text-sm font-medium">{hoveredAgent.nome}</p>
          {hoveredAgent.funcao && <p className="text-gray-400 text-xs">{hoveredAgent.funcao}</p>}
          <p className="text-xs text-gray-600 mt-1">Clique para selecionar</p>
        </div>
      )}

      {/* Desk layout panel — admin only, visible when not locked */}
      {isAdmin && !locked && (
        <div className="absolute bottom-4 right-4">
          <button onClick={() => setShowDeskPanel(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-gray-300 hover:text-white hover:border-gray-500 transition-colors shadow-lg">
            🪑 Layout das mesas
          </button>

          {showDeskPanel && (
            <div className="absolute bottom-10 right-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-56 p-3">
              <p className="text-xs font-semibold text-gray-300 mb-2">Layout de mesas</p>
              <div className="flex flex-col gap-1.5">
                {Object.entries(LAYOUTS).map(([key, { label }]) => (
                  <button key={key} onClick={() => { applyLayout(key); setShowDeskPanel(false) }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                      activeLayout === key
                        ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}>
                    {activeLayout === key && <span>✓</span>}
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                As mesas são salvas por empresa no navegador.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
