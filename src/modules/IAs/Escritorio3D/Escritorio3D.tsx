import { Suspense, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text, Grid, Environment, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useAgentStatus } from '../../../hooks/useAgentStatus'
import type { IaAgent } from '../../../types'
import Personagem3D from './Personagem3D'
import Sala3D from './Sala3D'
import ControleIAPanel from '../ControleIA/ControleIAPanel'
import ChatIA from '../Chat/ChatIA'

// ─── WASD Camera Controller ────────────────────────────────────────────────────
const SPEED = 0.08
const SENSITIVITY = 0.002

function WASDCamera() {
  const { camera, gl } = useThree()
  const keys = useRef<Set<string>>(new Set())
  const isLocked = useRef(false)
  const yaw = useRef(0)
  const pitch = useRef(-0.3)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys.current.add(e.code)
      else keys.current.delete(e.code)
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return
      yaw.current -= e.movementX * SENSITIVITY
      pitch.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, pitch.current - e.movementY * SENSITIVITY))
    }
    const onLockChange = () => {
      isLocked.current = document.pointerLockElement === gl.domElement
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [gl])

  useFrame(() => {
    const dir = new THREE.Vector3()
    const right = new THREE.Vector3()

    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    camera.getWorldDirection(dir)
    dir.y = 0; dir.normalize()
    right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()

    if (keys.current.has('KeyW') || keys.current.has('ArrowUp'))    camera.position.addScaledVector(dir, SPEED)
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown'))  camera.position.addScaledVector(dir, -SPEED)
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft'))  camera.position.addScaledVector(right, -SPEED)
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) camera.position.addScaledVector(right, SPEED)
    if (keys.current.has('Space'))     camera.position.y += SPEED
    if (keys.current.has('ShiftLeft')) camera.position.y -= SPEED

    // Bounds
    camera.position.x = Math.max(-30, Math.min(30, camera.position.x))
    camera.position.y = Math.max(0.5, Math.min(8, camera.position.y))
    camera.position.z = Math.max(-30, Math.min(30, camera.position.z))
  })

  return null
}

// ─── Floor connection lines ────────────────────────────────────────────────────
function ConnectionLine({ p1, p2, color }: { p1: [number, number, number]; p2: [number, number, number]; color: string }) {
  return (
    <Line
      points={[p1, p2]}
      color={color}
      lineWidth={1.5}
      transparent
      opacity={0.5}
    />
  )
}

// ─── Decorative objects ────────────────────────────────────────────────────────
function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table top */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.06, 0.6]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.5} metalness={0.1} />
      </mesh>
      {/* Monitor */}
      <mesh position={[0, 1.1, -0.2]} castShadow>
        <boxGeometry args={[0.7, 0.4, 0.04]} />
        <meshStandardMaterial color="#111827" emissive="#1e40af" emissiveIntensity={0.3} />
      </mesh>
      {/* Legs */}
      {([-0.5, 0.5] as number[]).map((x) =>
        ([-0.22, 0.22] as number[]).map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.35, z]}>
            <cylinderGeometry args={[0.04, 0.04, 0.7, 6]} />
            <meshStandardMaterial color="#4b5563" metalness={0.6} />
          </mesh>
        ))
      )}
    </group>
  )
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.18, 0.14, 0.4, 8]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.3, 10, 10]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} />
      </mesh>
      <mesh position={[0.15, 0.7, 0.1]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color="#16a34a" roughness={0.7} />
      </mesh>
    </group>
  )
}

// ─── Room definitions ─────────────────────────────────────────────────────────
const SALAS_3D = [
  { id: 'zeus',         nome: 'Sala Principal',    color: '#eab308', position: [-10, 0, -8]  as [number,number,number], size: [10, 10] as [number,number] },
  { id: 'especialistas',nome: 'Sala Especialistas', color: '#4e5eff', position: [4,  0, -8]  as [number,number,number], size: [12, 10] as [number,number] },
  { id: 'escritorio',   nome: 'Escritório Geral',   color: '#22c55e', position: [20, 0, -8]  as [number,number,number], size: [14, 12] as [number,number] },
]

// Get 3D position for an agent based on their room
function agentPosition(agent: IaAgent, idx: number): [number, number, number] {
  const config = agent.integracao_config?.avatar_3d as any
  if (config?.x !== undefined) return [config.x, 0, config.z]

  const salaId = agent.tipo === 'zeus' ? 'zeus'
    : agent.tipo === 'especialista' ? 'especialistas'
    : 'escritorio'
  const sala = SALAS_3D.find((s) => s.id === salaId) ?? SALAS_3D[2]

  const col = idx % 3
  const row = Math.floor(idx / 3)
  return [
    sala.position[0] + (col - 1) * 2.5,
    0,
    sala.position[2] + (row - 1) * 2.5,
  ]
}

// ─── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ onSelectAgent }: { onSelectAgent: (a: IaAgent) => void }) {
  const { agents } = useAgentStatus()

  // Build connection lines
  const connections: Array<{ from: IaAgent; to: IaAgent }> = []
  agents.forEach((a) => {
    if (a.organograma_parent_id) {
      const parent = agents.find((p) => p.id === a.organograma_parent_id)
      if (parent) connections.push({ from: parent, to: a })
    }
  })

  const agentsByZeus = agents.filter((a) => a.tipo === 'zeus')
  const agentsByEsp  = agents.filter((a) => a.tipo === 'especialista')
  const agentsByRest = agents.filter((a) => a.tipo !== 'zeus' && a.tipo !== 'especialista')

  const sortedAgents = [...agentsByZeus, ...agentsByEsp, ...agentsByRest]

  return (
    <>
      {/* Ambient & directional */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 5]} intensity={0.8} castShadow shadow-mapSize={[2048, 2048]} />

      {/* Environment */}
      <Environment preset="city" />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* Grid lines */}
      <Grid
        position={[0, 0, 0]}
        args={[80, 80]}
        cellSize={2}
        cellThickness={0.3}
        cellColor="#1e293b"
        sectionSize={10}
        sectionThickness={0.6}
        sectionColor="#334155"
        fadeDistance={60}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Salas */}
      {SALAS_3D.map((sala) => (
        <group key={sala.id}>
          <Sala3D position={sala.position} size={sala.size} color={sala.color} nome={sala.nome} />
          {/* Sala label */}
          <Text
            position={[sala.position[0], 0.02, sala.position[2] + sala.size[1] / 2 + 0.5]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.4}
            color={sala.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {sala.nome}
          </Text>
        </group>
      ))}

      {/* Decorative objects */}
      <Desk position={[-11, 0, -9]} />
      <Desk position={[-9, 0, -9]} />
      <Desk position={[3, 0, -9]} />
      <Desk position={[6, 0, -9]} />
      <Desk position={[18, 0, -9]} />
      <Desk position={[21, 0, -9]} />
      <Plant position={[-14, 0, -12]} />
      <Plant position={[2, 0, -12]} />
      <Plant position={[27, 0, -13]} />

      {/* Connection lines on floor */}
      {connections.map(({ from, to }, i) => {
        const fromIdx = sortedAgents.indexOf(from)
        const toIdx = sortedAgents.indexOf(to)
        const fp = agentPosition(from, fromIdx)
        const tp = agentPosition(to, toIdx)
        return (
          <ConnectionLine
            key={i}
            p1={[fp[0], 0.02, fp[2]]}
            p2={[tp[0], 0.02, tp[2]]}
            color={from.cor_hex ?? '#4e5eff'}
          />
        )
      })}

      {/* Characters */}
      {sortedAgents.map((agent, idx) => (
        <Personagem3D
          key={agent.id}
          agent={agent}
          position={agentPosition(agent, idx)}
          onClick={() => onSelectAgent(agent)}
        />
      ))}
    </>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────
export default function Escritorio3D() {
  const [selectedAgent, setSelectedAgent] = useState<IaAgent | null>(null)
  const [chatAgent, setChatAgent] = useState<IaAgent | null>(null)
  const [locked, setLocked] = useState(false)

  return (
    <div className="relative w-full h-full bg-gray-950">
      {/* Instructions overlay */}
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-gray-900/90 border border-gray-700 rounded-2xl px-6 py-4 text-center shadow-2xl">
            <p className="text-white font-semibold mb-1">Modo 3D — POV</p>
            <p className="text-gray-400 text-sm">Clique na cena para ativar os controles</p>
            <p className="text-gray-500 text-xs mt-2">WASD / setas para mover · Mouse para olhar · ESC para sair</p>
          </div>
        </div>
      )}

      {/* ESC hint */}
      {locked && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-gray-900/70 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 pointer-events-none">
          ESC para desbloquear · WASD para mover · clique em personagem para abrir painel
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [0, 2, 12], fov: 70 }}
        onPointerDown={(e) => {
          const el = e.nativeEvent.target as HTMLElement
          if (document.pointerLockElement !== el) {
            el.requestPointerLock?.()
            setLocked(true)
          }
        }}
        onCreated={({ gl }) => {
          document.addEventListener('pointerlockchange', () => {
            setLocked(document.pointerLockElement === gl.domElement)
          })
        }}
      >
        <Suspense fallback={null}>
          <WASDCamera />
          <Scene onSelectAgent={(a) => { setSelectedAgent(a) }} />
        </Suspense>
      </Canvas>

      {/* Selected agent panel */}
      {selectedAgent && (
        <ControleIAPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => setChatAgent(selectedAgent)}
        />
      )}
      {chatAgent && <ChatIA agent={chatAgent} onClose={() => setChatAgent(null)} />}
    </div>
  )
}
