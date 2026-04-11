export type CompanyStatus = 'ativo' | 'suspenso' | 'cancelado'
export type UserRole = 'owner' | 'admin' | 'operator' | 'viewer'
export type AgentTipo = 'zeus' | 'subordinada' | 'especialista'
export type AgentStatus = 'online' | 'ocupada' | 'aguardando' | 'offline' | 'erro' | 'pausada'
export type TarefaStatus = 'pendente' | 'em_execucao' | 'concluida' | 'erro' | 'cancelada' | 'aguardando_aprovacao'
export type TarefaPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente'
export type MensagemRemetenteTipo = 'humano' | 'ia' | 'sistema' | 'zeus'

export interface Company {
  id: string
  nome: string
  slug: string
  plano: string
  status: CompanyStatus
  logo_url?: string
  configuracoes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  company_id: string
  nome: string
  email: string
  role: UserRole
  avatar_url?: string
  ultimo_acesso_at?: string
  ativo: boolean
  created_at: string
}

export interface IaAgent {
  id: string
  company_id: string
  nome: string
  descricao?: string
  funcao?: string
  tipo: AgentTipo
  avatar_url?: string
  cor_hex: string
  status: AgentStatus
  status_detalhe?: string
  integracao_tipo?: string
  integracao_url?: string
  integracao_config: Record<string, unknown>
  organograma_x: number
  organograma_y: number
  organograma_parent_id?: string
  capacidades: Record<string, boolean>
  personalidade: {
    tom: string
    idioma: string
    prompt_sistema: string
    temperatura: number
    max_tokens: number
  }
  criado_por?: string
  total_conversas: number
  total_tarefas_concluidas: number
  total_tarefas_erro: number
  uptime_segundos: number
  created_at: string
  updated_at: string
}

export interface IaConversa {
  id: string
  company_id: string
  agent_id: string
  iniciada_por?: string
  titulo?: string
  status: 'ativa' | 'concluida' | 'pausada' | 'erro'
  contexto: Record<string, unknown>
  resumo?: string
  total_mensagens: number
  total_tokens_usados: number
  custo_estimado_usd: number
  created_at: string
  updated_at: string
  encerrada_at?: string
}

export interface IaMensagem {
  id: string
  conversa_id: string
  company_id: string
  remetente_tipo: MensagemRemetenteTipo
  remetente_id?: string
  remetente_nome: string
  conteudo: string
  conteudo_tipo: string
  metadados: Record<string, unknown>
  acao_tipo?: string
  acao_status?: string
  acao_resultado?: Record<string, unknown>
  tokens_prompt: number
  tokens_resposta: number
  latencia_ms?: number
  modelo_usado?: string
  created_at: string
}

export interface IaTarefa {
  id: string
  company_id: string
  agent_id: string
  delegada_por_agent_id?: string
  delegada_por_profile_id?: string
  titulo: string
  descricao?: string
  instrucoes: Record<string, unknown>
  status: TarefaStatus
  prioridade: TarefaPrioridade
  executar_em?: string
  resultado?: string
  resultado_dados?: Record<string, unknown>
  erro_mensagem?: string
  progresso_pct: number
  iniciada_at?: string
  concluida_at?: string
  duracao_segundos?: number
  conversa_id?: string
  created_at: string
  updated_at: string
}

// ---- Tabela: audit_log ----
export interface AuditLog {
  id: string
  company_id?: string
  agent_id?: string
  user_id?: string
  acao: string
  detalhes?: Record<string, unknown>
  sucesso: boolean
  created_at: string
}

// ---- Database shape para Supabase client ----
export interface Database {
  public: {
    Tables: {
      companies: { Row: Company; Insert: Partial<Company>; Update: Partial<Company> }
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      ia_agents: { Row: IaAgent; Insert: Partial<IaAgent>; Update: Partial<IaAgent> }
      ia_tarefas: { Row: IaTarefa; Insert: Partial<IaTarefa>; Update: Partial<IaTarefa> }
      audit_log: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
