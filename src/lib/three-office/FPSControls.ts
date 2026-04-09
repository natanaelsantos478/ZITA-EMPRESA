/**
 * FPSControls.ts — First-person WASD + mouse-look (Pointer Lock API)
 */
import * as THREE from 'three'

const SPEED       = 6
const SPRINT_MULT = 2.2
const EYE_HEIGHT  = 1.65
const DAMPING     = 0.82
// Bounds match the expanded office (60x18 centered at x=2, z=-2)
const BOUND_X     = 29
const BOUND_Z_MIN = -10.5
const BOUND_Z_MAX =  6.5

export class FPSControls {
  private camera: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement
  private velocity = new THREE.Vector3()
  private keys: Record<string, boolean> = {}
  private yaw   = 0
  private pitch = 0
  private locked = false
  readonly _onLockChange: () => void
  readonly _onKey:   (e: KeyboardEvent) => void
  readonly _onMouse: (e: MouseEvent) => void

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera
    this.canvas = canvas
    camera.position.set(2, EYE_HEIGHT, 8)
    camera.rotation.order = 'YXZ'

    this._onLockChange = () => { this.locked = document.pointerLockElement === canvas }
    this._onKey   = (e: KeyboardEvent) => { this.keys[e.code] = e.type === 'keydown' }
    this._onMouse = (e: MouseEvent) => {
      if (!this.locked) return
      this.yaw   -= e.movementX * 0.002
      this.pitch  = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.pitch - e.movementY * 0.002))
    }

    canvas.addEventListener('click', () => canvas.requestPointerLock())
    document.addEventListener('pointerlockchange', this._onLockChange)
    document.addEventListener('keydown', this._onKey)
    document.addEventListener('keyup',   this._onKey)
    document.addEventListener('mousemove', this._onMouse)
  }

  isLocked(): boolean { return this.locked }

  update(dt: number): void {
    const sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight']
    const speed  = sprint ? SPEED * SPRINT_MULT : SPEED

    const dir = new THREE.Vector3()
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    dir.z -= 1
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  dir.z += 1
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dir.x -= 1
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dir.x += 1
    if (dir.lengthSq() > 0) dir.normalize()
    dir.applyEuler(new THREE.Euler(0, this.yaw, 0))

    this.velocity.x += dir.x * speed * dt
    this.velocity.z += dir.z * speed * dt
    this.velocity.multiplyScalar(DAMPING)

    const nx = this.camera.position.x + this.velocity.x * dt
    const nz = this.camera.position.z + this.velocity.z * dt
    if (Math.abs(nx - 2) < BOUND_X) this.camera.position.x = nx
    if (nz > BOUND_Z_MIN && nz < BOUND_Z_MAX) this.camera.position.z = nz
    this.camera.position.y = EYE_HEIGHT
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this._onLockChange)
    document.removeEventListener('keydown',   this._onKey)
    document.removeEventListener('keyup',     this._onKey)
    document.removeEventListener('mousemove', this._onMouse)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
}
