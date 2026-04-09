/**
 * AgentAvatar.ts — ported from ai-office/js/avatar.js
 * Builds a low-poly seated humanoid for each IA agent.
 */
import * as THREE from 'three'
import type { IaAgent } from '../../types'
import { DESK_POSITIONS } from './OfficeScene'

export interface AvatarInstance {
  group:   THREE.Group
  agentId: string
  label?:  THREE.Sprite
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function makeLabel(name: string, color: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width  = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.fillRect(0, 0, 256, 64)
  ctx.font = 'bold 28px sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.fillText(name.slice(0, 14), 128, 40)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(1.4, 0.35, 1)
  sprite.position.y = 2.4
  return sprite
}

export function buildAvatar(agent: IaAgent, index: number): AvatarInstance {
  const deskPos = DESK_POSITIONS[index % DESK_POSITIONS.length]
  const group = new THREE.Group()

  const agentColor = hexToInt(agent.cor_hex || '#4e5eff')
  const skin  = new THREE.MeshLambertMaterial({ color: 0xffcc99 })
  const shirt = new THREE.MeshLambertMaterial({ color: agentColor })
  const pants = new THREE.MeshLambertMaterial({ color: 0x333366 })
  const hair  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  const shoe  = new THREE.MeshLambertMaterial({ color: 0x111111 })

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.28), shirt)
  torso.position.set(0, 1.0, 0)
  torso.castShadow = true

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skin)
  head.position.set(0, 1.55, 0)
  head.castShadow = true

  // Hair
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), hair)
  hairMesh.position.set(0, 1.65, -0.02)
  hairMesh.scale.set(1, 0.7, 1)

  // Eyes (simple spheres)
  const eyeGeo = new THREE.SphereGeometry(0.03, 4, 4)
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-0.07, 1.56, 0.19)
  eyeR.position.set( 0.07, 1.56, 0.19)

  // Hips (seated)
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.26), pants)
  hips.position.set(0, 0.72, 0)
  hips.castShadow = true

  // Upper legs (horizontal — seated)
  const legGeo = new THREE.BoxGeometry(0.18, 0.18, 0.48)
  const legL = new THREE.Mesh(legGeo, pants)
  const legR = new THREE.Mesh(legGeo, pants)
  legL.position.set(-0.15, 0.66,  0.24)
  legR.position.set( 0.15, 0.66,  0.24)

  // Lower legs (vertical — hanging)
  const lowerGeo = new THREE.BoxGeometry(0.16, 0.38, 0.16)
  const lowerL = new THREE.Mesh(lowerGeo, pants)
  const lowerR = new THREE.Mesh(lowerGeo, pants)
  lowerL.position.set(-0.15, 0.47, 0.48)
  lowerR.position.set( 0.15, 0.47, 0.48)

  // Feet
  const footGeo = new THREE.BoxGeometry(0.14, 0.08, 0.24)
  const footL = new THREE.Mesh(footGeo, shoe)
  const footR = new THREE.Mesh(footGeo, shoe)
  footL.position.set(-0.15, 0.28, 0.54)
  footR.position.set( 0.15, 0.28, 0.54)

  // Arms
  const armGeo = new THREE.BoxGeometry(0.14, 0.44, 0.14)
  const armL = new THREE.Mesh(armGeo, shirt)
  const armR = new THREE.Mesh(armGeo, shirt)
  armL.position.set(-0.32, 1.0,  0)
  armR.position.set( 0.32, 1.0,  0)

  // Hands (resting on desk)
  const handGeo = new THREE.SphereGeometry(0.08, 6, 5)
  const handL = new THREE.Mesh(handGeo, skin)
  const handR = new THREE.Mesh(handGeo, skin)
  handL.position.set(-0.32, 0.78, -0.12)
  handR.position.set( 0.32, 0.78, -0.12)

  group.add(
    torso, head, hairMesh, eyeL, eyeR,
    hips, legL, legR, lowerL, lowerR, footL, footR,
    armL, armR, handL, handR
  )

  // Name label sprite
  const label = makeLabel(agent.nome, agentColor)
  group.add(label)

  // Position at desk
  group.position.set(deskPos.x, 0, deskPos.z + 0.5)
  group.rotation.y = deskPos.ry

  // Status-based emissive on shirt
  const statusColors: Record<string, number> = {
    online: 0x00ff88, ocupada: 0xffcc00,
    offline: 0x444444, erro: 0xff2222,
  }
  const badge = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshLambertMaterial({ color: statusColors[agent.status] ?? 0x444444, emissive: statusColors[agent.status] ?? 0, emissiveIntensity: 0.8 })
  )
  badge.position.set(-0.25, 1.15, 0.15)
  group.add(badge)

  group.traverse(c => { if ((c as THREE.Mesh).isMesh) c.castShadow = true })

  return { group, agentId: agent.id, label }
}
