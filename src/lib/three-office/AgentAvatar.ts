/**
 * AgentAvatar.ts — faithful TypeScript port of ai-office/js/avatar.js
 * Animated humanoid agent: idle bob, typing animation, HTML name tags, speech bubbles.
 */
import * as THREE from 'three'
import type { IaAgent } from '../../types'
import { DESK_POSITIONS } from './OfficeScene'

// ─── Animation constants ──────────────────────────────────────────────────
const IDLE_BOB_SPEED   = 1.4
const IDLE_BOB_RANGE   = 0.018
const ACTIVE_BOB_SPEED = 3.5
const ACTIVE_BOB_RANGE = 0.04
const TASK_MIN_MS      = 5000
const TASK_MAX_MS      = 15000
const SPEECH_DURATION  = 6000

const TASK_MESSAGES = [
  'Processando dados...',
  'Analisando relatório...',
  'Respondendo consulta...',
  'Executando tarefa...',
  'Gerando resposta...',
  'Verificando dados...',
  'Calculando métricas...',
  'Sincronizando...',
  'Otimizando processo...',
]

// ─── Color utilities ──────────────────────────────────────────────────────

function hexStrToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function darken(hex: number, factor: number): number {
  const r = ((hex >> 16) & 0xff) * factor
  const g = ((hex >> 8)  & 0xff) * factor
  const b = (hex          & 0xff) * factor
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

function lighten(hex: number, factor: number): number {
  const r = Math.min(255, ((hex >> 16) & 0xff) * factor)
  const g = Math.min(255, ((hex >> 8)  & 0xff) * factor)
  const b = Math.min(255, (hex          & 0xff) * factor)
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

// ─── Avatar class ─────────────────────────────────────────────────────────

export class AgentAvatar {
  readonly group:   THREE.Group
  readonly agentId: string

  private scene:   THREE.Scene
  private color:   number
  private _status: 'idle' | 'active' | 'done' = 'idle'
  private _meshes: THREE.Mesh[] = []

  // Animation targets
  private _body: THREE.Mesh | null = null
  private _head: THREE.Mesh | null = null
  private _armL: THREE.Mesh | null = null
  private _armR: THREE.Mesh | null = null

  // HTML overlays
  private _nameTagDiv!: HTMLDivElement
  private _speechDiv!:  HTMLDivElement
  private _speechText!: HTMLElement
  private _speechVisible = false

  // Timers
  private _speechTimeout: ReturnType<typeof setTimeout> | null = null
  private _taskTimeout:   ReturnType<typeof setTimeout> | null = null

  constructor(scene: THREE.Scene, agent: IaAgent, index: number) {
    this.scene   = scene
    this.agentId = agent.id
    this.color   = hexStrToInt(agent.cor_hex || '#4e5eff')

    const deskPos = DESK_POSITIONS[index % DESK_POSITIONS.length]

    this.group = new THREE.Group()
    this.group.position.set(deskPos.x, 0, deskPos.z + 0.5)
    this.group.rotation.y = deskPos.ry + Math.PI
    scene.add(this.group)

    this._buildBody(agent)
    this._buildSpeechBubble()
    this._buildNameTag(agent)
    this._scheduleNextTask()
  }

  // ─── Body construction ────────────────────────────────────────────────

  private _buildBody(agent: IaAgent): void {
    const c = this.color

    const shirtMat = new THREE.MeshLambertMaterial({ color: darken(c, 0.55) })
    const bodyMat  = new THREE.MeshLambertMaterial({ color: c })
    const legMat   = new THREE.MeshLambertMaterial({ color: darken(c, 0.4) })
    const hairMat  = new THREE.MeshLambertMaterial({ color: darken(c, 0.3) })
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x111318 })
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xfff0e8 })
    const eyeMat   = new THREE.MeshLambertMaterial({ color: 0x222233 })
    const badgeMat = new THREE.MeshLambertMaterial({ color: lighten(c, 0.4) })

    const add = (mesh: THREE.Mesh) => {
      this.group.add(mesh)
      this._meshes.push(mesh)
      return mesh
    }

    // Torso
    const torso = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.22), shirtMat))
    torso.position.set(0, 1.12, 0)
    torso.castShadow = true
    this._body = torso

    // Hip
    const hip = add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.2), bodyMat))
    hip.position.set(0, 0.84, 0)
    hip.castShadow = true

    // Seated legs
    ;[[-0.12, 0], [0.12, 0]].forEach(([lx]) => {
      const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.38), legMat))
      leg.position.set(lx, 0.62, 0.18)
      leg.rotation.x = Math.PI / 2.5
      leg.castShadow = true

      const foot = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), darkMat))
      foot.position.set(lx, 0.44, 0.42)
    })

    // Arms
    const armGeo = new THREE.BoxGeometry(0.1, 0.38, 0.1)
    const armL = add(new THREE.Mesh(armGeo, shirtMat))
    armL.position.set(-0.27, 1.08, 0.08)
    armL.castShadow = true
    this._armL = armL

    const armR = add(new THREE.Mesh(armGeo.clone(), shirtMat))
    armR.position.set(0.27, 1.08, 0.08)
    armR.castShadow = true
    this._armR = armR

    // Hands
    const handGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09)
    const handL = add(new THREE.Mesh(handGeo, whiteMat))
    handL.position.set(-0.27, 0.88, 0.14)

    const handR = add(new THREE.Mesh(handGeo.clone(), whiteMat))
    handR.position.set(0.27, 0.88, 0.14)

    // Neck
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), whiteMat))
    neck.position.set(0, 1.42, 0)

    // Head
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), whiteMat))
    head.scale.set(1, 1.08, 0.92)
    head.position.set(0, 1.65, 0)
    head.castShadow = true
    this._head = head

    // Eyes
    ;[[-0.07, 0], [0.07, 0]].forEach(([ex]) => {
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat))
      eye.position.set(ex, 1.67, 0.16)
    })

    // Hair (upper hemisphere)
    const hair = add(new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      hairMat
    ))
    hair.position.set(0, 1.65, 0)
    hair.castShadow = true

    // Function badge
    const badge = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), badgeMat))
    badge.position.set(0, 1.26, 0.12)

    // Status dot
    const statusColors: Record<string, number> = {
      online:    0x00ff88,
      ocupada:   0xffcc00,
      aguardando:0x4488ff,
      offline:   0x444444,
      erro:      0xff2222,
      pausada:   0xff8800,
    }
    const sc = statusColors[agent.status] ?? 0x444444
    const statusDot = add(new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshLambertMaterial({ color: sc, emissive: sc, emissiveIntensity: 0.6 })
    ))
    statusDot.position.set(-0.2, 1.18, 0.12)
  }

  // ─── HTML overlays ────────────────────────────────────────────────────

  private _buildSpeechBubble(): void {
    const div = document.createElement('div')
    div.className = 'zita-speech-bubble'
    div.style.display = 'none'
    div.innerHTML = `<span class="zita-speech-text"></span>`
    document.body.appendChild(div)
    this._speechDiv  = div
    this._speechText = div.querySelector('.zita-speech-text')!
    this._injectStyles()
  }

  private _buildNameTag(agent: IaAgent): void {
    const div = document.createElement('div')
    div.className = 'zita-name-tag'
    div.innerHTML = `
      <span class="znt-name">${agent.nome}</span>
      ${agent.funcao ? `<span class="znt-role">${agent.funcao}</span>` : ''}
    `
    document.body.appendChild(div)
    this._nameTagDiv = div
  }

  private _injectStyles(): void {
    if (document.getElementById('zita-avatar-styles')) return
    const style = document.createElement('style')
    style.id = 'zita-avatar-styles'
    style.textContent = `
      .zita-name-tag {
        position: fixed;
        display: none;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        transform: translate(-50%, -100%);
        z-index: 50;
        gap: 1px;
      }
      .znt-name {
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        color: #e8eaf0;
        background: rgba(13,15,20,0.85);
        padding: 2px 7px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        white-space: nowrap;
        text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        backdrop-filter: blur(4px);
      }
      .znt-role {
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.62rem;
        color: #8890a8;
        background: rgba(13,15,20,0.7);
        padding: 1px 5px;
        border-radius: 8px;
        white-space: nowrap;
      }
      .zita-speech-bubble {
        position: fixed;
        max-width: 200px;
        pointer-events: none;
        transform: translate(-50%, -100%);
        z-index: 51;
      }
      .zita-speech-text {
        display: block;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.72rem;
        color: #e8eaf0;
        background: rgba(20,26,40,0.93);
        padding: 5px 10px;
        border-radius: 10px;
        border: 1px solid rgba(74,158,255,0.35);
        backdrop-filter: blur(6px);
        white-space: normal;
        line-height: 1.35;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        text-align: center;
        animation: zitaBubblePop 0.2s ease;
      }
      @keyframes zitaBubblePop {
        from { transform: scale(0.85); opacity: 0; }
        to   { transform: scale(1);    opacity: 1; }
      }
      .zita-speech-bubble::after {
        content: '';
        display: block;
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid rgba(20,26,40,0.93);
        margin: 0 auto;
      }
    `
    document.head.appendChild(style)
  }

  // ─── Per-frame updates ────────────────────────────────────────────────

  /** Call every frame after rendering to reposition HTML overlays */
  updateHTML(camera: THREE.Camera, canvas: HTMLElement): void {
    const rect = canvas.getBoundingClientRect()

    const namePos = this.group.position.clone()
    namePos.y += 2.1
    const np = this._project(camera, namePos, rect)

    if (np.visible) {
      this._nameTagDiv.style.display = 'flex'
      this._nameTagDiv.style.left = np.x + 'px'
      this._nameTagDiv.style.top  = np.y + 'px'
    } else {
      this._nameTagDiv.style.display = 'none'
    }

    if (this._speechVisible) {
      const bubblePos = this.group.position.clone()
      bubblePos.y += 2.6
      const bp = this._project(camera, bubblePos, rect)
      if (bp.visible) {
        this._speechDiv.style.display = 'block'
        this._speechDiv.style.left = bp.x + 'px'
        this._speechDiv.style.top  = bp.y + 'px'
      } else {
        this._speechDiv.style.display = 'none'
      }
    }
  }

  /** Call every frame to advance animations */
  update(_delta: number, elapsed: number): void {
    const isActive = this._status === 'active'
    const speed    = isActive ? ACTIVE_BOB_SPEED : IDLE_BOB_SPEED
    const range    = isActive ? ACTIVE_BOB_RANGE : IDLE_BOB_RANGE

    const bob = Math.sin(elapsed * speed) * range
    if (this._body) this._body.position.y = 1.12 + bob
    if (this._head) {
      this._head.position.y = 1.65 + bob * 0.5
      this._head.rotation.y = Math.sin(elapsed * 0.4) * 0.06
    }

    if (this._armL && this._armR) {
      if (isActive) {
        const tL =  Math.sin(elapsed * ACTIVE_BOB_SPEED * 1.3) * 0.15
        const tR = -Math.sin(elapsed * ACTIVE_BOB_SPEED * 1.3) * 0.15
        this._armL.rotation.x = tL
        this._armR.rotation.x = tR
      } else {
        this._armL.rotation.x = Math.sin(elapsed * 0.5) * 0.02
        this._armR.rotation.x = Math.sin(elapsed * 0.5 + 1) * 0.02
      }
    }
  }

  // ─── Raycasting helpers ───────────────────────────────────────────────

  owns(obj: THREE.Object3D): boolean {
    return this._meshes.includes(obj as THREE.Mesh)
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  dispose(): void {
    if (this._taskTimeout)   clearTimeout(this._taskTimeout)
    if (this._speechTimeout) clearTimeout(this._speechTimeout)
    this.scene.remove(this.group)
    this._nameTagDiv.remove()
    this._speechDiv.remove()
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private _project(
    camera: THREE.Camera,
    worldPos: THREE.Vector3,
    rect: DOMRect
  ): { x: number; y: number; visible: boolean } {
    const vec = worldPos.clone().project(camera)
    const x = (vec.x + 1) / 2 * rect.width  + rect.left
    const y = -(vec.y - 1) / 2 * rect.height + rect.top
    const visible = vec.z < 1
      && x > rect.left - 50 && x < rect.right  + 50
      && y > rect.top  - 50 && y < rect.bottom + 50
    return { x, y, visible }
  }

  private _scheduleNextTask(): void {
    const delay = TASK_MIN_MS + Math.random() * (TASK_MAX_MS - TASK_MIN_MS)
    this._taskTimeout = setTimeout(() => this._executeTask(), delay)
  }

  private _executeTask(): void {
    this._status = 'active'
    const msg = TASK_MESSAGES[Math.floor(Math.random() * TASK_MESSAGES.length)]

    this._speechText.textContent = msg
    this._speechDiv.style.display = 'block'
    this._speechVisible = true

    if (this._speechTimeout) clearTimeout(this._speechTimeout)
    this._speechTimeout = setTimeout(() => {
      this._status = 'done'
      this._speechVisible = false
      this._speechDiv.style.display = 'none'

      setTimeout(() => {
        this._status = 'idle'
        this._scheduleNextTask()
      }, 1500)
    }, SPEECH_DURATION)
  }
}
