/**
 * FPSControls.ts — ported from ai-office/js/controls.js
 * First-person WASD + mouse-look controls using Pointer Lock API.
 */
import * as THREE from 'three'

const SPEED        = 5
const SPRINT_MULT  = 2
const EYE_HEIGHT   = 1.65
const DAMPING      = 0.85
const ROOM_HALF_X  = 13.5
const ROOM_HALF_Z  = 9.0

export class FPSControls {
  private camera: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement
  private velocity = new THREE.Vector3()
  private keys: Record<string, boolean> = {}
  private yaw   = 0
  private pitch = 0
  private locked = false
  private _onLockChange: () => void
  private _onKey: (e: KeyboardEvent) => void
  private _onMouse: (e: MouseEvent) => void

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera
    this.canvas = canvas

    camera.position.set(0, EYE_HEIGHT, 6)
    camera.rotation.order = 'YXZ'

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === canvas
    }
    this._onKey = (e: KeyboardEvent) => {
      this.keys[e.code] = e.type === 'keydown'
    }
    this._onMouse = (e: MouseEvent) => {
      if (!this.locked) return
      this.yaw   -= e.movementX * 0.002
      this.pitch -= e.movementY * 0.002
      this.pitch  = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch))
    }

    canvas.addEventListener('click', () => canvas.requestPointerLock())
    document.addEventListener('pointerlockchange', this._onLockChange)
    document.addEventListener('keydown', this._onKey)
    document.addEventListener('keyup', this._onKey)
    document.addEventListener('mousemove', this._onMouse)
  }

  isLocked(): boolean { return this.locked }

  update(dt: number): void {
    const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight'])
      ? SPEED * SPRINT_MULT : SPEED

    const dir = new THREE.Vector3()
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    dir.z -= 1
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  dir.z += 1
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dir.x -= 1
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dir.x += 1
    if (dir.lengthSq() > 0) dir.normalize()

    // Rotate movement direction by yaw only
    dir.applyEuler(new THREE.Euler(0, this.yaw, 0))
    this.velocity.x += dir.x * speed * dt
    this.velocity.z += dir.z * speed * dt

    this.velocity.multiplyScalar(DAMPING)

    const nextX = this.camera.position.x + this.velocity.x * dt
    const nextZ = this.camera.position.z + this.velocity.z * dt

    if (Math.abs(nextX) < ROOM_HALF_X) this.camera.position.x = nextX
    if (Math.abs(nextZ) < ROOM_HALF_Z) this.camera.position.z = nextZ
    this.camera.position.y = EYE_HEIGHT

    // Apply rotation
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this._onLockChange)
    document.removeEventListener('keydown', this._onKey)
    document.removeEventListener('keyup', this._onKey)
    document.removeEventListener('mousemove', this._onMouse)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
}
