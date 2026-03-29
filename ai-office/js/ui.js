/**
 * ui.js — Interface do usuário do AI Office
 * Gerencia: painel lateral, log de atividades, detalhes do agente,
 * modal de criação de agente, contadores e atualizações de HTML.
 */

import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { ROLE_MESSAGES, getRoleLabel, getRoleEmoji } from './agents.js';

// Número máximo de entradas no log
const MAX_LOG_ENTRIES = 20;

export class UI {
  /**
   * @param {Avatar[]} avatars      Lista de avatares existentes
   * @param {Array}    deskPositions Posições disponíveis para novas mesas
   * @param {THREE.Scene}  scene
   * @param {THREE.Camera} camera
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(avatars, deskPositions, scene, camera, renderer) {
    this.avatars       = avatars;
    this.deskPositions = deskPositions;
    this.scene         = scene;
    this.camera        = camera;
    this.renderer      = renderer;

    // Elementos do DOM
    this._agentsList    = document.getElementById('agents-list');
    this._activityLog   = document.getElementById('activity-log');
    this._logCount      = document.getElementById('log-count');
    this._totalTasks    = document.getElementById('total-tasks');
    this._totalAgents   = document.getElementById('total-agents');
    this._agentDetails  = document.getElementById('agent-details');
    this._modalOverlay  = document.getElementById('modal-overlay');

    // Agente selecionado para o painel de detalhes
    this._selectedAgent = null;

    // Contador de logs adicionados
    this._logEntryCount = 0;

    this._setupSidebar();
    this._setupAgentDetails();
    this._setupModal();
    this._setupAddAgentButton();
    this._listenAgentEvents();

    // Renderiza painel inicial
    this._renderAgentsList();
  }

  // ─── Loop de atualização (chamado a cada frame) ────────────────────────

  /**
   * Atualiza posições HTML dos balões/nametags e o painel de stats.
   * @param {THREE.Camera} camera
   */
  update(camera) {
    // Atualiza posição dos elementos HTML de cada avatar
    this.avatars.forEach(av => av.updateHTML(camera));

    // Atualiza stats do HUD com debounce leve (a cada ~15 frames)
    this._frameCount = (this._frameCount || 0) + 1;
    if (this._frameCount % 15 === 0) {
      this._updateStats();
      this._refreshAgentsList();
    }

    // Atualiza painel de detalhes se aberto
    if (this._selectedAgent) {
      this._refreshAgentDetails(this._selectedAgent);
    }
  }

  // ─── Painel lateral ───────────────────────────────────────────────────

  _setupSidebar() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // ─── Lista de agentes ─────────────────────────────────────────────────

  _renderAgentsList() {
    this._agentsList.innerHTML = '';
    this.avatars.forEach(av => {
      const card = this._createAgentCard(av);
      this._agentsList.appendChild(card);
    });
    this._totalAgents.textContent = this.avatars.length;
  }

  _refreshAgentsList() {
    const cards = this._agentsList.querySelectorAll('.agent-card');
    cards.forEach((card, i) => {
      const av = this.avatars[i];
      if (!av) return;

      // Atualiza status badge
      const statusEl = card.querySelector('.agent-card-status');
      statusEl.className = 'agent-card-status ' + this._statusClass(av.status);
      statusEl.textContent = this._statusLabel(av.status);

      // Atualiza contador de tarefas
      const tasksEl = card.querySelector('.agent-card-tasks');
      if (tasksEl) tasksEl.textContent = `${av.tasksCompleted} tarefas`;

      // Destaca cartão ativo
      card.classList.toggle('active-card', av.status === 'active');
    });
  }

  _createAgentCard(av) {
    const card = document.createElement('div');
    card.className = 'agent-card';

    const colorHex = '#' + av.color.toString(16).padStart(6, '0');

    card.innerHTML = `
      <div class="agent-card-dot" style="background:${colorHex}; box-shadow: 0 0 6px ${colorHex}44"></div>
      <div class="agent-card-info">
        <div class="agent-card-name">${av.emoji} ${av.name}</div>
        <div class="agent-card-role">${av.role}</div>
      </div>
      <span class="agent-card-status ${this._statusClass(av.status)}">${this._statusLabel(av.status)}</span>
      <span class="agent-card-tasks">${av.tasksCompleted} tarefas</span>
    `;

    card.addEventListener('click', () => {
      this.showAgentDetails(av);
      // Move câmera para perto do avatar
      this._focusAvatar(av);
    });

    return card;
  }

  // ─── Log de atividades ────────────────────────────────────────────────

  _listenAgentEvents() {
    window.addEventListener('agent-task', (e) => {
      const { agent, message } = e.detail;
      this._addLogEntry(agent, message);
    });
  }

  _addLogEntry(agent, message) {
    const colorHex = '#' + agent.color.toString(16).padStart(6, '0');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.borderLeftColor = colorHex;
    entry.innerHTML = `
      <div class="log-dot" style="background:${colorHex}"></div>
      <div class="log-content">
        <span class="log-agent">${agent.emoji} ${agent.name}</span>
        <div class="log-message">${message}</div>
      </div>
      <span class="log-time">${time}</span>
    `;

    // Insere no topo do log
    this._activityLog.insertBefore(entry, this._activityLog.firstChild);

    // Limita número de entradas
    this._logEntryCount++;
    while (this._activityLog.children.length > MAX_LOG_ENTRIES) {
      this._activityLog.removeChild(this._activityLog.lastChild);
    }

    // Atualiza contador
    this._logCount.textContent = `(${Math.min(this._logEntryCount, MAX_LOG_ENTRIES)})`;

    // Atualiza total de tarefas
    this._updateStats();
  }

  _updateStats() {
    const total = this.avatars.reduce((acc, av) => acc + av.tasksCompleted, 0);
    this._totalTasks.textContent = total;
  }

  // ─── Painel de detalhes do agente ────────────────────────────────────

  _setupAgentDetails() {
    document.getElementById('agent-details-close').addEventListener('click', () => {
      this._agentDetails.classList.add('hidden');
      this._selectedAgent = null;
    });
  }

  /**
   * Abre o painel de detalhes para um agente específico.
   * @param {Avatar} agent
   */
  showAgentDetails(agent) {
    this._selectedAgent = agent;
    this._agentDetails.classList.remove('hidden');
    this._refreshAgentDetails(agent);
  }

  _refreshAgentDetails(agent) {
    const colorHex = '#' + agent.color.toString(16).padStart(6, '0');
    document.getElementById('agent-details-avatar-color').style.background =
      `radial-gradient(circle at 40% 35%, ${colorHex}cc, ${colorHex}44)`;
    document.getElementById('agent-details-name').textContent     = `${agent.emoji} ${agent.name}`;
    document.getElementById('agent-details-role').textContent     = agent.role;
    document.getElementById('detail-tasks-count').textContent     = agent.tasksCompleted;
    document.getElementById('detail-status').textContent          = this._statusLabel(agent.status);
    document.getElementById('detail-status').style.color          = this._statusColor(agent.status);
    document.getElementById('detail-last-action').textContent     = agent.lastMessage;
  }

  // ─── Modal: Adicionar Agente ──────────────────────────────────────────

  _setupAddAgentButton() {
    document.getElementById('btn-add-agent').addEventListener('click', () => {
      this._openModal();
    });
  }

  _setupModal() {
    const overlay = this._modalOverlay;
    const closeBtn = document.getElementById('modal-close');
    const form     = document.getElementById('form-add-agent');
    const roleSelect = document.getElementById('input-agent-role');
    const colorInput = document.getElementById('input-agent-color');
    const customGroup = document.getElementById('form-group-custom');

    // Fecha ao clicar fora
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeModal();
    });
    closeBtn.addEventListener('click', () => this._closeModal());

    // Mostra/esconde campo de mensagens custom
    roleSelect.addEventListener('change', () => {
      customGroup.style.display = roleSelect.value === 'custom' ? 'block' : 'none';
    });

    // Presets de cor
    document.querySelectorAll('.color-preset').forEach(preset => {
      preset.addEventListener('click', () => {
        colorInput.value = preset.dataset.color;
      });
    });

    // Submit do formulário
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._createNewAgent();
    });
  }

  _openModal() {
    this._modalOverlay.classList.remove('hidden');
    document.getElementById('input-agent-name').focus();
  }

  _closeModal() {
    this._modalOverlay.classList.add('hidden');
    document.getElementById('form-add-agent').reset();
    document.getElementById('form-group-custom').style.display = 'none';
  }

  _createNewAgent() {
    const name     = document.getElementById('input-agent-name').value.trim();
    const roleKey  = document.getElementById('input-agent-role').value;
    const colorHex = document.getElementById('input-agent-color').value;
    const customMsgs = document.getElementById('input-agent-messages').value;

    if (!name) return;

    // Converte cor hex para número Three.js
    const colorNum = parseInt(colorHex.replace('#', ''), 16);

    // Mensagens: customizadas ou padrão da função
    let messages = ROLE_MESSAGES[roleKey] || ROLE_MESSAGES.custom;
    if (roleKey === 'custom' && customMsgs.trim()) {
      messages = customMsgs.split('\n').map(m => m.trim()).filter(Boolean);
    }

    // Encontra próxima mesa disponível
    const deskIndex = this.avatars.length;
    if (deskIndex >= this.deskPositions.length) {
      alert('Não há mesas disponíveis! O escritório está cheio.');
      return;
    }

    const deskPos = this.deskPositions[deskIndex];

    // Cria o novo avatar
    const avatar = new Avatar(this.scene, {
      name,
      role:      getRoleLabel(roleKey),
      emoji:     getRoleEmoji(roleKey),
      color:     colorNum,
      messages,
      position:  new THREE.Vector3(deskPos.x, 0, deskPos.z),
      deskAngle: deskPos.angle,
    });

    this.avatars.push(avatar);

    // Adiciona cartão no painel
    const card = this._createAgentCard(avatar);
    this._agentsList.appendChild(card);
    this._totalAgents.textContent = this.avatars.length;

    // Fecha modal e mostra feedback
    this._closeModal();
    this.showAgentDetails(avatar);

    // Log de criação
    this._addLogEntry(avatar, `${name} entrou no escritório!`);
  }

  // ─── Foco de câmera no avatar ─────────────────────────────────────────

  /**
   * Suavemente reposiciona a câmera próxima ao avatar.
   * @param {Avatar} agent
   */
  _focusAvatar(agent) {
    const target = agent.position.clone();
    // Posiciona câmera 3 unidades atrás e 1.65 de altura
    const angle = agent.deskAngle + Math.PI; // oposto do avatar
    target.x += Math.sin(angle) * 3;
    target.z += Math.cos(angle) * 3;
    target.y = 1.65;

    // Animação suave com lerp (60 frames ~= 1s)
    let frames = 0;
    const startPos = this.camera.position.clone();

    const animFocus = () => {
      frames++;
      const t = Math.min(frames / 50, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      this.camera.position.lerpVectors(startPos, target, ease);

      // Olha para o avatar
      const lookAt = agent.group.position.clone();
      lookAt.y = 1.65;
      this.camera.lookAt(lookAt);

      if (frames < 50) requestAnimationFrame(animFocus);
    };
    requestAnimationFrame(animFocus);
  }

  // ─── Utilitários de status ────────────────────────────────────────────

  _statusClass(status) {
    return { idle: 'status-idle', active: 'status-active', done: 'status-done' }[status] || 'status-idle';
  }

  _statusLabel(status) {
    return { idle: 'Idle', active: 'Ativo', done: 'Concluído' }[status] || 'Idle';
  }

  _statusColor(status) {
    return { idle: '#50566e', active: '#44cc88', done: '#4a9eff' }[status] || '#50566e';
  }
}
