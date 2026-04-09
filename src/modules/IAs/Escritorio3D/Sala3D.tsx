import * as THREE from 'three'

interface Props {
  position: [number, number, number]
  size: [number, number]  // [width, depth]
  color: string
  nome: string
}

export default function Sala3D({ position, size, color }: Props) {
  const [w, d] = size
  const wallH = 2.4
  const wallThick = 0.08
  const colorObj = new THREE.Color(color)

  return (
    <group position={position}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={colorObj} opacity={0.12} transparent roughness={0.9} />
      </mesh>

      {/* Floor border glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[Math.min(w, d) / 2 - 0.1, Math.min(w, d) / 2, 64]} />
        <meshStandardMaterial color={colorObj} emissive={colorObj} emissiveIntensity={0.3} transparent opacity={0.4} />
      </mesh>

      {/* Walls — transparent */}
      {/* North wall */}
      <mesh position={[0, wallH / 2, -d / 2]}>
        <boxGeometry args={[w, wallH, wallThick]} />
        <meshStandardMaterial color={colorObj} opacity={0.08} transparent />
      </mesh>
      {/* South wall */}
      <mesh position={[0, wallH / 2, d / 2]}>
        <boxGeometry args={[w, wallH, wallThick]} />
        <meshStandardMaterial color={colorObj} opacity={0.08} transparent />
      </mesh>
      {/* West wall */}
      <mesh position={[-w / 2, wallH / 2, 0]}>
        <boxGeometry args={[wallThick, wallH, d]} />
        <meshStandardMaterial color={colorObj} opacity={0.08} transparent />
      </mesh>
      {/* East wall */}
      <mesh position={[w / 2, wallH / 2, 0]}>
        <boxGeometry args={[wallThick, wallH, d]} />
        <meshStandardMaterial color={colorObj} opacity={0.08} transparent />
      </mesh>

      {/* Corner pillars */}
      {([[-w/2, -d/2], [w/2, -d/2], [-w/2, d/2], [w/2, d/2]] as [number, number][]).map(([px, pz], i) => (
        <mesh key={i} position={[px, wallH / 2, pz]}>
          <boxGeometry args={[0.12, wallH, 0.12]} />
          <meshStandardMaterial color={colorObj} emissive={colorObj} emissiveIntensity={0.2} />
        </mesh>
      ))}
    </group>
  )
}
