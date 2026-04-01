/**
 * ui.js — Interface do usuário do AI Office
 * Gerencia: painel lateral, log, detalhes do agente,
 * painel de configuração (API + N8N), painel de chat,
 * modal de criação de agente.
 */

import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { ROLE_MESSAGES, getRoleLabel, getRoleEmoji } from './agents.js';
import {
  callAgentAPI,
  callN8NWebhook,
  testConnection,
  saveAgentConfig,
  loadAgentConfig,
  PROVIDER_MODELS,
} from './api.js';
import {
  logActivity,
  saveAgentConfigDB,
  subscribeToLog,
} from './supabase.js';

const MAX_LOG_ENTRIES = 20;

export class UI {
  constructor(avatars, deskPositions, scene, camera, renderer) {
    this.avatars       = avatars;
    this.deskPositions = deskPositions;
    this.scene         = scene;
    this.camera        = camera;
    this.renderer      = renderer;

    // Agente atualmente aberto nos painéis
    this._selectedAgent = null;
    this._chatAgent     = null;
    this._configAgent   = null;

    // Histórico de chat por agente (em memória)
    this._chatHistories = {};

    // Intervalos de webhook automático
    this._webhookIntervals = {};

    this._logEntryCount = 0;

    this._setupSidebar();
    this._setupAgentDetails();
    this._setupConfigPanel();
    this._setupChatPanel();
    this._setupModal();
    this._setupAddAgentButton();
    this._listenAgentEvents();
    this._renderAgentsList();

    // Inscreve-se no log realtime do Supabase
    subscribeToLog((entry) => {
      // Ignora entradas do próprio agente local (já adicionadas pelo evento agent-task)
      const isLocal = this.avatars.some(av => av.name === entry.agent_name);
      if (!isLocal) {
        // Cria objeto avatar fake só para renderizar no log
        const fakeAgent = {
          name:  entry.agent_name,
          emoji: entry.agent_emoji || '🤖',
          color: entry.agent_color || 0x4a9eff,
        };
        this._addLogEntryRaw(fakeAgent, entry.message, true);
      }
    });
  }

  // ─── Loop principal ───────────────────────────────────────────────────

  update(camera) {
    this.avatars.forEach(av => av.updateHTML(camera));
    this._frameCount = (this._frameCount || 0) + 1;
    if (this._frameCount % 15 === 0) {
      this._updateStats();
      this._refreshAgentsList();
    }
    if (this._selectedAgent) this._refreshAgentDetails(this._selectedAgent);
  }

  // ─── Painel lateral ───────────────────────────────────────────────────

  _setupSidebar() {
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });
  }

  // ─── Lista de agentes ─────────────────────────────────────────────────

  _renderAgentsList() {
    const list = document.getElementById('agents-list');
    list.innerHTML = '';
    this.avatars.forEach(av => list.appendChild(this._createAgentCard(av)));
    document.getElementById('total-agents').textContent = this.avatars.length;
  }

  _refreshAgentsList() {
    const cards = document.getElementById('agents-list').querySelectorAll('.agent-card');
    cards.forEach((card, i) => {
      const av = this.avatars[i];
      if (!av) return;
      const s = card.querySelector('.agent-card-status');
      s.className = 'agent-card-status ' + this._statusClass(av.status);
      s.textContent = this._statusLabel(av.status);
      card.classList.toggle('active-card', av.status === 'active');
      const t = card.querySelector('.agent-card-tasks');
      if (t) t.textContent = `${av.tasksCompleted} tarefas`;
    });
  }

  _createAgentCard(av) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    const colorHex = '#' + av.color.toString(16).padStart(6, '0');
    card.innerHTML = `
      <div class="agent-card-dot" style="background:${colorHex};box-shadow:0 0 6px ${colorHex}44"></div>
      <div class="agent-card-info">
        <div class="agent-card-name">${av.emoji} ${av.name}</div>
        <div class="agent-card-role">${av.role}</div>
      </div>
      <div class="agent-card-actions">
        <button class="card-btn-chat" title="Chat">💬</button>
        <button class="card-btn-config" title="Configurar">⚙️</button>
      </div>
      <span class="agent-card-status ${this._statusClass(av.status)}">${this._statusLabel(av.status)}</span>
      <span class="agent-card-tasks">${av.tasksCompleted} tarefas</span>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('card-btn-chat')) {
        this.openChat(av);
      } else if (e.target.classList.contains('card-btn-config')) {
        this.openConfig(av);
      } else {
        this.showAgentDetails(av);
        this._focusAvatar(av);
      }
    });
    return card;
  }

  // ─── Log de atividades ────────────────────────────────────────────────

  _listenAgentEvents() {
    window.addEventListener('agent-task', (e) => {
      this._addLogEntry(e.detail.agent, e.detail.message);
    });
  }

  _addLogEntry(agent, message) {
    this._addLogEntryRaw(agent, message, false);
    // Persiste no Supabase de forma assíncrona (não bloqueia)
    logActivity(agent, message).catch(() => {});
  }

  _addLogEntryRaw(agent, message, isRemote = false) {
    const colorHex = '#' + agent.color.toString(16).padStart(6, '0');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.borderLeftColor = colorHex;
    entry.innerHTML = `
      <div class="log-dot" style="background:${colorHex}"></div>
      <div class="log-content">
        <span class="log-agent">${agent.emoji} ${agent.name}${isRemote ? ' <span style="font-size:0.6rem;color:#50566e">↗ remoto</span>' : ''}</span>
        <div class="log-message">${message}</div>
      </div>
      <span class="log-time">${time}</span>
    `;
    const log = document.getElementById('activity-log');
    log.insertBefore(entry, log.firstChild);
    this._logEntryCount++;
    while (log.children.length > MAX_LOG_ENTRIES) log.removeChild(log.lastChild);
    document.getElementById('log-count').textContent = `(${Math.min(this._logEntryCount, MAX_LOG_ENTRIES)})`;
    this._updateStats();
  }

  _updateStats() {
    document.getElementById('total-tasks').textContent =
      this.avatars.reduce((a, av) => a + av.tasksCompleted, 0);
  }

  // ─── Detalhes do agente ───────────────────────────────────────────────

  _setupAgentDetails() {
    document.getElementById('agent-details-close').addEventListener('click', () => {
      document.getElementById('agent-details').classList.add('hidden');
      this._selectedAgent = null;
    });
    document.getElementById('btn-open-chat').addEventListener('click', () => {
      if (this._selectedAgent) this.openChat(this._selectedAgent);
    });
    document.getElementById('btn-open-config').addEventListener('click', () => {
      if (this._selectedAgent) this.openConfig(this._selectedAgent);
    });
    document.getElementById('btn-trigger-webhook').addEventListener('click', () => {
      if (this._selectedAgent) this._triggerWebhook(this._selectedAgent, 'manual');
    });
  }

  showAgentDetails(agent) {
    this._selectedAgent = agent;
    document.getElementById('agent-details').classList.remove('hidden');
    this._refreshAgentDetails(agent);
  }

  _refreshAgentDetails(agent) {
    const colorHex = '#' + agent.color.toString(16).padStart(6, '0');
    document.getElementById('agent-details-avatar-color').style.background =
      `radial-gradient(circle at 40% 35%, ${colorHex}cc, ${colorHex}44)`;
    document.getElementById('agent-details-name').textContent = `${agent.emoji} ${agent.name}`;
    document.getElementById('agent-details-role').textContent = agent.role;
    document.getElementById('detail-tasks-count').textContent = agent.tasksCompleted;
    document.getElementById('detail-status').textContent = this._statusLabel(agent.status);
    document.getElementById('detail-status').style.color = this._statusColor(agent.status);
    document.getElementById('detail-last-action').textContent = agent.lastMessage;

    const cfg = loadAgentConfig(agent.name);
    document.getElementById('detail-api-status').textContent =
      cfg.provider ? `✅ ${cfg.provider} / ${cfg.model || 'padrão'}` : '—';
    document.getElementById('detail-n8n-status').textContent =
      cfg.webhookUrl ? '✅ configurado' : '—';

    // Mostra/esconde botão N8N
    document.getElementById('btn-trigger-webhook').style.display =
      cfg.webhookUrl ? 'block' : 'none';
  }

  // ─── Painel de Configuração ───────────────────────────────────────────

  _setupConfigPanel() {
    const panel = document.getElementById('config-panel');

    document.getElementById('config-panel-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      this._configAgent = null;
    });

    // Atualiza modelos ao mudar provedor
    document.getElementById('cfg-provider').addEventListener('change', (e) => {
      this._updateModelPresets(e.target.value);
      const needsUrl = e.target.value === 'ollama' || e.target.value === 'flowise';
      document.getElementById('cfg-group-base-url').style.display = needsUrl ? 'block' : 'none';
      // Atualiza label do campo URL
      const label = document.querySelector('#cfg-group-base-url label');
      if (label) label.textContent = e.target.value === 'flowise' ? 'URL do Endpoint' : 'Base URL (Ollama)';
    });

    // Toggle visibilidade das senhas
    document.getElementById('btn-toggle-apikey').addEventListener('click', () => {
      this._togglePassword('cfg-api-key', 'btn-toggle-apikey');
    });
    document.getElementById('btn-toggle-secret').addEventListener('click', () => {
      this._togglePassword('cfg-webhook-secret', 'btn-toggle-secret');
    });

    // Presets de cor
    panel.querySelectorAll('.color-preset').forEach(p => {
      p.addEventListener('click', () => {
        document.getElementById('cfg-color').value = p.dataset.color;
      });
    });

    // Testar API
    document.getElementById('btn-test-api').addEventListener('click', async () => {
      const btn = document.getElementById('btn-test-api');
      const result = document.getElementById('api-test-result');
      btn.disabled = true;
      btn.textContent = '⏳ Testando...';
      result.textContent = '';
      try {
        const cfg = this._readConfigForm();
        if (!cfg.provider) { result.textContent = '⚠️ Selecione um provedor primeiro.'; return; }
        const { ok, message } = await testConnection(cfg);
        result.textContent = message;
        result.className = ok ? 'test-ok' : 'test-fail';
      } catch(e) {
        result.textContent = `❌ ${e.message}`;
        result.className = 'test-fail';
      } finally {
        btn.disabled = false;
        btn.textContent = '🔌 Testar Conexão';
      }
    });

    // Disparar webhook
    document.getElementById('btn-test-webhook').addEventListener('click', async () => {
      if (!this._configAgent) return;
      await this._triggerWebhook(this._configAgent, 'test', document.getElementById('webhook-test-result'));
    });

    // Salvar
    document.getElementById('btn-save-config').addEventListener('click', () => {
      if (!this._configAgent) return;
      const cfg = this._readConfigForm();
      saveAgentConfig(this._configAgent.name, cfg);
      this._applyConfigToAvatar(this._configAgent, cfg);
      this._setupWebhookInterval(this._configAgent, cfg);

      // Persiste no Supabase (sem campos sensíveis)
      saveAgentConfigDB(this._configAgent.name, cfg).catch(() => {});

      const btn = document.getElementById('btn-save-config');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar Configurações'; }, 2000);

      if (this._selectedAgent?.name === this._configAgent.name) {
        this._refreshAgentDetails(this._configAgent);
      }
    });
  }

  openConfig(agent) {
    this._configAgent = agent;
    const cfg = loadAgentConfig(agent.name);
    const colorHex = '#' + agent.color.toString(16).padStart(6, '0');

    document.getElementById('config-panel-emoji').textContent = agent.emoji;
    document.getElementById('config-panel-name').textContent = agent.name;

    // Preenche campos
    document.getElementById('cfg-name').value          = agent.name;
    document.getElementById('cfg-role').value          = agent.role;
    document.getElementById('cfg-color').value         = colorHex;
    document.getElementById('cfg-system-prompt').value = cfg.systemPrompt || this._defaultSystemPrompt(agent);
    document.getElementById('cfg-provider').value      = cfg.provider || '';
    document.getElementById('cfg-api-key').value       = cfg.apiKey || '';
    document.getElementById('cfg-model').value         = cfg.model || '';
    document.getElementById('cfg-base-url').value      = cfg.baseUrl || '';
    document.getElementById('cfg-webhook-url').value   = cfg.webhookUrl || '';
    document.getElementById('cfg-webhook-secret').value = cfg.webhookSecret || '';
    document.getElementById('cfg-webhook-interval').value = cfg.webhookInterval || '0';

    this._updateModelPresets(cfg.provider || '');
    const needsUrl = cfg.provider === 'ollama' || cfg.provider === 'flowise';
    document.getElementById('cfg-group-base-url').style.display = needsUrl ? 'block' : 'none';
    const label = document.querySelector('#cfg-group-base-url label');
    if (label) label.textContent = cfg.provider === 'flowise' ? 'URL do Endpoint' : 'Base URL (Ollama)';

    document.getElementById('api-test-result').textContent = '';
    document.getElementById('webhook-test-result').textContent = '';

    document.getElementById('config-panel').classList.remove('hidden');
  }

  _readConfigForm() {
    return {
      provider:        document.getElementById('cfg-provider').value,
      apiKey:          document.getElementById('cfg-api-key').value.trim(),
      model:           document.getElementById('cfg-model').value.trim(),
      baseUrl:         document.getElementById('cfg-base-url').value.trim(),
      systemPrompt:    document.getElementById('cfg-system-prompt').value.trim(),
      webhookUrl:      document.getElementById('cfg-webhook-url').value.trim(),
      webhookSecret:   document.getElementById('cfg-webhook-secret').value.trim(),
      webhookInterval: parseInt(document.getElementById('cfg-webhook-interval').value) || 0,
    };
  }

  _applyConfigToAvatar(agent, cfg) {
    // Atualiza nome/cargo se mudou
    const newName = document.getElementById('cfg-name').value.trim();
    const newRole = document.getElementById('cfg-role').value.trim();
    if (newName) agent.name = newName;
    if (newRole) agent.role = newRole;

    // Atualiza cor
    const colorHex = document.getElementById('cfg-color').value;
    const colorNum = parseInt(colorHex.replace('#', ''), 16);
    agent.setColor(colorNum);

    // Atualiza nametag HTML
    if (agent._nameTagDiv) {
      agent._nameTagDiv.querySelector('.name-tag-name').textContent = agent.name;
      agent._nameTagDiv.querySelector('.name-tag-role').textContent = agent.role;
    }
  }

  _updateModelPresets(provider) {
    const container = document.getElementById('model-presets');
    container.innerHTML = '';
    const models = PROVIDER_MODELS[provider] || [];
    models.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'model-preset-btn';
      btn.textContent = m;
      btn.addEventListener('click', () => {
        document.getElementById('cfg-model').value = m;
      });
      container.appendChild(btn);
    });
  }

  _defaultSystemPrompt(agent) {
    const prompts = {
      'Prospecção': `Você é ${agent.name}, um agente especializado em prospecção de leads B2B. Ajude a identificar e qualificar potenciais clientes, analise perfis de empresas e sugira estratégias de abordagem.`,
      'CRM':        `Você é ${agent.name}, especializado em CRM e qualificação de leads. Ajude a gerenciar o pipeline de vendas, qualificar oportunidades e acompanhar o ciclo de vendas.`,
      'Financeiro': `Você é ${agent.name}, um agente financeiro. Ajude com análises de fluxo de caixa, relatórios financeiros, conciliações e previsões de receita.`,
      'Marketing':  `Você é ${agent.name}, especializado em marketing digital e redes sociais. Crie conteúdo, analise métricas de engajamento e sugira estratégias de marketing.`,
    };
    return prompts[agent.role] || `Você é ${agent.name}, um agente de IA do escritório virtual. Seja prestativo e profissional.`;
  }

  // ─── N8N Webhook ──────────────────────────────────────────────────────

  async _triggerWebhook(agent, action = 'task', resultEl = null) {
    const cfg = loadAgentConfig(agent.name);
    if (!cfg.webhookUrl) {
      if (resultEl) { resultEl.textContent = '⚠️ Nenhum webhook configurado.'; resultEl.className = 'test-fail'; }
      return;
    }

    agent.status = 'active';
    if (resultEl) { resultEl.textContent = '⏳ Disparando...'; resultEl.className = ''; }

    try {
      const message = await callN8NWebhook(
        { url: cfg.webhookUrl, secret: cfg.webhookSecret },
        { agent: agent.name, role: agent.role, action }
      );

      agent.lastMessage = message;
      agent.tasksCompleted++;
      agent.status = 'done';

      // Mostra no balão de fala
      agent._speechText.textContent = message;
      agent._speechDiv.style.display = 'block';
      agent.speechVisible = true;
      setTimeout(() => {
        agent.speechVisible = false;
        agent._speechDiv.style.display = 'none';
        agent.status = 'idle';
      }, 7000);

      window.dispatchEvent(new CustomEvent('agent-task', { detail: { agent, message } }));

      if (resultEl) { resultEl.textContent = `✅ N8N respondeu: "${message.substring(0, 80)}"`;  resultEl.className = 'test-ok'; }
    } catch(e) {
      agent.status = 'idle';
      if (resultEl) { resultEl.textContent = `❌ ${e.message}`; resultEl.className = 'test-fail'; }
      console.error('[N8N webhook]', e);
    }
  }

  _setupWebhookInterval(agent, cfg) {
    // Cancela intervalo anterior deste agente
    if (this._webhookIntervals[agent.name]) {
      clearInterval(this._webhookIntervals[agent.name]);
      delete this._webhookIntervals[agent.name];
    }
    if (cfg.webhookInterval > 0 && cfg.webhookUrl) {
      this._webhookIntervals[agent.name] = setInterval(() => {
        this._triggerWebhook(agent, 'auto');
      }, cfg.webhookInterval * 1000);
    }
  }

  // ─── Painel de Chat ───────────────────────────────────────────────────

  _setupChatPanel() {
    document.getElementById('chat-panel-close').addEventListener('click', () => {
      document.getElementById('chat-panel').classList.add('hidden');
      this._chatAgent = null;
    });

    document.getElementById('btn-clear-chat').addEventListener('click', () => {
      if (this._chatAgent) {
        this._chatHistories[this._chatAgent.name] = [];
        document.getElementById('chat-messages').innerHTML = '';
      }
    });

    const input = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send-chat');

    // Auto-resize do textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Enter envia (Shift+Enter = nova linha)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendChatMessage();
      }
    });

    btnSend.addEventListener('click', () => this._sendChatMessage());
  }

  openChat(agent) {
    this._chatAgent = agent;
    const colorHex = '#' + agent.color.toString(16).padStart(6, '0');
    const cfg = loadAgentConfig(agent.name);

    document.getElementById('chat-agent-dot').style.background = colorHex;
    document.getElementById('chat-agent-dot').style.boxShadow = `0 0 8px ${colorHex}`;
    document.getElementById('chat-agent-name').textContent = `${agent.emoji} ${agent.name}`;
    document.getElementById('chat-agent-model').textContent =
      cfg.provider ? `${cfg.provider} · ${cfg.model || 'padrão'}` :
      (cfg.webhookUrl ? 'N8N Webhook' : 'Sem API — configure em ⚙️');

    // Renderiza histórico existente
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.innerHTML = '';
    const history = this._chatHistories[agent.name] || [];
    history.forEach(m => this._appendChatBubble(m.role, m.content, agent));

    if (history.length === 0) {
      this._appendChatBubble('system', `Olá! Sou ${agent.name}, agente de ${agent.role}. Como posso ajudar?`, agent);
    }

    document.getElementById('chat-status').textContent = '';
    document.getElementById('chat-input').value = '';
    document.getElementById('chat-input').style.height = 'auto';
    document.getElementById('chat-panel').classList.remove('hidden');
    document.getElementById('chat-input').focus();
  }

  async _sendChatMessage() {
    const agent = this._chatAgent;
    if (!agent) return;

    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    const cfg = loadAgentConfig(agent.name);

    // Inicializa histórico
    if (!this._chatHistories[agent.name]) this._chatHistories[agent.name] = [];
    const history = this._chatHistories[agent.name];

    // Mostra mensagem do usuário
    this._appendChatBubble('user', text, agent);
    history.push({ role: 'user', content: text });
    input.value = '';
    input.style.height = 'auto';

    const status = document.getElementById('chat-status');
    const btnSend = document.getElementById('btn-send-chat');
    status.textContent = '⏳ Digitando...';
    btnSend.disabled = true;

    try {
      let reply;

      if (cfg.provider) {
        // Chama API de IA configurada
        reply = await callAgentAPI(cfg, history, cfg.systemPrompt || this._defaultSystemPrompt(agent));
      } else if (cfg.webhookUrl) {
        // Envia para N8N webhook com a mensagem do usuário
        reply = await callN8NWebhook(
          { url: cfg.webhookUrl, secret: cfg.webhookSecret },
          { agent: agent.name, role: agent.role, action: 'chat', message: text }
        );
      } else {
        reply = `Configure uma API ou webhook N8N para ${agent.name} em ⚙️ Configurar para que eu responda com IA real.`;
      }

      history.push({ role: 'assistant', content: reply });
      this._appendChatBubble('assistant', reply, agent);

      // Limita histórico a 30 mensagens (15 trocas)
      if (history.length > 30) history.splice(0, 2);

    } catch(e) {
      this._appendChatBubble('error', `❌ Erro: ${e.message}`, agent);
    } finally {
      status.textContent = '';
      btnSend.disabled = false;
    }
  }

  _appendChatBubble(role, content, agent) {
    const messagesEl = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${role}`;

    if (role === 'user') {
      bubble.innerHTML = `<div class="bubble-content">${this._escapeHtml(content)}</div>`;
    } else if (role === 'assistant') {
      const colorHex = '#' + agent.color.toString(16).padStart(6, '0');
      bubble.innerHTML = `
        <div class="bubble-avatar" style="background:${colorHex}">${agent.emoji}</div>
        <div class="bubble-content">${this._escapeHtml(content)}</div>
      `;
    } else if (role === 'system') {
      bubble.innerHTML = `<div class="bubble-content bubble-system">${content}</div>`;
    } else {
      bubble.innerHTML = `<div class="bubble-content bubble-error">${content}</div>`;
    }

    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ─── Modal: Adicionar Agente ──────────────────────────────────────────

  _setupAddAgentButton() {
    document.getElementById('btn-add-agent').addEventListener('click', () => this._openModal());
  }

  _setupModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeModal(); });
    document.getElementById('modal-close').addEventListener('click', () => this._closeModal());

    document.getElementById('input-agent-role').addEventListener('change', (e) => {
      document.getElementById('form-group-custom').style.display =
        e.target.value === 'custom' ? 'block' : 'none';
    });

    document.querySelectorAll('#modal .color-preset').forEach(p => {
      p.addEventListener('click', () => {
        document.getElementById('input-agent-color').value = p.dataset.color;
      });
    });

    document.getElementById('form-add-agent').addEventListener('submit', (e) => {
      e.preventDefault();
      this._createNewAgent();
    });
  }

  _openModal()  { document.getElementById('modal-overlay').classList.remove('hidden'); document.getElementById('input-agent-name').focus(); }
  _closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); document.getElementById('form-add-agent').reset(); document.getElementById('form-group-custom').style.display = 'none'; }

  _createNewAgent() {
    const name    = document.getElementById('input-agent-name').value.trim();
    const roleKey = document.getElementById('input-agent-role').value;
    const colorHex = document.getElementById('input-agent-color').value;
    const customMsgs = document.getElementById('input-agent-messages').value;
    if (!name) return;

    const colorNum = parseInt(colorHex.replace('#', ''), 16);
    let messages = ROLE_MESSAGES[roleKey] || ROLE_MESSAGES.custom;
    if (roleKey === 'custom' && customMsgs.trim()) {
      messages = customMsgs.split('\n').map(m => m.trim()).filter(Boolean);
    }

    const deskIndex = this.avatars.length;
    if (deskIndex >= this.deskPositions.length) { alert('Não há mesas disponíveis!'); return; }
    const deskPos = this.deskPositions[deskIndex];

    const avatar = new Avatar(this.scene, {
      name, role: getRoleLabel(roleKey), emoji: getRoleEmoji(roleKey),
      color: colorNum, messages,
      position: new THREE.Vector3(deskPos.x, 0, deskPos.z),
      deskAngle: deskPos.angle,
    });

    this.avatars.push(avatar);
    document.getElementById('agents-list').appendChild(this._createAgentCard(avatar));
    document.getElementById('total-agents').textContent = this.avatars.length;
    this._closeModal();
    this.showAgentDetails(avatar);
    this._addLogEntry(avatar, `${name} entrou no escritório!`);
  }

  // ─── Foco na câmera ───────────────────────────────────────────────────

  _focusAvatar(agent) {
    const target = agent.position.clone();
    const angle = agent.deskAngle + Math.PI;
    target.x += Math.sin(angle) * 3;
    target.z += Math.cos(angle) * 3;
    target.y = 1.65;
    let frames = 0;
    const startPos = this.camera.position.clone();
    const animFocus = () => {
      frames++;
      const ease = 1 - Math.pow(1 - Math.min(frames / 50, 1), 3);
      this.camera.position.lerpVectors(startPos, target, ease);
      const lookAt = agent.group.position.clone(); lookAt.y = 1.65;
      this.camera.lookAt(lookAt);
      if (frames < 50) requestAnimationFrame(animFocus);
    };
    requestAnimationFrame(animFocus);
  }

  // ─── Utilitários ──────────────────────────────────────────────────────

  _statusClass(s) { return { idle: 'status-idle', active: 'status-active', done: 'status-done' }[s] || 'status-idle'; }
  _statusLabel(s) { return { idle: 'Idle', active: 'Ativo', done: 'Concluído' }[s] || 'Idle'; }
  _statusColor(s) { return { idle: '#50566e', active: '#44cc88', done: '#4a9eff' }[s] || '#50566e'; }

  _togglePassword(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
  }

  _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/\n/g, '<br>');
  }
}
