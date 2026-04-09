import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { IaAgent } from '../../../types'

const STATUS_COLOR: Record<string, string> = {
  online:    '#22c55e',
  ocupada:   '#eab308',
  aguardando:'#3b82f6',
  offline:   '#6b7280',
  erro:      '#ef4444',
  pausada:   '#f97316',
}

interface Props {
  agent: IaAgent
  position: [number, number, number]
  onClick: () => void
}

export default function Personagem3D({ agent, position, onClick }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const [hovered, setHovered] = useState(false)
  const isZeus = agent.tipo === 'zeus'
  const color = agent.cor_hex || '#4e5eff'
  const statusColor = STATUS_COLOR[agent.status] ?? '#6b7280'

  // Gentle floating animation
  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.5 + position[0]) * 0.04
    if (lightRef.current) {
      lightRef.current.intensity = hovered ? 1.5 : (agent.status === 'online' || agent.status === 'ocupada') ? 0.8 : 0.2
    }
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      scale={hovered ? 1.08 : 1}
    >
      {/* Status glow light */}
      <pointLight ref={lightRef} color={statusColor} intensity={0.5} distance={3} position={[0, 1.8, 0]} />

      {/* Body — capsule approximation */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.9, 12]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[isZeus ? 0.38 : 0.32, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.3} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.1, 1.42, 0.29]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.1, 1.42, 0.29]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
      </mesh>

      {/* Status sphere above head */}
      <mesh position={[0, isZeus ? 2.1 : 1.9, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.2} />
      </mesh>

      {/* Zeus crown */}
      {isZeus && (
        <mesh position={[0, 1.75, 0]}>
          <cylinderGeometry args={[0.3, 0.22, 0.2, 6, 1, true]} />
          <meshStandardMaterial color="#eab308" emissive="#d97706" emissiveIntensity={0.6} metalness={0.8} roughness={0.2} />
        </mesh>
      )}

      {/* Name label — only on hover */}
      {hovered && (
        <Html position={[0, 2.4, 0]} center distanceFactor={8}>
          <div className="bg-gray-900/90 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap pointer-events-none">
            {agent.nome}
            {agent.funcao && <span className="text-gray-400 ml-1">· {agent.funcao}</span>}
          </div>
        </Html>
      )}
    </group>
  )
}
