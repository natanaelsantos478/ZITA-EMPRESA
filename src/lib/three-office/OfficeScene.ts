/**
 * OfficeScene.ts — faithful TypeScript port of ai-office/js/office.js
 * Rich dark office: parquet floor, carpet, LED strips, thick walls, 6 windows,
 * 4 desk clusters (18 desks), 8 plants, reception counter.
 */
import * as THREE from 'three'

// ─── Layout constants ─────────────────────────────────────────────────────
const ROOM_W = 32
const ROOM_D = 28
const ROOM_H = 4.5
const WALL_T = 0.3

// Color palette (dark corporate theme)
const COL = {
  floor:       0x2e2a24,
  floorLine:   0x3a342c,
  wall:        0x252832,
  ceiling:     0x1e2028,
  desk:        0x1a1e2a,
  deskTop:     0x2c3044,
  chair:       0x151820,
  chairSeat:   0x222536,
  windowFrame: 0x303550,
  windowGlass: 0x2a3a5a,
  windowLight: 0x8ab4ff,
  carpet:      0x1e2a3a,
  plant:       0x2a5c2a,
  plantPot:    0x5c3a2a,
  monitor:     0x0d0f14,
  monitorGlow: 0x2244aa,
  lamp:        0x404060,
  lampGlow:    0xfff5c0,
}

function lmat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color })
}

function emat(color: number, emissive: number, intensity = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity })
}

function box(
  w: number, h: number, d: number,
  material: THREE.Material,
  castShadow = false,
  receiveShadow = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.castShadow    = castShadow
  mesh.receiveShadow = receiveShadow
  return mesh
}

// ─── Desk positions (computed once at module init) ────────────────────────

function _computeDeskPositions(): Array<{ x: number; z: number; ry: number }> {
  const positions: Array<{ x: number; z: number; ry: number }> = []
  const clusters = [
    { cx: -8, cz: -7 },
    { cx:  8, cz: -7 },
    { cx: -8, cz:  5 },
    { cx:  8, cz:  5 },
  ]
  const offsets = [
    { dx: -2.2, dz: -1.4, ry: 0 },
    { dx:  2.2, dz: -1.4, ry: Math.PI },
    { dx: -2.2, dz:  1.4, ry: 0 },
    { dx:  2.2, dz:  1.4, ry: Math.PI },
  ]
  clusters.forEach(({ cx, cz }) => {
    offsets.forEach(({ dx, dz, ry }) => {
      positions.push({ x: cx + dx, z: cz + dz, ry })
    })
  })
  positions.push({ x: 0, z: -10, ry: 0 })
  positions.push({ x: 0, z:  8,  ry: 0 })
  return positions
}

export const DESK_POSITIONS = _computeDeskPositions()

// ─── Main builder ─────────────────────────────────────────────────────────

export function buildOfficeScene(scene: THREE.Scene): void {

  // ── Lighting ─────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  scene.add(new THREE.HemisphereLight(0x1a2040, 0x0a0c14, 0.5))

  // ── Floor ─────────────────────────────────────────────────────────────────
  const floor = box(ROOM_W, 0.2, ROOM_D, lmat(COL.floor), false, true)
  floor.position.set(0, -0.1, 0)
  scene.add(floor)

  const gridHelper = new THREE.GridHelper(ROOM_W, 16, COL.floorLine, COL.floorLine)
  gridHelper.position.y = 0.01
  const gridMat = gridHelper.material as THREE.LineBasicMaterial
  gridMat.opacity = 0.18
  gridMat.transparent = true
  scene.add(gridHelper)

  // Central carpet
  const carpet = box(4, 0.02, ROOM_D - 2, lmat(COL.carpet))
  carpet.position.set(0, 0.01, 0)
  scene.add(carpet)

  // ── Ceiling ────────────────────────────────────────────────────────────────
  const ceiling = box(ROOM_W, 0.2, ROOM_D, lmat(COL.ceiling))
  ceiling.position.set(0, ROOM_H, 0)
  scene.add(ceiling)

  // LED ceiling strips + point lights
  const ledMat = emat(COL.lamp, COL.lampGlow, 0.8)
  ;[-8, 0, 8].forEach(xOff => {
    const led = box(0.15, 0.08, ROOM_D - 4, ledMat)
    led.position.set(xOff, ROOM_H - 0.12, 0)
    scene.add(led)

    const ptLight = new THREE.PointLight(COL.lampGlow, 0.9, 20, 1.5)
    ptLight.position.set(xOff, ROOM_H - 0.2, 0)
    scene.add(ptLight)
  })

  // ── Walls ──────────────────────────────────────────────────────────────────
  const wallMat = lmat(COL.wall)

  const wallBack = box(ROOM_W, ROOM_H, WALL_T, wallMat, false, true)
  wallBack.position.set(0, ROOM_H / 2, -ROOM_D / 2)
  scene.add(wallBack)

  const wallFront = box(ROOM_W, ROOM_H, WALL_T, wallMat, false, true)
  wallFront.position.set(0, ROOM_H / 2, ROOM_D / 2)
  scene.add(wallFront)

  const wallLeft = box(WALL_T, ROOM_H, ROOM_D, wallMat, false, true)
  wallLeft.position.set(-ROOM_W / 2, ROOM_H / 2, 0)
  scene.add(wallLeft)

  const wallRight = box(WALL_T, ROOM_H, ROOM_D, wallMat, false, true)
  wallRight.position.set(ROOM_W / 2, ROOM_H / 2, 0)
  scene.add(wallRight)

  // Baseboards
  const skirtMat = lmat(0x1a1e28)
  const skirts: [number, number, number, number, number, number][] = [
    [ROOM_W, 0.18, WALL_T,  0,                          0.09, -ROOM_D / 2 + WALL_T / 2 + 0.15],
    [ROOM_W, 0.18, WALL_T,  0,                          0.09,  ROOM_D / 2 - WALL_T / 2 - 0.15],
    [WALL_T, 0.18, ROOM_D, -ROOM_W / 2 + WALL_T / 2 + 0.15, 0.09, 0],
    [WALL_T, 0.18, ROOM_D,  ROOM_W / 2 - WALL_T / 2 - 0.15, 0.09, 0],
  ]
  skirts.forEach(([w, h, d, x, y, z]) => {
    const s = box(w, h, d, skirtMat)
    s.position.set(x, y, z)
    scene.add(s)
  })

  // ── Windows ────────────────────────────────────────────────────────────────
  _addWindows(scene)

  // ── Desk clusters ──────────────────────────────────────────────────────────
  _buildDeskClusters(scene)

  // ── Plants ─────────────────────────────────────────────────────────────────
  _addPlants(scene)

  // ── Reception ──────────────────────────────────────────────────────────────
  _addReception(scene)
}

// ─── Windows ─────────────────────────────────────────────────────────────

function _addWindows(scene: THREE.Scene): void {
  const frameMat = lmat(COL.windowFrame)
  const glassMat = new THREE.MeshStandardMaterial({
    color: COL.windowGlass,
    transparent: true,
    opacity: 0.55,
    emissive: COL.windowLight,
    emissiveIntensity: 0.25,
  })

  const windowData = [
    { x: -10, z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x:  -4, z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x:   4, z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x:  10, z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x: -ROOM_W / 2 + 0.16, z: -8, ry: Math.PI / 2 },
    { x: -ROOM_W / 2 + 0.16, z:  2, ry: Math.PI / 2 },
  ]

  windowData.forEach(({ x, z, ry }) => {
    const group = new THREE.Group()

    const frame = box(3.2, 2.4, 0.12, frameMat)
    group.add(frame)

    const glass = box(2.8, 2.0, 0.06, glassMat)
    glass.position.z = 0.04
    group.add(glass)

    const divH = box(2.8, 0.06, 0.08, frameMat)
    divH.position.z = 0.06
    group.add(divH)

    const divV = box(0.06, 2.0, 0.08, frameMat)
    divV.position.z = 0.06
    group.add(divV)

    group.position.set(x, 2.2, z)
    group.rotation.y = ry
    scene.add(group)

    const winLight = new THREE.PointLight(COL.windowLight, 0.6, 8, 2)
    winLight.position.set(x, 2.2, z + (ry === 0 ? 1.5 : 0))
    scene.add(winLight)
  })
}

// ─── Desk clusters ────────────────────────────────────────────────────────

function _buildDeskClusters(scene: THREE.Scene): void {
  const clusters = [
    { cx: -8, cz: -7 },
    { cx:  8, cz: -7 },
    { cx: -8, cz:  5 },
    { cx:  8, cz:  5 },
  ]
  const offsets = [
    { dx: -2.2, dz: -1.4, angle: 0 },
    { dx:  2.2, dz: -1.4, angle: Math.PI },
    { dx: -2.2, dz:  1.4, angle: 0 },
    { dx:  2.2, dz:  1.4, angle: Math.PI },
  ]

  clusters.forEach(({ cx, cz }) => {
    offsets.forEach(({ dx, dz, angle }) => {
      _createDesk(scene, cx + dx, cz + dz, angle)
    })
  })

  ;[{ x: 0, z: -10 }, { x: 0, z: 8 }].forEach(({ x, z }) => {
    _createDesk(scene, x, z, 0)
  })
}

function _createDesk(scene: THREE.Scene, x: number, z: number, angle = 0): void {
  const group = new THREE.Group()

  const top = box(2.4, 0.06, 1.2, lmat(COL.deskTop), true, true)
  top.position.set(0, 0.76, 0)
  group.add(top)

  const legMat = lmat(COL.desk)
  ;[[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]].forEach(([lx, lz]) => {
    const leg = box(0.06, 0.76, 0.06, legMat, false, false)
    leg.position.set(lx, 0.38, lz)
    group.add(leg)
  })

  const panel = box(2.3, 0.4, 0.04, legMat)
  panel.position.set(0, 0.44, -0.58)
  group.add(panel)

  _createMonitor(group, 0, 0.76, -0.28)

  const kb = box(0.6, 0.018, 0.22, lmat(0x1a1e2a))
  kb.position.set(0, 0.78, 0.16)
  group.add(kb)

  const mouse = box(0.09, 0.018, 0.13, lmat(0x252836))
  mouse.position.set(0.42, 0.78, 0.18)
  group.add(mouse)

  _createMug(group, -0.9, 0.76)
  _createChair(group, 0, 0, 0.78)

  group.position.set(x, 0, z)
  group.rotation.y = angle
  scene.add(group)
}

function _createMonitor(parent: THREE.Object3D, x: number, baseY: number, z: number): void {
  const screenMat = emat(COL.monitor, COL.monitorGlow, 0.5)
  const frameMat  = lmat(0x151820)

  const body = box(0.8, 0.52, 0.04, frameMat, true, false)
  body.position.set(x, baseY + 0.54, z)
  parent.add(body)

  const screen = box(0.72, 0.44, 0.02, screenMat, false, false)
  screen.position.set(x, baseY + 0.54, z + 0.02)
  parent.add(screen)

  const stand = box(0.06, 0.18, 0.06, frameMat)
  stand.position.set(x, baseY + 0.09, z)
  parent.add(stand)

  const base = box(0.26, 0.018, 0.18, frameMat)
  base.position.set(x, baseY + 0.009, z)
  parent.add(base)
}

function _createMug(parent: THREE.Object3D, x: number, baseY: number): void {
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.09, 8),
    lmat(0x3a3050)
  )
  mug.position.set(x, baseY + 0.045, 0.28)
  mug.castShadow = true
  parent.add(mug)
}

function _createChair(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const seatMat = lmat(COL.chairSeat)
  const legMat  = lmat(COL.chair)

  const seat = box(0.6, 0.06, 0.6, seatMat, true, true)
  seat.position.set(x, y + 0.48, z)
  parent.add(seat)

  const back = box(0.58, 0.52, 0.06, seatMat, true, false)
  back.position.set(x, y + 0.78, z - 0.27)
  parent.add(back)

  const pole = box(0.06, 0.48, 0.06, legMat)
  pole.position.set(x, y + 0.24, z)
  parent.add(pole)

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const lx = Math.cos(a) * 0.28
    const lz = Math.sin(a) * 0.28
    const legPiece = box(0.04, 0.06, 0.32, legMat)
    legPiece.position.set(x + lx, y + 0.03, z + lz)
    legPiece.rotation.y = -a
    parent.add(legPiece)
  }
}

// ─── Plants ───────────────────────────────────────────────────────────────

function _addPlants(scene: THREE.Scene): void {
  const plantPositions: [number, number][] = [
    [-14, -12], [14, -12],
    [-14,  10], [14,  10],
    [-14,  -1], [14,  -1],
    [  0, -12], [  0,  10],
  ]

  plantPositions.forEach(([px, pz]) => {
    const group = new THREE.Group()

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.17, 0.28, 8),
      lmat(COL.plantPot)
    )
    pot.position.y = 0.14
    pot.castShadow = true
    group.add(pot)

    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.03, 8),
      lmat(0x2a1a0a)
    )
    soil.position.y = 0.27
    group.add(soil)

    const leafMat = lmat(COL.plant)
    const leafOffsets: [number, number, number][] = [
      [0, 0.62, 0], [-0.18, 0.52, 0], [0.18, 0.52, 0],
      [0, 0.52, -0.15], [0, 0.52, 0.15],
    ]
    leafOffsets.forEach(([lx, ly, lz]) => {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.16 + Math.random() * 0.08, 6, 6),
        leafMat
      )
      leaf.position.set(lx, ly, lz)
      leaf.castShadow = true
      group.add(leaf)
    })

    group.position.set(px, 0, pz)
    scene.add(group)
  })
}

// ─── Reception ────────────────────────────────────────────────────────────

function _addReception(scene: THREE.Scene): void {
  const counterMat = lmat(0x1e2238)
  const topMat     = lmat(0x2a2e42)

  const counter = box(4.0, 1.0, 0.8, counterMat, true, true)
  counter.position.set(0, 0.5, 11.5)
  scene.add(counter)

  const counterTop = box(4.0, 0.06, 0.8, topMat)
  counterTop.position.set(0, 1.03, 11.5)
  scene.add(counterTop)

  // Emissive logo disk
  const logoDisk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16),
    emat(0x1a2a4a, 0x4a9eff, 0.9)
  )
  logoDisk.position.set(0, 1.06, 11.5)
  scene.add(logoDisk)

  // Reception chairs (added directly to scene)
  _createChair(scene, -0.8, 0, 10.8)
  _createChair(scene,  0.8, 0, 10.8)

  // Reception monitor
  const monGroup = new THREE.Group()
  _createMonitor(monGroup, 0, 1.03, -0.1)
  monGroup.position.set(-0.4, 0, 11.5)
  scene.add(monGroup)
}
