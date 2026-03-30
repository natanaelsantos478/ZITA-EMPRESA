/**
 * supabase.js — Integração com Supabase
 * Persistência do log de atividades e configurações dos agentes.
 * Realtime: log aparece em todas as abas/usuários simultaneamente.
 *
 * SEGURANÇA: API keys dos provedores de IA NUNCA são enviadas ao Supabase.
 * Apenas dados não-sensíveis são persistidos (nomes, funções, webhook URLs, logs).
 */

const SUPABASE_URL     = 'https://fyearatapvhgyreifniq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5ZWFyYXRhcHZoZ3lyZWlmbmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzE3MjQsImV4cCI6MjA5MDQwNzcyNH0.lFY0cftG6SaIRQM_ZWI3WbMwiS27zcxAINvPpU1P6c4';

// ─── SQL para criar as tabelas (execute no Supabase SQL Editor) ────────────
//
// create table if not exists activity_log (
//   id         uuid default gen_random_uuid() primary key,
//   agent_name text not null,
//   agent_color integer,
//   agent_emoji text,
//   message    text not null,
//   created_at timestamptz default now()
// );
//
// create table if not exists agent_configs (
//   id              uuid default gen_random_uuid() primary key,
//   agent_name      text unique not null,
//   role            text,
//   color           integer,
//   webhook_url     text,
//   webhook_interval integer default 0,
//   system_prompt   text,
//   provider        text,
//   model           text,
//   updated_at      timestamptz default now()
// );
//
// alter table activity_log  enable row level security;
// alter table agent_configs enable row level security;
// create policy "anon all" on activity_log  for all using (true) with check (true);
// create policy "anon all" on agent_configs for all using (true) with check (true);
//
// ─────────────────────────────────────────────────────────────────────────────

// Cliente Supabase (via UMD global carregado no index.html)
let _supabase = null;

/**
 * Inicializa o cliente Supabase.
 * Chamado uma vez no startup pelo main.js.
 * @returns {boolean} true se inicializado com sucesso
 */
export function initSupabase() {
  try {
    // A lib Supabase JS expõe createClient via window.supabase (UMD build)
    if (typeof window.supabase === 'undefined') {
      console.warn('[Supabase] SDK não encontrado. Verifique o CDN no index.html.');
      return false;
    }
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.info('[Supabase] Cliente inicializado com sucesso.');
    return true;
  } catch (e) {
    console.error('[Supabase] Falha ao inicializar:', e);
    return false;
  }
}

/**
 * Retorna o cliente Supabase inicializado, ou null se falhou.
 */
export function getClient() { return _supabase; }

// ─── Log de Atividades ────────────────────────────────────────────────────

/**
 * Persiste uma entrada de log de atividade no Supabase.
 * @param {{ name: string, color: number, emoji: string }} agent
 * @param {string} message
 */
export async function logActivity(agent, message) {
  if (!_supabase) return;
  try {
    await _supabase.from('activity_log').insert({
      agent_name:  agent.name,
      agent_color: agent.color,
      agent_emoji: agent.emoji,
      message,
    });
  } catch (e) {
    console.warn('[Supabase] Erro ao salvar log:', e.message);
  }
}

/**
 * Busca as últimas N entradas do log.
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function fetchRecentLog(limit = 50) {
  if (!_supabase) return [];
  try {
    const { data, error } = await _supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[Supabase] Erro ao buscar log:', e.message);
    return [];
  }
}

/**
 * Inscreve-se em novas entradas do log em tempo real.
 * Chama callback(entry) a cada novo INSERT.
 * @param {Function} callback
 * @returns {Object} subscription (para cancelar com unsubscribe())
 */
export function subscribeToLog(callback) {
  if (!_supabase) return null;
  const channel = _supabase
    .channel('activity-log-realtime')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activity_log' },
      (payload) => callback(payload.new)
    )
    .subscribe();
  return channel;
}

// ─── Configurações dos Agentes ────────────────────────────────────────────

/**
 * Salva configuração não-sensível do agente no Supabase.
 * ATENÇÃO: apiKey e webhookSecret NÃO são enviados — ficam apenas no localStorage.
 * @param {string} agentName
 * @param {Object} config
 */
export async function saveAgentConfigDB(agentName, config) {
  if (!_supabase) return;
  try {
    // Remove campos sensíveis antes de enviar ao banco
    const { apiKey, webhookSecret, ...safeConfig } = config;
    await _supabase.from('agent_configs').upsert({
      agent_name:       agentName,
      role:             safeConfig.role || '',
      webhook_url:      safeConfig.webhookUrl || '',
      webhook_interval: safeConfig.webhookInterval || 0,
      system_prompt:    safeConfig.systemPrompt || '',
      provider:         safeConfig.provider || '',
      model:            safeConfig.model || '',
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'agent_name' });
  } catch (e) {
    console.warn('[Supabase] Erro ao salvar config:', e.message);
  }
}

/**
 * Carrega configuração do agente do Supabase.
 * Nota: campos sensíveis (apiKey, webhookSecret) vêm do localStorage, não do banco.
 * @param {string} agentName
 * @returns {Promise<Object>}
 */
export async function loadAgentConfigDB(agentName) {
  if (!_supabase) return {};
  try {
    const { data, error } = await _supabase
      .from('agent_configs')
      .select('*')
      .eq('agent_name', agentName)
      .single();
    if (error || !data) return {};
    return {
      role:            data.role,
      webhookUrl:      data.webhook_url,
      webhookInterval: data.webhook_interval,
      systemPrompt:    data.system_prompt,
      provider:        data.provider,
      model:           data.model,
    };
  } catch (e) {
    return {};
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────

/**
 * Testa a conexão com o Supabase.
 * @returns {Promise<boolean>}
 */
export async function testSupabaseConnection() {
  if (!_supabase) return false;
  try {
    const { error } = await _supabase.from('activity_log').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
