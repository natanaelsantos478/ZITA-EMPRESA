/**
 * controls.js — Controles de câmera FPS
 * WASD para mover, mouse para olhar, touch para mobile.
 * Usa Pointer Lock API para captura do mouse.
 */

import * as THREE from 'three';

// ─── Constantes ───────────────────────────────────────────────────────────

const MOVE_SPEED    = 6.0;    // velocidade de movimento (unidades/s)
const SPRINT_MULT   = 2.0;    // multiplicador de sprint (Shift)
const SENSITIVITY   = 0.0018; // sensibilidade do mouse
const EYE_HEIGHT    = 1.65;   // altura dos olhos
const FLOOR_Y       = EYE_HEIGHT;
const ROOM_LIMIT    = 14.5;   // limite das paredes (evita atravessar)
const INERTIA       = 0.82;   // inércia do movimento (0 = travado, 1 = desliza)
const TOUCH_SENS    = 0.004;  // sensibilidade do toque (mobile)

export class Controls {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLCanvasElement} canvas
   * @param {THREE.Scene} scene
   */
  constructor(camera, canvas, scene) {
    this.camera  = camera;
    this.canvas  = canvas;
    this.scene   = scene;
    this.enabled = false;

    // Estado das teclas pressionadas
    this.keys = {
      w: false, a: false, s: false, d: false,
      shift: false,
    };

    // Velocidade atual (com inércia)
    this._velocity = new THREE.Vector3();

    // Direção da câmera
    this._yaw   = 0;  // rotação horizontal (Y)
    this._pitch = 0;  // rotação vertical (X)

    // Vetores reutilizáveis
    this._forward = new THREE.Vector3();
    this._right   = new THREE.Vector3();
    this._move    = new THREE.Vector3();

    this._setupPointerLock();
    this._setupKeyboard();
    this._setupMobile();
  }

  // ─── Pointer Lock ─────────────────────────────────────────────────────

  _setupPointerLock() {
    const canvas = this.canvas;

    // Ao clicar no canvas, tenta capturar o mouse
    canvas.addEventListener('click', () => {
      if (!this.enabled) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.enabled = document.pointerLockElement === canvas;
      document.getElementById('crosshair').classList.toggle('hidden', !this.enabled);
      // Mostra/esconde hint de controles
      document.getElementById('controls-hint').style.opacity = this.enabled ? '0' : '1';
    });

    document.addEventListener('pointerlockerror', () => {
      console.warn('[Controls] Pointer Lock negado pelo navegador.');
    });

    // Movimento do mouse
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      this._yaw   -= e.movementX * SENSITIVITY;
      this._pitch -= e.movementY * SENSITIVITY;
      // Limita o pitch para não girar demais para cima/baixo
      this._pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this._pitch));
      this._applyRotation();
    });

    // ESC para sair
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.enabled) {
        document.exitPointerLock();
      }
    });
  }

  _applyRotation() {
    // Aplica yaw e pitch separadamente para manter câmera horizontal
    const euler = new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  // ─── Teclado ──────────────────────────────────────────────────────────

  _setupKeyboard() {
    const keyMap = {
      KeyW: 'w', ArrowUp:    'w',
      KeyS: 's', ArrowDown:  's',
      KeyA: 'a', ArrowLeft:  'a',
      KeyD: 'd', ArrowRight: 'd',
    };

    document.addEventListener('keydown', (e) => {
      if (keyMap[e.code]) this.keys[keyMap[e.code]] = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.shift = true;
    });

    document.addEventListener('keyup', (e) => {
      if (keyMap[e.code]) this.keys[keyMap[e.code]] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.shift = false;
    });
  }

  // ─── Mobile: Joystick virtual e swipe de câmera ────────────────────────

  _setupMobile() {
    // Detecta se é touch device
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) return;

    const touchOverlay = document.getElementById('touch-overlay');
    const joystickContainer = document.getElementById('joystick-container');

    // Mostra overlay de toque
    touchOverlay.classList.remove('hidden');
    touchOverlay.addEventListener('click', () => {
      touchOverlay.classList.add('hidden');
      joystickContainer.classList.remove('hidden');
      this.enabled = true;
      document.getElementById('controls-hint').style.opacity = '0';
    });

    const joystickBase  = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');

    // Estado do joystick
    let joyActive = false;
    let joyStartX = 0, joyStartY = 0;
    let joyDX = 0, joyDY = 0;
    const JOY_RADIUS = 26;

    joystickBase.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const rect = joystickBase.getBoundingClientRect();
      joyStartX = rect.left + rect.width / 2;
      joyStartY = rect.top  + rect.height / 2;
      joyActive = true;
    }, { passive: false });

    joystickBase.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!joyActive) return;
      const t = e.touches[0];
      let dx = t.clientX - joyStartX;
      let dy = t.clientY - joyStartY;
      const dist = Math.hypot(dx, dy);
      if (dist > JOY_RADIUS) {
        dx = (dx / dist) * JOY_RADIUS;
        dy = (dy / dist) * JOY_RADIUS;
      }
      joyDX = dx / JOY_RADIUS;
      joyDY = dy / JOY_RADIUS;
      // Atualiza visual do thumb
      joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }, { passive: false });

    joystickBase.addEventListener('touchend', () => {
      joyActive = false;
      joyDX = 0; joyDY = 0;
      joystickThumb.style.transform = 'translate(-50%, -50%)';
    });

    // Swipe na tela direita para câmera
    let lookStartX = 0, lookStartY = 0;
    let lookActive = false;

    document.addEventListener('touchstart', (e) => {
      // Só ativa se não for no joystick
      if (joystickBase.contains(e.target)) return;
      const t = e.touches[0];
      // Swipe só no lado direito da tela
      if (t.clientX > window.innerWidth * 0.3) {
        lookStartX = t.clientX;
        lookStartY = t.clientY;
        lookActive = true;
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (!lookActive || !this.enabled) return;
      const t = e.touches[0];
      if (joystickBase.contains(e.target)) return;
      const dx = t.clientX - lookStartX;
      const dy = t.clientY - lookStartY;
      this._yaw   -= dx * TOUCH_SENS;
      this._pitch -= dy * TOUCH_SENS;
      this._pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this._pitch));
      this._applyRotation();
      lookStartX = t.clientX;
      lookStartY = t.clientY;
    });

    document.addEventListener('touchend', () => { lookActive = false; });

    // Guarda referência para usar no update
    this._mobile = { joyDX: () => joyDX, joyDY: () => joyDY };
  }

  // ─── Loop de atualização ──────────────────────────────────────────────

  /**
   * Chamado a cada frame para atualizar posição da câmera.
   * @param {number} delta Tempo desde o último frame (s)
   */
  update(delta) {
    if (!this.enabled) return;

    // Velocidade base (sprint com Shift)
    const speed = MOVE_SPEED * (this.keys.shift ? SPRINT_MULT : 1);

    // Obtém direção da câmera projetada no plano horizontal
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();

    // Vetor direita
    this._right.crossVectors(this._forward, new THREE.Vector3(0, 1, 0));

    // Acumulador de movimento
    this._move.set(0, 0, 0);

    if (this.keys.w) this._move.addScaledVector(this._forward,  1);
    if (this.keys.s) this._move.addScaledVector(this._forward, -1);
    if (this.keys.a) this._move.addScaledVector(this._right,   -1);
    if (this.keys.d) this._move.addScaledVector(this._right,    1);

    // Joystick mobile
    if (this._mobile) {
      const jx = this._mobile.joyDX();
      const jy = this._mobile.joyDY();
      this._move.addScaledVector(this._forward, -jy);
      this._move.addScaledVector(this._right,    jx);
    }

    // Normaliza se houver movimento diagonal
    if (this._move.lengthSq() > 0) this._move.normalize();

    // Aplica inércia
    this._velocity.lerp(
      this._move.multiplyScalar(speed),
      1 - Math.pow(INERTIA, delta * 60)
    );

    // Aplica deslocamento
    this.camera.position.addScaledVector(this._velocity, delta);

    // Mantém altura constante
    this.camera.position.y = FLOOR_Y;

    // Colisão com paredes (limita dentro do escritório)
    this.camera.position.x = Math.max(-ROOM_LIMIT, Math.min(ROOM_LIMIT, this.camera.position.x));
    this.camera.position.z = Math.max(-12.5, Math.min(12.5, this.camera.position.z));
  }
}
