/**
 * agents.js — Definição dos agentes de IA iniciais
 * Cada entrada define nome, função, cor, emoji e mensagens de atividade.
 * Para adicionar novos agentes, basta adicionar uma nova entrada no array.
 */

/**
 * Configurações dos 4 agentes iniciais do escritório.
 * @type {Array<{
 *   name: string,
 *   role: string,
 *   emoji: string,
 *   color: number,
 *   messages: string[]
 * }>}
 */
export const AGENT_CONFIGS = [

  // ── 1. Dante — Prospecção de Leads ──────────────────────────────────────
  {
    name:  'Dante',
    role:  'Prospecção',
    emoji: '🔍',
    color: 0x3377ff,   // Azul vibrante
    // Config padrão de API — salva no localStorage na primeira inicialização
    // (pode ser sobrescrita pelo usuário via painel ⚙️)
    defaultConfig: {
      provider:     'flowise',
      baseUrl:      'https://celebrated-optimism-production-12cf.up.railway.app/api/v1/prediction/bc00c689-1938-4cdc-bc85-bfb2c7d336d0',
      systemPrompt: 'Você é Dante, especialista em prospecção de leads B2B. Ajude a identificar e qualificar potenciais clientes.',
    },
    messages: [
      'Encontrei 3 leads no LinkedIn...',
      'Analisando perfil: João Silva, CEO...',
      'Coletando contatos do setor tech...',
      'Validando emails encontrados...',
      'Mapeando decisores na empresa XYZ...',
      'Verificando perfil do prospect...',
      'Exportando lista de 12 leads qualificados...',
      'Buscando empresas com 50-200 funcionários...',
      'Filtrando por setor: tecnologia & SaaS...',
      'Identificando contatos no C-Level...',
    ],
  },

  // ── 2. Luna — Qualificação CRM ──────────────────────────────────────────
  {
    name:  'Luna',
    role:  'CRM',
    emoji: '🎯',
    color: 0x33cc77,   // Verde esmeralda
    messages: [
      'Qualificando lead: score 87/100',
      'Atualizando pipeline de vendas...',
      'Enviando proposta para cliente...',
      'Agendando follow-up para amanhã...',
      'Registrando reunião no CRM...',
      'Analisando probabilidade de fechamento: 73%',
      'Movendo deal para fase de negociação...',
      'Criando tarefa de acompanhamento...',
      'Sincronizando dados com Salesforce...',
      'Gerando relatório de pipeline semanal...',
    ],
  },

  // ── 3. Rex — Financeiro ─────────────────────────────────────────────────
  {
    name:  'Rex',
    role:  'Financeiro',
    emoji: '💰',
    color: 0xffcc00,   // Dourado
    messages: [
      'Gerando relatório mensal...',
      'Analisando fluxo de caixa...',
      'Conciliando transações...',
      'Alertando sobre prazo de pagamento...',
      'Calculando margem de contribuição...',
      'Reconciliando extrato bancário...',
      'Prevendo receita do próximo trimestre...',
      'Identificando despesas recorrentes...',
      'Gerando DRE automatizado...',
      'Emitindo nota fiscal eletrônica...',
    ],
  },

  // ── 4. Mia — Marketing & Instagram ─────────────────────────────────────
  {
    name:  'Mia',
    role:  'Marketing',
    emoji: '📱',
    color: 0xff66aa,   // Rosa vibrante
    messages: [
      'Criando post para Instagram...',
      'Gerando legenda com IA...',
      'Agendando publicação para 18h...',
      'Analisando engajamento dos posts...',
      'Respondendo comentários...',
      'Criando stories com template de marca...',
      'Otimizando hashtags do post...',
      'Gerando relatório de alcance semanal...',
      'Testando variação A/B do criativo...',
      'Programando campanha de email marketing...',
    ],
  },

];

// ─── Mensagens por tipo de função (para novos agentes customizados) ───────

/**
 * Mapa de mensagens padrão por tipo de função.
 * Usado quando o usuário cria um agente via modal "Adicionar Agente".
 */
export const ROLE_MESSAGES = {
  prospeccao: [
    'Buscando novos leads...',
    'Analisando perfil de prospect...',
    'Coletando dados de contato...',
    'Validando informações do lead...',
    'Filtrando leads por setor...',
  ],
  crm: [
    'Atualizando pipeline...',
    'Qualificando oportunidade...',
    'Registrando interação com cliente...',
    'Agendando próxima ação...',
    'Analisando probabilidade de fechamento...',
  ],
  financeiro: [
    'Processando transação...',
    'Analisando relatório financeiro...',
    'Conciliando contas...',
    'Gerando previsão de receita...',
    'Verificando compliance fiscal...',
  ],
  marketing: [
    'Criando conteúdo para redes sociais...',
    'Analisando métricas de campanha...',
    'Agendando publicação...',
    'Otimizando anúncios...',
    'Gerando relatório de engajamento...',
  ],
  custom: [
    'Executando tarefa personalizada...',
    'Processando dados...',
    'Analisando informações...',
    'Gerando resultados...',
    'Concluindo operação...',
  ],
};

/**
 * Retorna label amigável da função.
 * @param {string} roleKey
 * @returns {string}
 */
export function getRoleLabel(roleKey) {
  const labels = {
    prospeccao: '🔍 Prospecção',
    crm:        '🎯 CRM',
    financeiro: '💰 Financeiro',
    marketing:  '📱 Marketing',
    custom:     '⚙️ Custom',
  };
  return labels[roleKey] || roleKey;
}

/**
 * Retorna emoji padrão para a função.
 * @param {string} roleKey
 * @returns {string}
 */
export function getRoleEmoji(roleKey) {
  const emojis = {
    prospeccao: '🔍',
    crm:        '🎯',
    financeiro: '💰',
    marketing:  '📱',
    custom:     '⚙️',
  };
  return emojis[roleKey] || '🤖';
}
