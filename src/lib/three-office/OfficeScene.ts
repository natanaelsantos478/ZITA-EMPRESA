/**
 * OfficeScene.ts — Large open-plan 3D office, game-quality visuals
 */
import * as THREE from 'three'

export interface DeskPos { x: number; z: number; ry: number }

function defaultDesks(): DeskPos[] {
  const desks: DeskPos[] = []
  for (let col = 0; col < 3; col++) {
    desks.push({ x: -19 + col * 4,  z: -6, ry: 0 })
    desks.push({ x: -19 + col * 4,  z:  0, ry: Math.PI })
  }
  for (let col = 0; col < 3; col++) {
    desks.push({ x: -5 + col * 4,   z: -6, ry: 0 })
    desks.push({ x: -5 + col * 4,   z:  0, ry: Math.PI })
  }
  for (let col = 0; col < 4; col++) {
    desks.push({ x: 9 + col * 4,    z: -6, ry: 0 })
    desks.push({ x: 9 + col * 4,    z:  0, ry: Math.PI })
  }
  return desks
}

export function loadDeskPositions(companyId: string | undefined): DeskPos[] {
  if (!companyId) return defaultDesks()
  try {
    const raw = localStorage.getItem(`${companyId}_3d_desks`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return defaultDesks()
}

export function saveDeskPositions(companyId: string | undefined, desks: DeskPos[]) {
  if (!companyId) return
  localStorage.setItem(`${companyId}_3d_desks`, JSON.stringify(desks))
}

export let DESK_POSITIONS: DeskPos[] = defaultDesks()

// ── Shared material helpers ───────────────────────────────────────────────────
function stdMat(color: number, roughness = 0.7, metalness = 0.0, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness })
  if (emissive) { m.emissive.setHex(emissive); m.emissiveIntensity = emissiveIntensity }
  return m
}

// ── Build a single desk + chair + accessories ────────────────────────────────
function buildDesk(scene: THREE.Scene, x: number, z: number, ry: number, index: number): void {
  const g = new THREE.Group()

  // Desk surface — lighter wood
  const deskColor = index % 2 === 0 ? 0x8B6914 : 0x7A5C1E
  const topMat = stdMat(deskColor, 0.55, 0.05)
  const legMat = stdMat(0x444455, 0.8, 0.5)

  // Surface
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.85), topMat)
  top.position.y = 0.77; top.castShadow = true; top.receiveShadow = true; g.add(top)

  // Edge trim
  const trimMat = stdMat(0x2a1f0f, 0.4, 0.1)
  const trimF = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.04, 0.02), trimMat)
  trimF.position.set(0, 0.77, 0.425); g.add(trimF)
  const trimB = trimF.clone(); trimB.position.z = -0.425; g.add(trimB)

  // Legs
  ;[[-0.72, 0.39, -0.35],[0.72, 0.39, -0.35],[-0.72, 0.39, 0.35],[0.72, 0.39, 0.35]].forEach(([lx,ly,lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.78, 0.055), legMat)
    leg.position.set(lx, ly, lz); leg.castShadow = true; g.add(leg)
  })

  // Monitor base + stand
  const frameMat = stdMat(0x1a1a26, 0.6, 0.7)
  const base  = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.14), frameMat)
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), frameMat)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, 0.04), frameMat)
  base.position.set(0, 0.815, -0.14)
  stand.position.set(0, 0.92, -0.14)
  frame.position.set(0, 1.21, -0.14)
  frame.castShadow = true
  ;[base, stand, frame].forEach(m => g.add(m))

  // Screen glow — unique per desk
  const screenColors = [0x0a2a5c, 0x0a3a2a, 0x2a0a3c, 0x1a2a0a]
  const sc = screenColors[index % screenColors.length]
  const screenMat = stdMat(sc, 0.9, 0.0, sc, 0.8)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.57, 0.36), screenMat)
  screen.position.set(0, 1.21, -0.12)
  g.add(screen)

  // Screen content lines (simulated UI)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.4 })
  for (let i = 0; i < 5; i++) {
    const lineW = 0.1 + Math.random() * 0.3
    const line = new THREE.Mesh(new THREE.PlaneGeometry(lineW, 0.012), lineMat)
    line.position.set(-0.22 + lineW / 2, 1.21 + 0.12 - i * 0.065, -0.115)
    g.add(line)
  }

  // Screen point light
  const screenGlow = new THREE.PointLight(0x4488ff, 0.15, 1.2)
  screenGlow.position.set(0, 1.2, 0); g.add(screenGlow)

  // Keyboard
  const kbMat = stdMat(0x333344, 0.8, 0.3)
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.018, 0.18), kbMat)
  kb.position.set(0, 0.81, 0.15); g.add(kb)
  // Key rows
  const keyMat = stdMat(0x4a4a5a, 0.9, 0.1)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.01, 0.028), keyMat)
      key.position.set(-0.23 + col * 0.042, 0.825, 0.09 + row * 0.036)
      g.add(key)
    }
  }

  // Mouse
  const mouseMat = stdMat(0x222233, 0.7, 0.2)
  const mouse = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.055, 4, 8), mouseMat)
  mouse.rotation.x = Math.PI / 2
  mouse.position.set(0.3, 0.815, 0.15)
  g.add(mouse)

  // Coffee mug
  const mugMat = stdMat(0xcc3333 + (index * 0x223300), 0.8, 0.0)
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.085, 10), mugMat)
  mug.position.set(-0.3, 0.855, 0.1)
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 5, 8, Math.PI), mugMat)
  mugHandle.position.set(-0.262, 0.855, 0.1)
  mugHandle.rotation.z = Math.PI / 2
  g.add(mug, mugHandle)

  // Paper stack
  const paperMat = stdMat(0xf5f0e8, 0.9, 0.0)
  for (let p = 0; p < 4; p++) {
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.002, 0.15), paperMat)
    paper.position.set(-0.55 + Math.random() * 0.05, 0.815 + p * 0.003, 0.0)
    paper.rotation.y = (Math.random() - 0.5) * 0.15
    g.add(paper)
  }

  // ── Chair ──────────────────────────────────────────────────────────────────
  const chairMat = stdMat(0x1a1a2e, 0.8, 0.0)
  const cushionMat = stdMat(0x2a2a4e, 0.9, 0.0)

  // Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.44), cushionMat)
  seat.position.set(0, 0.5, 0.55); seat.castShadow = true; g.add(seat)

  // Backrest
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06), cushionMat)
  back.position.set(0, 0.77, 0.32); back.castShadow = true; g.add(back)

  // Back support
  const backPole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.04), chairMat)
  backPole.position.set(0, 0.38, 0.32); g.add(backPole)

  // Armrests
  ;[[-0.21, 0], [0.21, 0]].forEach(([ax]) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.04), chairMat)
    arm.position.set(ax, 0.38, 0.55); g.add(arm)
    const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), chairMat)
    armRest.position.set(ax, 0.52, 0.55); g.add(armRest)
  })

  // Chair base (5-point star)
  const baseHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), chairMat)
  baseHub.position.set(0, 0.06, 0.55); g.add(baseHub)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.04), chairMat)
    spoke.position.set(Math.cos(angle) * 0.15, 0.05, 0.55 + Math.sin(angle) * 0.15)
    spoke.rotation.y = -angle; g.add(spoke)
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), chairMat)
    wheel.position.set(Math.cos(angle) * 0.28, 0.04, 0.55 + Math.sin(angle) * 0.28)
    g.add(wheel)
  }

  g.position.set(x, 0, z)
  g.rotation.y = ry
  scene.add(g)
}

// ── Build a decorative plant ─────────────────────────────────────────────────
function buildPlant(scene: THREE.Scene, x: number, z: number, scale = 1.0): void {
  const potMat  = stdMat(0x8B6914, 0.8, 0.0)
  const soilMat = stdMat(0x3d2b1f, 0.95, 0.0)
  const leafMat = stdMat(0x228b22, 0.85, 0.0, 0x001100, 0.2)
  const trunkMat= stdMat(0x6b4226, 0.9, 0.0)

  // Pot
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.16 * scale, 0.4 * scale, 10), potMat)
  pot.position.set(x, 0.2 * scale, z)
  pot.castShadow = true; pot.receiveShadow = true; scene.add(pot)

  // Soil
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.21 * scale, 0.21 * scale, 0.02 * scale, 10), soilMat)
  soil.position.set(x, 0.41 * scale, z); scene.add(soil)

  // Trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.5 * scale, 8), trunkMat)
  trunk.position.set(x, 0.7 * scale, z)
  trunk.castShadow = true; scene.add(trunk)

  // Leaves — multiple overlapping spheres for full canopy
  const leafPositions = [
    [0, 1.0, 0, 0.55], [-0.2, 0.9, -0.1, 0.38], [0.2, 0.85, 0.15, 0.35],
    [-0.1, 0.95, 0.2, 0.32], [0.15, 1.05, -0.2, 0.3],
  ]
  leafPositions.forEach(([lx, ly, lz, r]) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 8, 7), leafMat)
    leaf.position.set(x + lx * scale, ly * scale, z + lz * scale)
    leaf.castShadow = true; scene.add(leaf)
  })
}

// ── Build a window frame on the back wall ─────────────────────────────────────
function buildWindow(scene: THREE.Scene, x: number): void {
  const frameMat = stdMat(0x888899, 0.5, 0.5)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88bbff, transparent: true, opacity: 0.25,
    roughness: 0.1, metalness: 0.2, emissive: new THREE.Color(0x223344), emissiveIntensity: 0.3,
  })

  // Outer frame
  const outer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.08), frameMat)
  outer.position.set(x, 2.3, -10.9); scene.add(outer)

  // Glass pane
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), glassMat)
  glass.position.set(x, 2.3, -10.85); scene.add(glass)

  // Cross mullion
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.09), frameMat)
  mullionH.position.set(x, 2.3, -10.9); scene.add(mullionH)
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.09), frameMat)
  mullionV.position.set(x, 2.3, -10.9); scene.add(mullionV)

  // Light shaft coming through window
  const lightShaft = new THREE.SpotLight(0xb8d4ff, 0.6, 18, Math.PI / 8, 0.8)
  lightShaft.position.set(x, 3.8, -9.5)
  lightShaft.target.position.set(x, 0, -5)
  scene.add(lightShaft, lightShaft.target)
}

export function buildOfficeScene(scene: THREE.Scene, deskPositions?: DeskPos[]): void {
  const desks = deskPositions ?? defaultDesks()
  DESK_POSITIONS = desks

  // ── Lighting ──────────────────────────────────────────────────────────────
  // Sky/ground hemisphere
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x282030, 0.5)
  scene.add(hemi)

  // Main directional (sun from window side)
  const sun = new THREE.DirectionalLight(0xfff5e0, 0.9)
  sun.position.set(-5, 10, 8); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -40; sun.shadow.camera.right  = 40
  sun.shadow.camera.top  =  25; sun.shadow.camera.bottom = -15
  sun.shadow.camera.far  = 80; sun.shadow.bias = -0.001
  scene.add(sun)

  // Ceiling panel lights — warm white
  const ceilLightPositions: [number, number, number][] = [
    [-20, 3.9, -3], [-12, 3.9, -3], [-4, 3.9, -3], [4, 3.9, -3],
    [12, 3.9, -3], [20, 3.9, -3],
    [-20, 3.9,  3], [-12, 3.9,  3], [-4, 3.9,  3], [4, 3.9,  3],
    [12, 3.9,  3], [20, 3.9,  3],
  ]
  ceilLightPositions.forEach(([lx, ly, lz]) => {
    const pt = new THREE.PointLight(0xfffae8, 0.35, 12)
    pt.position.set(lx, ly, lz); scene.add(pt)
  })

  // Zone accent lights
  const zoneLights: [number, number, string][] = [
    [-14, -2, '#eab308'], [1, -2, '#4e5eff'], [17, -2, '#22c55e']
  ]
  zoneLights.forEach(([lx, lz, hex]) => {
    const pt = new THREE.PointLight(new THREE.Color(hex).getHex(), 0.2, 8)
    pt.position.set(lx as number, 0.5, lz as number); scene.add(pt)
  })

  // ── Floor — polished tiles ─────────────────────────────────────────────────
  const floorBase = stdMat(0x8b7355, 0.4, 0.3)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(62, 20), floorBase)
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.set(2, 0, -2)
  scene.add(floor)

  // Tile grid
  const tileMats = [
    stdMat(0x726045, 0.35, 0.3),
    stdMat(0x9b8465, 0.35, 0.3),
  ]
  for (let tx = -29; tx < 35; tx += 2) {
    for (let tz = -10; tz < 8; tz += 2) {
      const mat = (Math.abs(tx / 2 + tz / 2)) % 2 === 0 ? tileMats[0] : tileMats[1]
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 1.96), mat)
      tile.rotation.x = -Math.PI / 2; tile.position.set(tx + 1, 0.001, tz + 1)
      tile.receiveShadow = true; scene.add(tile)
    }
  }

  // Zone carpets
  const carpetZones: [number, string, string][] = [
    [-14, '#eab308', 'Sala Principal'],
    [1,   '#4e5eff', 'Especialistas'],
    [17,  '#22c55e', 'Escritório Geral'],
  ]
  carpetZones.forEach(([cx, hex, _label]) => {
    const color = new THREE.Color(hex).multiplyScalar(0.22)
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 })
    )
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(cx as number, 0.002, -3)
    carpet.receiveShadow = true; scene.add(carpet)
  })

  // ── Ceiling ────────────────────────────────────────────────────────────────
  const ceilMat = stdMat(0xe8e4da, 0.9, 0.0)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(62, 20), ceilMat)
  ceil.rotation.x = Math.PI / 2; ceil.position.set(2, 4, -2); scene.add(ceil)

  // Ceiling light fixtures (glowing panels)
  const fixtureMat = stdMat(0xffffff, 0.5, 0.0, 0xfffae8, 0.7)
  ;[-20, -12, -4, 4, 12, 20].forEach(x => {
    const fix = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.38), fixtureMat)
    fix.position.set(x, 3.97, -2); scene.add(fix)
  })

  // ── Walls ─────────────────────────────────────────────────────────────────
  const wallMat = stdMat(0xebe4d8, 0.85, 0.0)
  const wallData: { w: number; h: number; pos: [number, number, number]; ry: number }[] = [
    { w: 62, h: 4, pos: [2, 2, -11], ry: 0 },
    { w: 62, h: 4, pos: [2, 2,   7], ry: Math.PI },
    { w: 20, h: 4, pos: [-29, 2, -2], ry: Math.PI / 2 },
    { w: 20, h: 4, pos: [33, 2, -2],  ry: -Math.PI / 2 },
  ]
  wallData.forEach(({ w, h, pos, ry }) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat)
    wall.position.set(...pos); wall.rotation.y = ry; wall.receiveShadow = true; scene.add(wall)
  })

  // Baseboard trim
  const trimMat = stdMat(0xc8bfb2, 0.7, 0.1)
  ;[-11, 7].forEach(wz => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(62, 0.12, 0.06), trimMat)
    trim.position.set(2, 0.06, wz); scene.add(trim)
  })

  // ── Windows on back wall ───────────────────────────────────────────────────
  ;[-20, -4, 12, 28].forEach(wx => buildWindow(scene, wx))

  // ── Zone dividers (glass partitions) ──────────────────────────────────────
  const partGlass = new THREE.MeshStandardMaterial({ color: 0x8bc4dd, transparent: true, opacity: 0.3, side: THREE.DoubleSide, roughness: 0.1 })
  const partFrame = stdMat(0x777788, 0.5, 0.6)
  ;[-7.5, 7.5].forEach(px => {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2.4), partGlass)
    glass.position.set(px, 1.2, -2); glass.rotation.y = Math.PI / 2; scene.add(glass)
    ;[-9.5, -7, -4.5, -2, 0.5, 3, 5.5].forEach(pz => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.4, 0.07), partFrame)
      post.position.set(px, 1.2, pz); scene.add(post)
    })
    // Top rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 16), partFrame)
    rail.position.set(px, 2.42, -2); scene.add(rail)
  })

  // ── Desks + chairs ────────────────────────────────────────────────────────
  desks.forEach(({ x, z, ry }, idx) => buildDesk(scene, x, z, ry, idx))

  // ── Plants ────────────────────────────────────────────────────────────────
  ;[[-28, -9], [32, -9], [-28, 7], [32, 7], [-7.5, -9], [7.5, -9], [-7.5, 7], [7.5, 7]].forEach(([px, pz]) => {
    buildPlant(scene, px as number, pz as number)
  })
  // Larger corner plants
  ;[[-28, -9], [32, 7]].forEach(([px, pz]) => {
    buildPlant(scene, (px as number) + 0.5, (pz as number) + 0.5, 1.3)
  })

  // ── Reception desk ────────────────────────────────────────────────────────
  const recMat  = stdMat(0x3d2a1a, 0.5, 0.2)
  const recTop  = stdMat(0x5a3e2b, 0.4, 0.3)
  const recBody = new THREE.Mesh(new THREE.BoxGeometry(5, 1.05, 0.9), recMat)
  const recSurf = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.08, 1.0), recTop)
  recBody.position.set(2, 0.525, 5.5); recBody.castShadow = true
  recSurf.position.set(2, 1.065, 5.5); recSurf.castShadow = true
  scene.add(recBody, recSurf)

  // Reception sign — glowing
  const signMat = stdMat(0xd4a017, 0.4, 0.4, 0xb8860b, 0.5)
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.32, 0.06), signMat)
  sign.position.set(2, 1.4, 5.1); scene.add(sign)
  const signLight = new THREE.PointLight(0xd4a017, 0.4, 3)
  signLight.position.set(2, 1.8, 5.5); scene.add(signLight)

  // ── Whiteboards on walls ──────────────────────────────────────────────────
  const wbMat  = stdMat(0xf4f4ee, 0.9, 0.0)
  const wbFrame = stdMat(0x666677, 0.7, 0.5)
  ;[-20, 2, 22].forEach(wx => {
    const wb  = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.5), wbMat)
    const frm = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 0.05), wbFrame)
    wb.position.set(wx, 2.4, -10.78); frm.position.set(wx, 2.4, -10.82)
    // Colored marker marks (simulated writing)
    const colors = [0x4e5eff, 0x22c55e, 0xe11d48]
    colors.forEach((col, ci) => {
      const m = stdMat(col, 0.9, 0, col, 0.4)
      for (let li = 0; li < 3; li++) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.8 + Math.random() * 1.2, 0.04), m)
        line.position.set(wx - 1.5 + Math.random() * 3, 2.1 + ci * 0.3 + li * 0.1, -10.76)
        scene.add(line)
      }
    })
    scene.add(wb, frm)
  })

  // ── Decorative floor zone labels ─────────────────────────────────────────
  const makeLabel = (text: string, color: string) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, 512, 128)
    ctx.font = 'bold 46px system-ui, sans-serif'; ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 64)
    return new THREE.CanvasTexture(c)
  }
  ;[
    { text: 'Sala Principal',     color: '#eab308', x: -14 },
    { text: 'Sala Especialistas', color: '#4e5eff', x:   1 },
    { text: 'Escritório Geral',   color: '#22c55e', x:  17 },
  ].forEach(({ text, color, x }) => {
    const mat = new THREE.MeshBasicMaterial({ map: makeLabel(text, color), transparent: true, opacity: 0.3 })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), mat)
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.003, 4.5)
    scene.add(mesh)
  })
}
