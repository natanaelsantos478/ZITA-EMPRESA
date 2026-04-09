/**
 * Office3DView.tsx
 * React wrapper for the Three.js 3D office environment.
 * Renders agents as seated humanoid avatars in a first-person office.
 * Click avatar → select agent. WASD to move. Mouse to look (pointer lock).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { IaAgent } from '../../../types'
import { buildOfficeScene } from '../../../lib/three-office/OfficeScene'
import { AgentManager } from '../../../lib/three-office/AgentManager'
import { FPSControls } from '../../../lib/three-office/FPSControls'

interface Props {
  agents: IaAgent[]
  tarefasCounts: Record<string, number>
  onSelectAgent: (a: IaAgent) => void
  onChat: (a: IaAgent) => void
}

export default function Office3DView({ agents, onSelectAgent }: Props) {
  const mountRef    = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<FPSControls | null>(null)
  const managerRef  = useRef<AgentManager | null>(null)
  const sceneRef    = useRef<THREE.Scene | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const rafRef      = useRef<number>(0)
  const [locked, setLocked] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  // ── Init Three.js ────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1c22)
    scene.fog = new THREE.Fog(0x1a1c22, 20, 60)
    sceneRef.current = scene

    // Camera (start inside the office, looking toward desks)
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 300)
    camera.position.set(0, 1.7, 2)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Build office
    buildOfficeScene(scene)

    // Agent manager
    const manager = new AgentManager(scene)
    manager.sync(agents)
    managerRef.current = manager

    // Controls
    const controls = new FPSControls(camera, renderer.domElement)
    controlsRef.current = controls

    // Pointer lock state for UI overlay
    const onLockChange = () => setLocked(document.pointerLockElement === renderer.domElement)
    document.addEventListener('pointerlockchange', onLockChange)

    // Raycaster for hover/click
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

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!mount) return
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    // Animation loop
    let lastTime = performance.now()
    let elapsed  = 0
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      const now = performance.now()
      const dt  = Math.min((now - lastTime) / 1000, 0.05)
      lastTime  = now
      elapsed  += dt

      controls.update(dt)
      manager.update(dt, elapsed)

      // Hover detection each frame (crosshair raycast)
      raycaster.setFromCamera(center, camera)
      const hoverId = manager.raycast(raycaster)
      setHovered(hoverId)

      renderer.render(scene, camera)

      // Update HTML overlays after render (camera matrices are current)
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
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  // ── Sync agents when list changes ────────────────────────────────────────
  useEffect(() => {
    managerRef.current?.sync(agents)
  }, [agents])

  const handleExit = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock()
  }, [])

  const hoveredAgent = hovered ? agents.find(a => a.id === hovered) : null

  return (
    <div className="relative w-full h-full bg-gray-950">
      {/* Three.js canvas mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-5 h-5">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/60" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/60" />
        </div>
      </div>

      {/* Click-to-start overlay (shown when not locked) */}
      {!locked && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          onClick={() => rendererRef.current?.domElement.requestPointerLock()}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">🏢</div>
            <p className="text-white text-lg font-semibold mb-2">Escritório 3D</p>
            <p className="text-gray-400 text-sm mb-6">Clique para entrar</p>
            <div className="inline-flex flex-col gap-1.5 text-xs text-gray-500 bg-gray-900/80 border border-gray-700 rounded-xl px-5 py-3 text-left">
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">WASD</kbd> mover</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Mouse</kbd> olhar</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Shift</kbd> correr</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Clique</kbd> selecionar IA</span>
              <span><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">ESC</kbd> sair</span>
            </div>
          </div>
        </div>
      )}

      {/* ESC hint (when locked) */}
      {locked && (
        <button
          onClick={handleExit}
          className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg transition-colors border border-white/10"
        >
          <kbd className="bg-gray-800 px-1.5 py-0.5 rounded">ESC</kbd> sair do 3D
        </button>
      )}

      {/* Agent count badge */}
      {locked && (
        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 text-white text-xs rounded-lg border border-white/10">
          🏢 {agents.length} agente{agents.length !== 1 ? 's' : ''} no escritório
        </div>
      )}

      {/* Hovered agent tooltip */}
      {locked && hoveredAgent && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 border border-white/10 rounded-xl text-center">
          <p className="text-white text-sm font-medium">{hoveredAgent.nome}</p>
          {hoveredAgent.funcao && <p className="text-gray-400 text-xs">{hoveredAgent.funcao}</p>}
          <p className="text-xs text-gray-600 mt-1">Clique para selecionar</p>
        </div>
      )}
    </div>
  )
}
