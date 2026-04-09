/**
 * OfficeScene.ts — Large open-plan 3D office with 3 zones
 */
import * as THREE from 'three'

// Desk positions per zone — readable from localStorage for custom placement
export interface DeskPos { x: number; z: number; ry: number }

function defaultDesks(): DeskPos[] {
  const desks: DeskPos[] = []
  // Zone A: Sala Principal (left) — x: -20 to -8
  for (let col = 0; col < 3; col++) {
    desks.push({ x: -19 + col * 4,  z: -6, ry: 0 })
    desks.push({ x: -19 + col * 4,  z:  0, ry: Math.PI })
  }
  // Zone B: Especialistas (centre) — x: -6 to 6
  for (let col = 0; col < 3; col++) {
    desks.push({ x: -5 + col * 4,   z: -6, ry: 0 })
    desks.push({ x: -5 + col * 4,   z:  0, ry: Math.PI })
  }
  // Zone C: Escritório Geral (right) — x: 8 to 24
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

export function buildOfficeScene(scene: THREE.Scene, deskPositions?: DeskPos[]): void {
  const desks = deskPositions ?? defaultDesks()
  DESK_POSITIONS = desks

  // ── Lighting ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.0)
  sun.position.set(10, 20, 5); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35
  sun.shadow.camera.top  =  20; sun.shadow.camera.bottom = -20
  sun.shadow.camera.far  = 80
  scene.add(sun)

  // Ceiling strip lights
  ;[[-18,4,-3],[- 6,4,-3],[ 6,4,-3],[18,4,-3],
    [-18,4, 3],[-6, 4, 3],[ 6,4, 3],[18,4, 3]].forEach(([x,y,z]) => {
    const pt = new THREE.PointLight(0xfff5e0, 0.4, 14)
    pt.position.set(x, y, z); scene.add(pt)
  })

  // ── Floor ─────────────────────────────────────────────────────────────────
  // Main floor 60×18
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), floorMat)
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true
  floor.position.set(2, 0, -2)
  scene.add(floor)

  // Floor tiles overlay (checker)
  const tileMat1 = new THREE.MeshLambertMaterial({ color: 0x7a6445 })
  const tileMat2 = new THREE.MeshLambertMaterial({ color: 0x9b8465 })
  for (let tx = -28; tx < 34; tx += 2) {
    for (let tz = -10; tz < 8; tz += 2) {
      const mat = (Math.abs(tx/2 + tz/2)) % 2 === 0 ? tileMat1 : tileMat2
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.98, 1.98), mat)
      tile.rotation.x = -Math.PI/2; tile.position.set(tx+1, 0.001, tz+1)
      tile.receiveShadow = true; scene.add(tile)
    }
  }

  // ── Ceiling ───────────────────────────────────────────────────────────────
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0xf0ece4 })
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), ceilMat)
  ceil.rotation.x = Math.PI/2; ceil.position.set(2, 4, -2); scene.add(ceil)

  // Ceiling light fixtures
  const fixtureMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.5 })
  ;[[-18],[-6],[6],[18]].forEach(([x]) => {
    const fix = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.3), fixtureMat)
    fix.position.set(x, 3.96, -2); scene.add(fix)
  })

  // ── Outer walls ───────────────────────────────────────────────────────────
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8dfd0 })
  const wallData = [
    { w:60, h:4, pos:[ 2, 2,-11] as [number,number,number], ry:0 },
    { w:60, h:4, pos:[ 2, 2,  7] as [number,number,number], ry:Math.PI },
    { w:18, h:4, pos:[-28,2, -2] as [number,number,number], ry:Math.PI/2 },
    { w:18, h:4, pos:[ 32,2, -2] as [number,number,number], ry:-Math.PI/2 },
  ]
  wallData.forEach(({ w, h, pos, ry }) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat)
    wall.position.set(...pos); wall.rotation.y = ry; wall.receiveShadow = true; scene.add(wall)
  })

  // ── Zone dividers (low glass partitions) ─────────────────────────────────
  const partMat = new THREE.MeshLambertMaterial({ color: 0x7ab3cc, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  const framMat = new THREE.MeshLambertMaterial({ color: 0x888888 })
  ;[-7.5, 7.5].forEach(px => {
    // Glass panel
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 2), partMat)
    panel.position.set(px, 1, -2); panel.rotation.y = Math.PI/2; scene.add(panel)
    // Frame posts
    ;[-9, -5, -1, 3, 7].forEach(pz => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2, 0.06), framMat)
      post.position.set(px, 1, pz); scene.add(post)
    })
  })

  // Zone labels on floor
  const labelCanvas = (text: string, color: string) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, 512, 128)
    ctx.font = 'bold 48px sans-serif'; ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 64)
    const tex = new THREE.CanvasTexture(c)
    return tex
  }
  ;[
    { text:'Sala Principal',    color:'#eab308', x:-14 },
    { text:'Sala Especialistas',color:'#4e5eff', x:  1 },
    { text:'Escritório Geral',  color:'#22c55e', x: 17 },
  ].forEach(({ text, color, x }) => {
    const mat = new THREE.MeshBasicMaterial({ map: labelCanvas(text, color), transparent: true, opacity: 0.35 })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), mat)
    mesh.rotation.x = -Math.PI/2; mesh.position.set(x, 0.02, 4); scene.add(mesh)
  })

  // ── Desks ─────────────────────────────────────────────────────────────────
  const deskMat  = new THREE.MeshLambertMaterial({ color: 0x7a5c1e })
  const legMat   = new THREE.MeshLambertMaterial({ color: 0x555555 })
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
  const screenMat= new THREE.MeshLambertMaterial({ color: 0x1a1a2e, emissive: 0x0d0d1a })

  desks.forEach(({ x, z, ry }) => {
    const g = new THREE.Group()
    // Top
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), deskMat)
    top.position.y = 0.76; top.castShadow = true; g.add(top)
    // Legs
    ;[[-0.7,0.4,-0.35],[0.7,0.4,-0.35],[-0.7,0.4,0.35],[0.7,0.4,0.35]].forEach(([lx,ly,lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.8,0.06), legMat)
      leg.position.set(lx,ly,lz); leg.castShadow = true; g.add(leg)
    })
    // Monitor
    const frame  = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.04), frameMat)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.34), screenMat)
    const stand  = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.04), frameMat)
    const base   = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12), frameMat)
    frame.position.set(0,1.2,-0.15); screen.position.set(0,1.2,-0.13)
    stand.position.set(0,1.0,-0.15); base.position.set(0,0.81,-0.15)
    ;[frame,screen,stand,base].forEach(m => { m.castShadow = true; g.add(m) })

    g.position.set(x, 0, z); g.rotation.y = ry
    scene.add(g)
  })

  // ── Plants ────────────────────────────────────────────────────────────────
  const potMat  = new THREE.MeshLambertMaterial({ color: 0x8b6914 })
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x228b22 })
  ;[[-27,-9],[ 31,-9],[-27, 7],[31,7],[-7,-9],[7,-9]].forEach(([px,pz]) => {
    const pot  = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.16,0.4,8),  potMat)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55,8,6), leafMat)
    const leaf2= new THREE.Mesh(new THREE.SphereGeometry(0.35,6,5), leafMat)
    pot.position.set(px, 0.2, pz)
    leaf.position.set(px, 0.95, pz)
    leaf2.position.set(px+0.3, 1.1, pz+0.2)
    scene.add(pot, leaf, leaf2)
  })

  // ── Reception desk (entrance) ─────────────────────────────────────────────
  const recMat = new THREE.MeshLambertMaterial({ color: 0x5a3e2b })
  const rec = new THREE.Mesh(new THREE.BoxGeometry(4, 1.0, 0.8), recMat)
  rec.position.set(2, 0.5, 5.5); rec.castShadow = true; rec.receiveShadow = true; scene.add(rec)
  // Reception sign
  const signMat = new THREE.MeshLambertMaterial({ color: 0xd4a017, emissive: 0xb8860b, emissiveIntensity: 0.3 })
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.05), signMat)
  sign.position.set(2, 1.25, 5.12); scene.add(sign)

  // ── Whiteboards on walls ──────────────────────────────────────────────────
  const wbMat = new THREE.MeshLambertMaterial({ color: 0xf8f8f8 })
  const wbFrm = new THREE.MeshLambertMaterial({ color: 0x888888 })
  ;[[-18,2,-10.8],[ 2,2,-10.8],[20,2,-10.8]].forEach(([wx,wy,wz]) => {
    const wb  = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), wbMat)
    const frm = new THREE.Mesh(new THREE.BoxGeometry(4.1,2.1,0.04), wbFrm)
    wb.position.set(wx,wy,wz); frm.position.set(wx,wy,wz-0.02); scene.add(wb, frm)
  })
}
