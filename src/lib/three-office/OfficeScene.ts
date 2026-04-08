/**
 * OfficeScene.ts — ported from ai-office/js/office.js
 * Builds the 3D office room: floor, ceiling, walls, desks, chairs, windows, ambient lighting.
 */
import * as THREE from 'three'

export const DESK_POSITIONS: Array<{ x: number; z: number; ry: number }> = [
  { x: -6, z: -4, ry: 0 },
  { x: -3, z: -4, ry: 0 },
  { x:  0, z: -4, ry: 0 },
  { x:  3, z: -4, ry: 0 },
  { x:  6, z: -4, ry: 0 },
  { x: -6, z:  2, ry: Math.PI },
  { x: -3, z:  2, ry: Math.PI },
  { x:  0, z:  2, ry: Math.PI },
  { x:  3, z:  2, ry: Math.PI },
  { x:  6, z:  2, ry: Math.PI },
]

export function buildOfficeScene(scene: THREE.Scene): void {
  // ── Lighting ───────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.2)
  sun.position.set(10, 20, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 100
  sun.shadow.camera.left = -20
  sun.shadow.camera.right = 20
  sun.shadow.camera.top = 20
  sun.shadow.camera.bottom = -20
  scene.add(sun)

  ;[
    { x: -8, y: 3, z: -8 },
    { x:  8, y: 3, z: -8 },
    { x: -8, y: 3, z:  6 },
    { x:  8, y: 3, z:  6 },
  ].forEach(pos => {
    const pt = new THREE.PointLight(0xfff5e0, 0.5, 20)
    pt.position.set(pos.x, pos.y, pos.z)
    scene.add(pt)
  })

  // ── Floor ──────────────────────────────────────────────────────────────────
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // ── Ceiling ────────────────────────────────────────────────────────────────
  const ceilingMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e8 })
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), ceilingMat)
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = 4
  scene.add(ceiling)

  // ── Walls ──────────────────────────────────────────────────────────────────
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 })
  const walls = [
    { w: 30, h: 4, pos: [0, 2, -10],  ry: 0 },
    { w: 30, h: 4, pos: [0, 2,  10],  ry: Math.PI },
    { w: 20, h: 4, pos: [-15, 2, 0],  ry: Math.PI / 2 },
    { w: 20, h: 4, pos: [15, 2, 0],   ry: -Math.PI / 2 },
  ]
  walls.forEach(({ w, h, pos, ry }) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat)
    wall.position.set(pos[0], pos[1], pos[2])
    wall.rotation.y = ry
    wall.receiveShadow = true
    scene.add(wall)
  })

  // ── Desks ──────────────────────────────────────────────────────────────────
  const deskMat = new THREE.MeshLambertMaterial({ color: 0x8b6914 })
  const legMat  = new THREE.MeshLambertMaterial({ color: 0x555555 })

  DESK_POSITIONS.forEach(({ x, z }) => {
    const group = new THREE.Group()

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), deskMat)
    top.position.y = 0.76
    top.castShadow = true
    top.receiveShadow = true
    group.add(top)

    const legPositions = [
      [-0.7, 0.4, -0.35], [0.7, 0.4, -0.35],
      [-0.7, 0.4,  0.35], [0.7, 0.4,  0.35],
    ]
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), legMat)
      leg.position.set(lx, ly, lz)
      leg.castShadow = true
      group.add(leg)
    })

    group.position.set(x, 0, z)
    scene.add(group)
  })

  // ── Monitor on each desk ───────────────────────────────────────────────────
  const screenMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a2e, emissive: 0x0d0d1a })
  const frameMat   = new THREE.MeshLambertMaterial({ color: 0x333333 })
  DESK_POSITIONS.forEach(({ x, z, ry }) => {
    const group = new THREE.Group()
    const frame   = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.04), frameMat)
    const screen  = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.34), screenMat)
    const stand   = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.04), frameMat)
    const base    = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12), frameMat)

    frame.position.set(0, 1.2, -0.15)
    screen.position.set(0, 1.2, -0.13)
    stand.position.set(0, 1.0, -0.15)
    base.position.set(0, 0.81, -0.15)

    group.add(frame, screen, stand, base)
    group.position.set(x, 0, z)
    group.rotation.y = ry
    scene.add(group)
  })

  // ── Office plants (corners) ────────────────────────────────────────────────
  const potMat   = new THREE.MeshLambertMaterial({ color: 0x8b6914 })
  const leafMat  = new THREE.MeshLambertMaterial({ color: 0x228b22 })
  ;[[-13, -9], [13, -9], [-13, 9], [13, 9]].forEach(([px, pz]) => {
    const pot  = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 8), potMat)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), leafMat)
    pot.position.set(px, 0.175, pz)
    leaf.position.set(px, 0.85, pz)
    scene.add(pot, leaf)
  })
}
