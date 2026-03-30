/**
 * api.js — Camada de acesso às APIs de IA e webhooks N8N
 * Suporta: OpenAI, Anthropic, Google Gemini, Ollama, N8N Webhook
 */

// ─── Modelos padrão por provedor ──────────────────────────────────────────

export const PROVIDER_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  anthropic: [
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
  ],
  gemini: [
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  ollama: [
    'llama3.2',
    'llama3.1',
    'mistral',
    'qwen2.5',
    'phi4',
  ],
};

// ─── Chamada principal (roteador) ─────────────────────────────────────────

/**
 * Chama a API configurada do agente com o histórico de mensagens.
 * @param {Object} config   Configuração do agente (provider, apiKey, model, etc.)
 * @param {Array}  messages Array de { role: 'user'|'assistant', content: string }
 * @param {string} systemPrompt Prompt de sistema do agente
 * @returns {Promise<string>} Resposta textual do modelo
 */
export async function callAgentAPI(config, messages, systemPrompt) {
  if (!config.provider) throw new Error('Nenhum provedor configurado para este agente.');

  switch (config.provider) {
    case 'openai':    return callOpenAI(config, messages, systemPrompt);
    case 'anthropic': return callAnthropic(config, messages, systemPrompt);
    case 'gemini':    return callGemini(config, messages, systemPrompt);
    case 'ollama':    return callOllama(config, messages, systemPrompt);
    default: throw new Error(`Provedor desconhecido: ${config.provider}`);
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────

async function callOpenAI(config, messages, systemPrompt) {
  const apiMessages = [];
  if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
  apiMessages.push(...messages);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: apiMessages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI erro ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ─── Anthropic (Claude) ───────────────────────────────────────────────────

async function callAnthropic(config, messages, systemPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model || 'claude-haiku-4-5-20251001',
      system: systemPrompt || '',
      messages,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic erro ${res.status}`);
  }

  const data = await res.json();
  return data.content[0].text.trim();
}

// ─── Google Gemini ────────────────────────────────────────────────────────

async function callGemini(config, messages, systemPrompt) {
  const model = config.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  // Converte mensagens para formato Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = { contents };
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini erro ${res.status}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// ─── Ollama (local) ───────────────────────────────────────────────────────

async function callOllama(config, messages, systemPrompt) {
  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'http://localhost:11434';
  const apiMessages = [];
  if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
  apiMessages.push(...messages);

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model || 'llama3.2',
      messages: apiMessages,
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Ollama erro ${res.status} — verifique se está rodando`);

  const data = await res.json();
  return data.message.content.trim();
}

// ─── N8N Webhook ─────────────────────────────────────────────────────────

/**
 * Dispara o webhook N8N do agente com o contexto da tarefa.
 * @param {Object} webhookConfig   { url, secret }
 * @param {Object} payload         Dados enviados ao N8N
 * @returns {Promise<string>}      Mensagem de retorno do N8N
 */
export async function callN8NWebhook(webhookConfig, payload) {
  if (!webhookConfig.url) throw new Error('URL do webhook N8N não configurada.');

  const headers = { 'Content-Type': 'application/json' };
  if (webhookConfig.secret) {
    headers['X-Webhook-Secret'] = webhookConfig.secret;
  }

  const res = await fetch(webhookConfig.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agent:     payload.agent,
      role:      payload.role,
      action:    payload.action || 'task',
      message:   payload.message || '',
      timestamp: new Date().toISOString(),
      ...payload.extra,
    }),
  });

  if (!res.ok) throw new Error(`Webhook N8N retornou ${res.status}`);

  // Tenta ler resposta como JSON ou texto
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    // Aceita: { message }, { result }, { output }, { text }, ou qualquer string no json
    return json.message || json.result || json.output || json.text ||
           (typeof json === 'string' ? json : JSON.stringify(json));
  } catch {
    return text || 'Tarefa executada com sucesso via N8N.';
  }
}

// ─── Teste de conexão ─────────────────────────────────────────────────────

/**
 * Testa a conexão com o provedor de IA configurado.
 * @param {Object} config
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testConnection(config) {
  try {
    const reply = await callAgentAPI(
      config,
      [{ role: 'user', content: 'Responda apenas: OK' }],
      'Você é um assistente. Responda apenas "OK" a esta mensagem de teste.'
    );
    return { ok: true, message: `✅ Conectado! Resposta: "${reply.substring(0, 60)}"` };
  } catch (e) {
    return { ok: false, message: `❌ Erro: ${e.message}` };
  }
}

// ─── Persistência no localStorage ────────────────────────────────────────

const LS_PREFIX = 'ai-office-agent-';

/**
 * Salva configuração do agente no localStorage.
 * @param {string} agentName
 * @param {Object} config
 */
export function saveAgentConfig(agentName, config) {
  localStorage.setItem(LS_PREFIX + agentName, JSON.stringify(config));
}

/**
 * Carrega configuração do agente do localStorage.
 * @param {string} agentName
 * @returns {Object}
 */
export function loadAgentConfig(agentName) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + agentName);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
