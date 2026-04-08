// ============================================================
// Database types — refletem as 8 tabelas do Supabase
// company_id: a0000000-0000-0000-0000-000000000001
// ============================================================

export type AgentStatus = 'online' | 'busy' | 'offline' | 'error'
export type AgentRole =
  | 'zeus'
  | 'prospeccao'
  | 'crm'
  | 'financeiro'
  | 'marketing'
  | 'atendimento'
  | 'custom'

export type MessageRole = 'user' | 'assistant' | 'system'
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer'

// ---- Tabela: companies ----
export interface Company {
  id: string
  name: string
  slug: string
  plan: string
  created_at: string
}

// ---- Tabela: profiles ----
export interface Profile {
  id: string
  company_id: string
  email: string
  display_name: string | null
  role: UserRole
  avatar_url: string | null
  created_at: string
}

// ---- Tabela: ia_agents ----
export interface IAAgent {
  id: string
  company_id: string
  name: string
  role: AgentRole
  description: string | null
  emoji: string
  color: string
  status: AgentStatus
  is_zeus: boolean
  organograma_x: number
  organograma_y: number
  parent_id: string | null
  system_prompt: string | null
  provider: string | null
  model: string | null
  // api_key nunca retorna do DB (masked)
  webhook_url: string | null
  webhook_interval: number
  tasks_done: number
  last_active_at: string | null
  created_at: string
  updated_at: string
}

// ---- Tabela: chat_messages ----
export interface ChatMessage {
  id: string
  company_id: string
  agent_id: string
  session_id: string
  role: MessageRole
  content: string
  is_action: boolean
  action_type: string | null
  action_data: Record<string, unknown> | null
  created_at: string
}

// ---- Tabela: tasks ----
export interface Task {
  id: string
  company_id: string
  agent_id: string
  title: string
  description: string | null
  status: TaskStatus
  result: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

// ---- Tabela: activity_log ----
export interface ActivityLog {
  id: string
  company_id: string
  agent_id: string | null
  user_id: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

// ---- Tabela: agent_metrics ----
export interface AgentMetric {
  id: string
  company_id: string
  agent_id: string
  date: string
  tasks_done: number
  messages_sent: number
  avg_response_ms: number | null
  errors: number
}

// ---- Tabela: integrations ----
export interface Integration {
  id: string
  company_id: string
  agent_id: string | null
  type: string
  name: string
  config: Record<string, unknown>
  // api_key nunca retorna do DB
  is_active: boolean
  created_at: string
}

// ---- Database shape para Supabase client ----
export interface Database {
  public: {
    Tables: {
      companies: { Row: Company; Insert: Partial<Company>; Update: Partial<Company> }
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      ia_agents: { Row: IAAgent; Insert: Partial<IAAgent>; Update: Partial<IAAgent> }
      chat_messages: { Row: ChatMessage; Insert: Partial<ChatMessage>; Update: Partial<ChatMessage> }
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> }
      activity_log: { Row: ActivityLog; Insert: Partial<ActivityLog>; Update: Partial<ActivityLog> }
      agent_metrics: { Row: AgentMetric; Insert: Partial<AgentMetric>; Update: Partial<AgentMetric> }
      integrations: { Row: Integration; Insert: Partial<Integration>; Update: Partial<Integration> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
