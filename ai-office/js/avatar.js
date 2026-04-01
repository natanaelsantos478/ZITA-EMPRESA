/**
 * avatar.js — Classe Avatar
 * Representa um agente de IA no escritório 3D.
 * Corpo low-poly, nome flutuante, balão de fala, animações.
 */

import * as THREE from 'three';

// ─── Constantes de animação ───────────────────────────────────────────────

const IDLE_BOB_SPEED    = 1.4;   // velocidade do balanço idle
const IDLE_BOB_RANGE    = 0.018; // amplitude do balanço idle
const ACTIVE_BOB_SPEED  = 3.5;   // velocidade quando ativo (digitando)
const ACTIVE_BOB_RANGE  = 0.04;  // amplitude quando ativo
const TASK_MIN_MS       = 5000;  // mínimo tempo entre tarefas (ms)
const TASK_MAX_MS       = 15000; // máximo tempo entre tarefas (ms)
const SPEECH_DURATION   = 6000;  // duração do balão de fala (ms)

export class Avatar {
  /**
   * @param {THREE.Scene} scene
   * @param {{
   *   name: string,
   *   role: string,
   *   color: number,
   *   emoji: string,
   *   messages: string[],
   *   position: THREE.Vector3,
   *   deskAngle: number
   * }} config
   */
  constructor(scene, config) {
    this.scene      = scene;
    this.name       = config.name;
    this.role       = config.role;
    this.color      = config.color;
    this.emoji      = config.emoji;
    this.messages   = config.messages;
    this.position   = config.position.clone();
    this.deskAngle    = config.deskAngle || 0;
    this.defaultConfig = config.defaultConfig || null;

    // Estado interno
    this.status         = 'idle';   // 'idle' | 'active' | 'done'
    this.tasksCompleted = 0;
    this.lastMessage    = '—';
    this.speechVisible  = false;
    this._speechTimeout = null;
    this._taskTimeout   = null;

    // Grupo principal
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.position.y = 0;
    // Avatares olham para a mesa (ângulo da mesa + 180° para ficar de frente)
    this.group.rotation.y = this.deskAngle + Math.PI;
    scene.add(this.group);

    // Meshes que compõem o avatar
    this._meshes = [];

    // Referências para animação
    this._body    = null;
    this._head    = null;
    this._armL    = null;
    this._armR    = null;
    this._nameTag = null; // div HTML 2D sobreposto via CSS3D simulado

    this._build();
    this._buildSpeechBubble();
    this._applyDefaultConfig();
    this._buildNameTag();
    this._scheduleNextTask();
  }

  // ─── Config padrão da API ─────────────────────────────────────────────

  /**
   * Salva defaultConfig no localStorage se o agente ainda não tiver
   * provider nem webhook configurado — preserva configurações manuais.
   */
  _applyDefaultConfig() {
    if (!this.defaultConfig) return;
    const LS_KEY = 'ai-office-agent-' + this.name;
    try {
      const existing = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      // Só aplica se não há provider nem webhookUrl configurado pelo usuário
      if (!existing.provider && !existing.webhookUrl) {
        localStorage.setItem(LS_KEY, JSON.stringify(this.defaultConfig));
      }
    } catch {
      localStorage.setItem(LS_KEY, JSON.stringify(this.defaultConfig));
    }
  }

  // ─── Construção do corpo ──────────────────────────────────────────────

  _build() {
    const c = this.color;
    const bodyMat  = new THREE.MeshLambertMaterial({ color: c });
    const headMat  = new THREE.MeshLambertMaterial({ color: c });
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x111318 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xfff0e8 });
    const shirtMat = new THREE.MeshLambertMaterial({ color: this._darken(c, 0.55) });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.22), shirtMat);
    torso.position.set(0, 1.12, 0);
    torso.castShadow = true;
    this.group.add(torso);
    this._meshes.push(torso);
    this._body = torso;

    // Quadril
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.2), bodyMat);
    hip.position.set(0, 0.84, 0);
    hip.castShadow = true;
    this.group.add(hip);
    this._meshes.push(hip);

    // Pernas (sentadas — inclinadas para frente em Z)
    const legMat = new THREE.MeshLambertMaterial({ color: this._darken(c, 0.4) });
    [[-0.12, 0], [0.12, 0]].forEach(([lx]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.38), legMat);
      leg.position.set(lx, 0.62, 0.18);
      leg.rotation.x = Math.PI / 2.5; // inclinação "sentado"
      leg.castShadow = true;
      this.group.add(leg);
      this._meshes.push(leg);

      // Pé/sapato
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), darkMat);
      foot.position.set(lx, 0.44, 0.42);
      this.group.add(foot);
      this._meshes.push(foot);
    });

    // Braços
    const armGeo = new THREE.BoxGeometry(0.1, 0.38, 0.1);
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-0.27, 1.08, 0.08);
    armL.castShadow = true;
    this.group.add(armL);
    this._meshes.push(armL);
    this._armL = armL;

    const armR = new THREE.Mesh(armGeo.clone(), shirtMat);
    armR.position.set(0.27, 1.08, 0.08);
    armR.castShadow = true;
    this.group.add(armR);
    this._meshes.push(armR);
    this._armR = armR;

    // Mãos
    const handGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const handL = new THREE.Mesh(handGeo, whiteMat);
    handL.position.set(-0.27, 0.88, 0.14);
    this.group.add(handL);
    this._meshes.push(handL);

    const handR = new THREE.Mesh(handGeo.clone(), whiteMat);
    handR.position.set(0.27, 0.88, 0.14);
    this.group.add(handR);
    this._meshes.push(handR);

    // Pescoço
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), whiteMat);
    neck.position.set(0, 1.42, 0);
    this.group.add(neck);
    this._meshes.push(neck);

    // Cabeça (cápsula simulada com esfera achatada)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), whiteMat);
    head.scale.set(1, 1.08, 0.92);
    head.position.set(0, 1.65, 0);
    head.castShadow = true;
    this.group.add(head);
    this._meshes.push(head);
    this._head = head;

    // Olhos
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
    [[-0.07, 0], [0.07, 0]].forEach(([ex]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
      eye.position.set(ex, 1.67, 0.16);
      this.group.add(eye);
      this._meshes.push(eye);
    });

    // Cabelo (caixa achatada no topo)
    const hairMat = new THREE.MeshLambertMaterial({ color: this._darken(c, 0.3) });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
    hair.position.set(0, 1.65, 0);
    hair.castShadow = true;
    this.group.add(hair);
    this._meshes.push(hair);

    // Badge de função (plaquinha pequena no peito)
    this._buildBadge(bodyMat);
  }

  _buildBadge(bodyMat) {
    const badgeMat = new THREE.MeshLambertMaterial({ color: this._lighten(this.color, 0.4) });
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), badgeMat);
    badge.position.set(0, 1.26, 0.12);
    this.group.add(badge);
    this._meshes.push(badge);
  }

  // ─── Balão de fala (sprite 2D em CSS sobreposto) ──────────────────────

  _buildSpeechBubble() {
    // Cria um elemento HTML para o balão de fala
    const div = document.createElement('div');
    div.className = 'speech-bubble';
    div.style.display = 'none';
    div.innerHTML = `<span class="speech-text"></span>`;
    document.body.appendChild(div);
    this._speechDiv    = div;
    this._speechText   = div.querySelector('.speech-text');
  }

  // ─── Etiqueta de nome (elemento HTML posicionado via projeção 3D) ───────

  _buildNameTag() {
    const div = document.createElement('div');
    div.className = 'name-tag';
    div.innerHTML = `
      <span class="name-tag-emoji">${this.emoji}</span>
      <span class="name-tag-name">${this.name}</span>
      <span class="name-tag-role">${this.role}</span>
    `;
    document.body.appendChild(div);
    this._nameTagDiv = div;

    // Injeta estilos inline uma vez
    if (!document.getElementById('avatar-styles')) {
      const style = document.createElement('style');
      style.id = 'avatar-styles';
      style.textContent = `
        .name-tag {
          position: fixed;
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: none;
          transform: translate(-50%, -100%);
          z-index: 50;
          gap: 1px;
        }
        .name-tag-emoji { font-size: 1rem; line-height: 1; }
        .name-tag-name {
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          color: #e8eaf0;
          background: rgba(13,15,20,0.82);
          padding: 2px 7px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          white-space: nowrap;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          backdrop-filter: blur(4px);
        }
        .name-tag-role {
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 0.62rem;
          color: #8890a8;
          background: rgba(13,15,20,0.7);
          padding: 1px 5px;
          border-radius: 8px;
          white-space: nowrap;
        }
        .speech-bubble {
          position: fixed;
          max-width: 200px;
          pointer-events: none;
          transform: translate(-50%, -100%);
          z-index: 51;
        }
        .speech-text {
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
          animation: bubblePop 0.2s ease;
        }
        @keyframes bubblePop {
          from { transform: scale(0.85); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        .speech-bubble::after {
          content: '';
          display: block;
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 8px solid rgba(20,26,40,0.93);
          margin: 0 auto;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ─── Atualiza posições HTML projetadas ───────────────────────────────

  /**
   * Converte posição 3D para posição 2D na tela.
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} worldPos
   * @param {number} sidebarWidth
   * @returns {{ x: number, y: number, visible: boolean }}
   */
  _project(camera, worldPos, sidebarWidth) {
    const vec = worldPos.clone().project(camera);
    const screenW = window.innerWidth - sidebarWidth;
    const screenH = window.innerHeight;
    const x = (vec.x + 1) / 2 * screenW;
    const y = -(vec.y - 1) / 2 * screenH;
    const visible = vec.z < 1 && x > -50 && x < screenW + 50 && y > -50 && y < screenH + 50;
    return { x, y, visible };
  }

  /**
   * Atualiza posição dos elementos HTML (chamado a cada frame).
   * @param {THREE.Camera} camera
   */
  updateHTML(camera) {
    const sidebarWidth = window.innerWidth > 700 ? 320 : 0;

    // Posição acima da cabeça
    const namePos = this.group.position.clone();
    namePos.y += 2.1;
    const np = this._project(camera, namePos, sidebarWidth);

    if (np.visible) {
      this._nameTagDiv.style.display = 'flex';
      this._nameTagDiv.style.left = np.x + 'px';
      this._nameTagDiv.style.top  = np.y + 'px';
    } else {
      this._nameTagDiv.style.display = 'none';
    }

    // Posição do balão de fala (ainda mais acima)
    if (this.speechVisible) {
      const bubblePos = this.group.position.clone();
      bubblePos.y += 2.6;
      const bp = this._project(camera, bubblePos, sidebarWidth);
      if (bp.visible) {
        this._speechDiv.style.display = 'block';
        this._speechDiv.style.left = bp.x + 'px';
        this._speechDiv.style.top  = bp.y + 'px';
      } else {
        this._speechDiv.style.display = 'none';
      }
    }
  }

  // ─── Animações ────────────────────────────────────────────────────────

  /**
   * Atualiza animações a cada frame.
   * @param {number} delta  Tempo desde o último frame (s)
   * @param {number} elapsed Tempo total decorrido (s)
   */
  update(delta, elapsed) {
    const isActive = this.status === 'active';
    const speed    = isActive ? ACTIVE_BOB_SPEED  : IDLE_BOB_SPEED;
    const range    = isActive ? ACTIVE_BOB_RANGE  : IDLE_BOB_RANGE;

    // Balanço vertical do corpo
    const bob = Math.sin(elapsed * speed) * range;
    if (this._body) this._body.position.y = 1.12 + bob;
    if (this._head) {
      this._head.position.y = 1.65 + bob * 0.5;
      // Leve rotação da cabeça
      this._head.rotation.y = Math.sin(elapsed * 0.4) * 0.06;
    }

    // Animação dos braços (digitação quando ativo)
    if (this._armL && this._armR) {
      if (isActive) {
        // Digitação: braços alternam subindo e descendo
        const tL =  Math.sin(elapsed * ACTIVE_BOB_SPEED * 1.3) * 0.15;
        const tR = -Math.sin(elapsed * ACTIVE_BOB_SPEED * 1.3) * 0.15;
        this._armL.rotation.x = tL;
        this._armR.rotation.x = tR;
      } else {
        // Idle: braços quase parados
        this._armL.rotation.x = Math.sin(elapsed * 0.5) * 0.02;
        this._armR.rotation.x = Math.sin(elapsed * 0.5 + 1) * 0.02;
      }
    }
  }

  // ─── Lógica de tarefas ────────────────────────────────────────────────

  /**
   * Agenda a próxima execução de tarefa.
   */
  _scheduleNextTask() {
    const delay = TASK_MIN_MS + Math.random() * (TASK_MAX_MS - TASK_MIN_MS);
    this._taskTimeout = setTimeout(() => this._executeTask(), delay);
  }

  /**
   * Executa uma tarefa: muda status, exibe mensagem, atualiza contador.
   */
  _executeTask() {
    this.status = 'active';
    const msg = this.messages[Math.floor(Math.random() * this.messages.length)];
    this.lastMessage = msg;

    // Exibe balão de fala
    this._speechText.textContent = msg;
    this._speechDiv.style.display = 'block';
    this.speechVisible = true;

    // Emite evento customizado para o painel de log
    window.dispatchEvent(new CustomEvent('agent-task', {
      detail: { agent: this, message: msg }
    }));

    // Após a duração do balão, conclui a tarefa
    if (this._speechTimeout) clearTimeout(this._speechTimeout);
    this._speechTimeout = setTimeout(() => {
      this.tasksCompleted++;
      this.status = 'done';
      this.speechVisible = false;
      this._speechDiv.style.display = 'none';

      // Após breve pausa, volta ao idle e agenda próxima
      setTimeout(() => {
        this.status = 'idle';
        this._scheduleNextTask();
      }, 1500);
    }, SPEECH_DURATION);
  }

  // ─── Utilitários ──────────────────────────────────────────────────────

  /**
   * Coleta todos os meshes do avatar para raycasting.
   * @param {THREE.Mesh[]} target Array onde adicionar os meshes
   */
  collectMeshes(target) {
    this._meshes.forEach(m => target.push(m));
  }

  /**
   * Verifica se o avatar é dono de um determinado objeto.
   * @param {THREE.Object3D} obj
   * @returns {boolean}
   */
  owns(obj) {
    return this._meshes.includes(obj);
  }

  /**
   * Atualiza a cor do avatar em tempo real.
   * @param {number} newColor Cor hex (ex: 0xff6699)
   */
  setColor(newColor) {
    this.color = newColor;
    const mat = new THREE.MeshLambertMaterial({ color: newColor });
    // Atualiza torso, cabelo, badge (índices 0, 13, 14 — torso e derivados)
    this._meshes.forEach(mesh => {
      if (mesh.material?.color) {
        const c = mesh.material.color.getHex();
        // Substitui materiais que eram coloridos (não preto/branco)
        if (c !== 0x111318 && c !== 0xfff0e8 && c !== 0x151820 && c !== 0x222233) {
          mesh.material = new THREE.MeshLambertMaterial({
            color: this._computeColorVariant(newColor, mesh)
          });
        }
      }
    });
  }

  _computeColorVariant(base, mesh) {
    const c = mesh.material?.color?.getHex?.() || base;
    if (c === base) return base;
    return this._darken(base, 0.55);
  }

  /**
   * Remove o avatar da cena e limpa os elementos HTML.
   */
  dispose() {
    clearTimeout(this._taskTimeout);
    clearTimeout(this._speechTimeout);
    this.scene.remove(this.group);
    this._nameTagDiv.remove();
    this._speechDiv.remove();
  }

  // ─── Utilitários de cor ───────────────────────────────────────────────

  /**
   * Escurece uma cor hex por um fator (0=preto, 1=original).
   */
  _darken(hex, factor) {
    const r = ((hex >> 16) & 0xff) * factor;
    const g = ((hex >> 8)  & 0xff) * factor;
    const b = (hex          & 0xff) * factor;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  /**
   * Clareia uma cor hex por um fator (1=original, >1=mais claro).
   */
  _lighten(hex, factor) {
    const r = Math.min(255, ((hex >> 16) & 0xff) * factor);
    const g = Math.min(255, ((hex >> 8)  & 0xff) * factor);
    const b = Math.min(255, (hex          & 0xff) * factor);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
}
