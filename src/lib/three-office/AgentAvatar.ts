/**
 * AgentAvatar.ts — Game-quality animated humanoid agent with speech bubbles
 */
import * as THREE from 'three'
import type { IaAgent } from '../../types'
import { DESK_POSITIONS } from './OfficeScene'

// ── Animation constants ────────────────────────────────────────────────────
const IDLE_BOB_SPEED   = 1.2
const IDLE_BOB_RANGE   = 0.015
const ACTIVE_BOB_SPEED = 4.0
const ACTIVE_BOB_RANGE = 0.045
const TASK_MIN_MS      = 3000
const TASK_MAX_MS      = 10000
const SPEECH_DURATION  = 5500

const STATUS_MESSAGES: Record<string, string[]> = {
  online: [
    'Pronto para ajudar!',
    'Todos os sistemas OK.',
    'Aguardando tarefas...',
    'Online e operacional.',
  ],
  ocupada: [
    'Processando dados...',
    'Analisando relatório...',
    'Calculando métricas...',
    'Tarefa em andamento...',
    'Otimizando processo...',
    'Gerando resposta...',
  ],
  aguardando: [
    'Aguardando aprovação...',
    'Na fila de execução.',
    'Pronto quando precisar.',
  ],
  offline: ['Sistema offline.', 'Indisponível.'],
  erro: ['Erro detectado!', 'Falha no processo!', 'Verificando logs...'],
  pausada: ['Em pausa.', 'Pausado temporariamente.'],
}

const GENERIC_MESSAGES = [
  'Processando dados...',
  'Analisando relatório...',
  'Respondendo consulta...',
  'Executando tarefa...',
  'Gerando resposta...',
  'Verificando dados...',
  'Calculando métricas...',
  'Sincronizando...',
  'Otimizando processo...',
  'Analisando padrões...',
  'Preparando relatório...',
  'Checando dependências...',
  'Validando resultado...',
]

// ── Color helpers ──────────────────────────────────────────────────────────
function hexStrToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}
function darken(hex: number, f: number): number {
  const r = ((hex >> 16) & 0xff) * f
  const g = ((hex >> 8)  & 0xff) * f
  const b = (hex          & 0xff) * f
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}
function lighten(hex: number, f: number): number {
  const r = Math.min(255, ((hex >> 16) & 0xff) * f)
  const g = Math.min(255, ((hex >> 8)  & 0xff) * f)
  const b = Math.min(255, (hex          & 0xff) * f)
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}
function stdMat(color: number, roughness = 0.7, metalness = 0.0, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness })
  if (emissive) { m.emissive.setHex(emissive); m.emissiveIntensity = emissiveIntensity }
  return m
}

// ── Avatar class ──────────────────────────────────────────────────────────
export class AgentAvatar {
  readonly group:   THREE.Group
  readonly agentId: string

  private scene:   THREE.Scene
  private color:   number
  private agentColor: string
  private _status: 'idle' | 'active' | 'done' = 'idle'
  private _meshes: THREE.Mesh[] = []

  // Body parts for animation
  private _torso:  THREE.Mesh | null = null
  private _head:   THREE.Mesh | null = null
  private _armL:   THREE.Mesh | null = null
  private _armR:   THREE.Mesh | null = null
  private _neck:   THREE.Mesh | null = null

  // Status dot glow animation
  private _dotMat: THREE.MeshStandardMaterial | null = null

  // HTML overlays
  private _nameTagDiv!: HTMLDivElement
  private _speechDiv!:  HTMLDivElement
  private _speechText!: HTMLElement
  private _speechVisible = false

  // Timers
  private _speechTimeout: ReturnType<typeof setTimeout> | null = null
  private _taskTimeout:   ReturnType<typeof setTimeout> | null = null

  private _agentStatus: string

  constructor(scene: THREE.Scene, agent: IaAgent, index: number) {
    this.scene       = scene
    this.agentId     = agent.id
    this.color       = hexStrToInt(agent.cor_hex || '#4e5eff')
    this.agentColor  = agent.cor_hex || '#4e5eff'
    this._agentStatus = agent.status

    const deskPos = DESK_POSITIONS[index % DESK_POSITIONS.length]

    this.group = new THREE.Group()
    this.group.position.set(deskPos.x, 0, deskPos.z + 0.56)
    this.group.rotation.y = deskPos.ry + Math.PI
    scene.add(this.group)

    this._buildBody(agent, index)
    this._buildSpeechBubble()
    this._buildNameTag(agent)
    this._scheduleNextTask()
  }

  // ── Body construction ────────────────────────────────────────────────────

  private _buildBody(agent: IaAgent, index: number): void {
    const c = this.color
    const shirtCol  = darken(c, 0.6)
    const pantsCol  = darken(c, 0.35)
    const hairCol   = darken(c, 0.25)
    const skinCol   = 0xffe0c8 + (index % 4) * 0x030100 // slight skin variation

    const shirtMat  = stdMat(shirtCol, 0.85, 0.0)
    const pantsMat  = stdMat(pantsCol, 0.85, 0.0)
    const skinMat   = stdMat(skinCol, 0.75, 0.0)
    const hairMat   = stdMat(hairCol, 0.9, 0.0)
    const eyeMat    = stdMat(0x1a1a2e, 0.7, 0.0)
    const eyeGlow   = stdMat(lighten(c, 0.4), 0.3, 0.0, lighten(c, 0.4), 0.6)
    const badgeMat  = stdMat(lighten(c, 1.5), 0.5, 0.2, c, 0.25)
    const shoeMat   = stdMat(0x1a1a1a, 0.8, 0.2)
    const collarMat = stdMat(0xf5f5f5, 0.85, 0.0)

    const add = (mesh: THREE.Mesh) => {
      this.group.add(mesh); this._meshes.push(mesh); return mesh
    }

    // ── Torso (capsule-like with boxes) ─────────────────────────────
    const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), shirtMat))
    torso.position.set(0, 1.12, 0); torso.castShadow = true
    this._torso = torso

    // Shirt collar
    const collar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), collarMat))
    collar.position.set(0, 1.35, 0)

    // Hip/waist
    const hip = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.12, 4, 8), pantsMat))
    hip.position.set(0, 0.84, 0); hip.castShadow = true

    // Belt
    const belt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.04, 10), stdMat(0x1a1a1a, 0.6, 0.5)))
    belt.position.set(0, 0.77, 0)

    // Seated legs
    ;[[-0.1, 0], [0.1, 0]].forEach(([lx], li) => {
      const thigh = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 8), pantsMat))
      thigh.position.set(lx, 0.65, 0.14)
      thigh.rotation.x = Math.PI / 2.2; thigh.castShadow = true
      void li

      const shin = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.18, 4, 8), pantsMat))
      shin.position.set(lx, 0.44, 0.38); shin.rotation.x = -Math.PI / 6

      const shoe = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.1, 4, 8), shoeMat))
      shoe.position.set(lx, 0.36, 0.48); shoe.rotation.x = Math.PI / 3
    })

    // ── Arms ────────────────────────────────────────────────────────────
    ;[[-0.26, 0], [0.26, 0]].forEach(([ax], ai) => {
      const upper = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), shirtMat))
      upper.position.set(ax, 1.08, 0.07); upper.castShadow = true
      if (ai === 0) this._armL = upper; else this._armR = upper

      const lower = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.18, 4, 8), skinMat))
      lower.position.set(ax, 0.9, 0.12)

      const hand = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skinMat))
      hand.position.set(ax, 0.78, 0.18)
    })

    // ── Neck ─────────────────────────────────────────────────────────────
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8), skinMat))
    neck.position.set(0, 1.42, 0); this._neck = neck

    // ── Head ─────────────────────────────────────────────────────────────
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skinMat))
    head.scale.set(1.0, 1.1, 0.94)
    head.position.set(0, 1.68, 0); head.castShadow = true
    this._head = head

    // Ears
    ;[[-0.21, 0], [0.21, 0]].forEach(([ex]) => {
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat))
      ear.scale.set(0.5, 0.9, 0.9)
      ear.position.set(ex, 1.67, 0)
    })

    // Eyes — iris glow
    ;[[-0.075, 0], [0.075, 0]].forEach(([ex]) => {
      const white = add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), stdMat(0xfafafa, 0.5, 0.0)))
      white.position.set(ex, 1.7, 0.18)
      const iris = add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeGlow))
      iris.position.set(ex, 1.7, 0.198)
      const pupil = add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), eyeMat))
      pupil.position.set(ex, 1.7, 0.208)
    })

    // Eyebrows
    const browMat = stdMat(hairCol, 0.9, 0.0)
    ;[[-0.075, 0], [0.075, 0]].forEach(([ex]) => {
      const brow = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), browMat))
      brow.position.set(ex, 1.745, 0.185)
      brow.rotation.z = ex < 0 ? 0.15 : -0.15
    })

    // Mouth (smile)
    const mouthMat = stdMat(darken(skinCol, 0.7), 0.8, 0.0)
    const mouth = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.01), mouthMat))
    mouth.position.set(0, 1.63, 0.198); mouth.rotation.z = 0.1

    // ── Hair ────────────────────────────────────────────────────────────
    const hairStyles = [
      // Style 0 — dome
      () => {
        const hair = add(new THREE.Mesh(new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat))
        hair.position.set(0, 1.68, 0)
      },
      // Style 1 — side part
      () => {
        const hair = add(new THREE.Mesh(new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat))
        hair.position.set(0.04, 1.68, 0)
        const tuft = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hairMat))
        tuft.position.set(-0.12, 1.88, -0.05)
      },
      // Style 2 — spiky
      () => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), hairMat))
          spike.position.set(Math.cos(a) * 0.1, 1.88, Math.sin(a) * 0.1)
          spike.rotation.z = Math.cos(a) * 0.5; spike.rotation.x = -Math.sin(a) * 0.5
        }
        const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMat))
        cap.position.set(0, 1.68, 0)
      },
      // Style 3 — short back
      () => {
        const hair = add(new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat))
        hair.position.set(0, 1.67, -0.04)
        const bang = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), hairMat))
        bang.position.set(0, 1.9, 0.08)
      },
    ]
    hairStyles[index % hairStyles.length]()

    // ── Function badge ────────────────────────────────────────────────────
    const badge = add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.085, 0.025), badgeMat))
    badge.position.set(0, 1.26, 0.21)

    // ── Status dot — glowing ───────────────────────────────────────────────
    const statusColors: Record<string, number> = {
      online:     0x00ff88,
      ocupada:    0xffcc00,
      aguardando: 0x4488ff,
      offline:    0x555566,
      erro:       0xff2233,
      pausada:    0xff8800,
    }
    const sc = statusColors[agent.status] ?? 0x555566
    this._dotMat = stdMat(sc, 0.3, 0.0, sc, 0.9)
    const dot = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), this._dotMat))
    dot.position.set(-0.22, 1.21, 0.21)

    // Status dot point light
    const dotLight = new THREE.PointLight(sc, 0.3, 0.7)
    dotLight.position.set(-0.22, 1.21, 0.22)
    this.group.add(dotLight)

    // ── Type indicator (zeus crown / specialist star) ─────────────────────
    if (agent.tipo === 'zeus') {
      const crownMat = stdMat(0xffd700, 0.3, 0.8, 0xffd700, 0.5)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 4), crownMat))
        spike.position.set(Math.cos(a) * 0.21, 1.92, Math.sin(a) * 0.12)
        spike.rotation.z = Math.cos(a) * 0.15
      }
      const crownRing = add(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 16), crownMat))
      crownRing.position.set(0, 1.88, 0); crownRing.rotation.x = Math.PI / 2
      // Crown glow
      const crownLight = new THREE.PointLight(0xffd700, 0.5, 1.5)
      crownLight.position.set(0, 2.0, 0); this.group.add(crownLight)
    } else if (agent.tipo === 'especialista') {
      const starMat = stdMat(lighten(c, 1.8), 0.3, 0.5, lighten(c, 1.8), 0.6)
      const star = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.08), starMat))
      star.position.set(0.21, 1.92, 0)
    }
  }

  // ── HTML overlays ──────────────────────────────────────────────────────

  private _buildSpeechBubble(): void {
    const div = document.createElement('div')
    div.className = 'zita-speech-bubble'
    div.style.display = 'none'
    div.innerHTML = `
      <div class="zita-bubble-inner">
        <span class="zita-speech-text"></span>
      </div>
      <div class="zita-bubble-tail"></div>
    `
    document.body.appendChild(div)
    this._speechDiv  = div
    this._speechText = div.querySelector('.zita-speech-text')!
    this._injectStyles()
  }

  private _buildNameTag(agent: IaAgent): void {
    const div = document.createElement('div')
    div.className = 'zita-name-tag'
    const statusEmoji: Record<string, string> = {
      online: '🟢', ocupada: '🟡', aguardando: '🔵',
      offline: '⚫', erro: '🔴', pausada: '🟠',
    }
    div.innerHTML = `
      <span class="znt-name">
        ${statusEmoji[agent.status] || '⚫'} ${agent.nome}
      </span>
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
        gap: 2px;
      }
      .znt-name {
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        color: #ffffff;
        background: linear-gradient(135deg, rgba(15,18,28,0.94), rgba(25,30,50,0.94));
        padding: 3px 10px 3px 8px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.15);
        white-space: nowrap;
        text-shadow: 0 1px 4px rgba(0,0,0,0.9);
        backdrop-filter: blur(6px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6);
        letter-spacing: 0.01em;
      }
      .znt-role {
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.65rem;
        color: #aab4cc;
        background: rgba(10,12,20,0.8);
        padding: 1px 8px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        white-space: nowrap;
        backdrop-filter: blur(4px);
      }
      .zita-speech-bubble {
        position: fixed;
        pointer-events: none;
        transform: translate(-50%, -100%);
        z-index: 52;
        max-width: 220px;
        min-width: 120px;
        filter: drop-shadow(0 4px 16px rgba(0,0,0,0.7));
      }
      .zita-bubble-inner {
        background: linear-gradient(135deg, rgba(16,22,40,0.97), rgba(22,32,60,0.97));
        border: 1.5px solid rgba(100,160,255,0.45);
        border-radius: 14px;
        padding: 8px 13px;
        backdrop-filter: blur(8px);
        box-shadow: 0 0 20px rgba(80,140,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1);
      }
      .zita-speech-text {
        display: block;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 500;
        color: #dde6ff;
        white-space: normal;
        line-height: 1.4;
        text-align: center;
        animation: zitaBubblePop 0.25s cubic-bezier(0.34,1.56,0.64,1);
      }
      .zita-bubble-tail {
        width: 0; height: 0;
        border-left: 7px solid transparent;
        border-right: 7px solid transparent;
        border-top: 9px solid rgba(16,22,40,0.97);
        margin: 0 auto;
        position: relative;
      }
      .zita-bubble-tail::before {
        content: '';
        position: absolute;
        top: -11px; left: -8.5px;
        border-left: 8.5px solid transparent;
        border-right: 8.5px solid transparent;
        border-top: 11px solid rgba(100,160,255,0.45);
      }
      @keyframes zitaBubblePop {
        from { transform: scale(0.7) translateY(8px); opacity: 0; }
        to   { transform: scale(1)   translateY(0);   opacity: 1; }
      }
    `
    document.head.appendChild(style)
  }

  // ── Per-frame updates ───────────────────────────────────────────────────

  updateHTML(camera: THREE.Camera, canvas: HTMLElement): void {
    const rect = canvas.getBoundingClientRect()

    // Name tag — positioned above head
    const namePos = this.group.position.clone(); namePos.y += 2.2
    const np = this._project(camera, namePos, rect)
    if (np.visible) {
      this._nameTagDiv.style.display = 'flex'
      this._nameTagDiv.style.left = np.x + 'px'
      this._nameTagDiv.style.top  = np.y + 'px'
    } else {
      this._nameTagDiv.style.display = 'none'
    }

    // Speech bubble — above name tag
    if (this._speechVisible) {
      const bubblePos = this.group.position.clone(); bubblePos.y += 3.1
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

  update(_delta: number, elapsed: number): void {
    const isActive = this._status === 'active'
    const speed    = isActive ? ACTIVE_BOB_SPEED : IDLE_BOB_SPEED
    const range    = isActive ? ACTIVE_BOB_RANGE : IDLE_BOB_RANGE

    const bob = Math.sin(elapsed * speed) * range

    if (this._torso) this._torso.position.y = 1.12 + bob
    if (this._neck)  this._neck.position.y  = 1.42 + bob * 0.6
    if (this._head) {
      this._head.position.y  = 1.68 + bob * 0.5
      this._head.rotation.y  = Math.sin(elapsed * 0.35) * 0.08
      this._head.rotation.z  = Math.sin(elapsed * 0.22) * 0.025
    }

    // Arms: typing motion when active
    if (this._armL && this._armR) {
      if (isActive) {
        const tL =  Math.sin(elapsed * ACTIVE_BOB_SPEED * 1.2) * 0.2
        const tR = -Math.sin(elapsed * ACTIVE_BOB_SPEED * 1.2) * 0.2
        this._armL.rotation.x = tL
        this._armR.rotation.x = tR
      } else {
        this._armL.rotation.x = Math.sin(elapsed * 0.45) * 0.04
        this._armR.rotation.x = Math.sin(elapsed * 0.45 + 1.2) * 0.04
      }
    }

    // Status dot pulse
    if (this._dotMat) {
      this._dotMat.emissiveIntensity = 0.6 + Math.sin(elapsed * 3.0) * 0.35
    }
  }

  // ── Raycasting ────────────────────────────────────────────────────────────
  owns(obj: THREE.Object3D): boolean {
    return this._meshes.includes(obj as THREE.Mesh)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  dispose(): void {
    if (this._taskTimeout)   clearTimeout(this._taskTimeout)
    if (this._speechTimeout) clearTimeout(this._speechTimeout)
    this.scene.remove(this.group)
    if (this._nameTagDiv.parentNode) this._nameTagDiv.remove()
    if (this._speechDiv.parentNode)  this._speechDiv.remove()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _project(
    camera: THREE.Camera,
    worldPos: THREE.Vector3,
    rect: DOMRect,
  ): { x: number; y: number; visible: boolean } {
    const vec = worldPos.clone().project(camera)
    const x = (vec.x + 1) / 2 * rect.width  + rect.left
    const y = -(vec.y - 1) / 2 * rect.height + rect.top
    const visible = vec.z < 1
      && x > rect.left - 50 && x < rect.right  + 50
      && y > rect.top  - 80 && y < rect.bottom + 50
    return { x, y, visible }
  }

  private _scheduleNextTask(): void {
    const delay = TASK_MIN_MS + Math.random() * (TASK_MAX_MS - TASK_MIN_MS)
    this._taskTimeout = setTimeout(() => this._executeTask(), delay)
  }

  private _executeTask(): void {
    this._status = 'active'

    const pool = STATUS_MESSAGES[this._agentStatus] ?? GENERIC_MESSAGES
    const allMessages = [...pool, ...GENERIC_MESSAGES]
    const msg = allMessages[Math.floor(Math.random() * allMessages.length)]

    // Style bubble with agent color
    const inner = this._speechDiv.querySelector<HTMLElement>('.zita-bubble-inner')
    if (inner) {
      inner.style.borderColor = `${this.agentColor}66`
      inner.style.boxShadow   = `0 0 20px ${this.agentColor}33, inset 0 1px 0 rgba(255,255,255,0.1)`
    }
    const tail = this._speechDiv.querySelector<HTMLElement>('.zita-bubble-tail')
    if (tail) tail.style.borderTopColor = `rgba(16,22,40,0.97)`

    this._speechText.textContent = msg
    this._speechDiv.style.display = 'block'
    this._speechVisible = true

    if (this._speechTimeout) clearTimeout(this._speechTimeout)
    this._speechTimeout = setTimeout(() => {
      this._speechVisible = false
      this._speechDiv.style.display = 'none'
      this._status = 'done'

      setTimeout(() => {
        this._status = 'idle'
        this._scheduleNextTask()
      }, 2000 + Math.random() * 1500)
    }, SPEECH_DURATION)
  }

}
