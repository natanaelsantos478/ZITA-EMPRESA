-- ============================================================
-- ZITA Escritório de IA — Schema completo
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Trigger helper: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Tabela: ia_agents
-- Todos os agentes de IA da empresa.
-- Zeus = agente principal hospedado no Flowise (24h)
-- Subordinadas/Especialistas = recebem ordens do Zeus,
--   chamam APIs diretamente, hospedadas no Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_agents (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL,
  nome                      TEXT NOT NULL,
  descricao                 TEXT,
  funcao                    TEXT,
  tipo                      TEXT NOT NULL DEFAULT 'subordinada'
                              CHECK (tipo IN ('zeus', 'subordinada', 'especialista')),
  avatar_url                TEXT,
  cor_hex                   TEXT NOT NULL DEFAULT '#4e5eff',
  status                    TEXT NOT NULL DEFAULT 'offline'
                              CHECK (status IN ('online','ocupada','aguardando','offline','erro','pausada')),
  status_detalhe            TEXT,

  -- Integração: link do agente (Flowise URL para Zeus, outras APIs para subordinadas)
  integracao_tipo           TEXT
                              CHECK (integracao_tipo IN ('flowise','n8n','make','openai','anthropic','webhook','custom','runway') OR integracao_tipo IS NULL),
  integracao_url            TEXT,
  integracao_config         JSONB NOT NULL DEFAULT '{}',

  -- Posição no organograma
  organograma_x             FLOAT NOT NULL DEFAULT 100,
  organograma_y             FLOAT NOT NULL DEFAULT 100,
  organograma_parent_id     UUID REFERENCES ia_agents(id) ON DELETE SET NULL,

  -- Funcionalidades habilitadas (capacidades)
  -- Ex: {"enviar_mensagem": true, "criar_tarefa": true, "receber_arquivo": false}
  capacidades               JSONB NOT NULL DEFAULT '{}',

  -- Personalidade de fala
  personalidade             JSONB NOT NULL DEFAULT '{
    "tom": "profissional",
    "idioma": "pt-BR",
    "prompt_sistema": "",
    "temperatura": 0.7,
    "max_tokens": 2048
  }',

  -- Modo de recebimento de arquivos
  modo_arquivo              TEXT NOT NULL DEFAULT 'none'
                              CHECK (modo_arquivo IN ('none','texto','pdf','imagem','qualquer')),

  -- Métricas acumuladas
  total_conversas           INTEGER NOT NULL DEFAULT 0,
  total_tarefas_concluidas  INTEGER NOT NULL DEFAULT 0,
  total_tarefas_erro        INTEGER NOT NULL DEFAULT 0,
  uptime_segundos           INTEGER NOT NULL DEFAULT 0,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_agents_company_id ON ia_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_ia_agents_tipo ON ia_agents(tipo);
CREATE INDEX IF NOT EXISTS idx_ia_agents_status ON ia_agents(status);

CREATE TRIGGER ia_agents_updated_at
  BEFORE UPDATE ON ia_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Tabela: ia_conversas
-- Sessões de conversa entre humano/sistema e um agente
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_conversas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL,
  agent_id              UUID NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  iniciada_por          UUID,  -- profile id (NULL = sistema)
  titulo                TEXT,
  status                TEXT NOT NULL DEFAULT 'ativa'
                          CHECK (status IN ('ativa','concluida','pausada','erro')),
  contexto              JSONB NOT NULL DEFAULT '{}',
  resumo                TEXT,
  total_mensagens       INTEGER NOT NULL DEFAULT 0,
  total_tokens_usados   INTEGER NOT NULL DEFAULT 0,
  custo_estimado_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ia_conversas_agent_id ON ia_conversas(agent_id);
CREATE INDEX IF NOT EXISTS idx_ia_conversas_company_id ON ia_conversas(company_id);

CREATE TRIGGER ia_conversas_updated_at
  BEFORE UPDATE ON ia_conversas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Tabela: ia_mensagens
-- Mensagens dentro de uma conversa
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_mensagens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id       UUID NOT NULL REFERENCES ia_conversas(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL,
  remetente_tipo    TEXT NOT NULL
                      CHECK (remetente_tipo IN ('humano','ia','sistema','zeus')),
  remetente_id      UUID,   -- profile id ou agent id
  remetente_nome    TEXT NOT NULL,
  conteudo          TEXT NOT NULL,
  conteudo_tipo     TEXT NOT NULL DEFAULT 'text',
  metadados         JSONB NOT NULL DEFAULT '{}',
  acao_tipo         TEXT,
  acao_status       TEXT,
  acao_resultado    JSONB,
  tokens_prompt     INTEGER NOT NULL DEFAULT 0,
  tokens_resposta   INTEGER NOT NULL DEFAULT 0,
  latencia_ms       INTEGER,
  modelo_usado      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_mensagens_conversa_id ON ia_mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_ia_mensagens_company_id ON ia_mensagens(company_id);

-- ============================================================
-- Tabela: ia_tarefas
-- Tarefas delegadas pelo Zeus a agentes subordinados
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_tarefas (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL,
  agent_id                  UUID NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  delegada_por_agent_id     UUID REFERENCES ia_agents(id) ON DELETE SET NULL,
  delegada_por_profile_id   UUID,
  titulo                    TEXT NOT NULL,
  descricao                 TEXT,
  instrucoes                JSONB NOT NULL DEFAULT '{}',
  status                    TEXT NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente','em_execucao','concluida','erro','cancelada','aguardando_aprovacao')),
  prioridade                TEXT NOT NULL DEFAULT 'normal'
                              CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  executar_em               TIMESTAMPTZ,
  resultado                 TEXT,
  resultado_dados           JSONB,
  erro_mensagem             TEXT,
  progresso_pct             INTEGER NOT NULL DEFAULT 0 CHECK (progresso_pct BETWEEN 0 AND 100),
  iniciada_at               TIMESTAMPTZ,
  concluida_at              TIMESTAMPTZ,
  duracao_segundos          INTEGER,
  conversa_id               UUID REFERENCES ia_conversas(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_tarefas_agent_id ON ia_tarefas(agent_id);
CREATE INDEX IF NOT EXISTS idx_ia_tarefas_company_id ON ia_tarefas(company_id);
CREATE INDEX IF NOT EXISTS idx_ia_tarefas_status ON ia_tarefas(status);

CREATE TRIGGER ia_tarefas_updated_at
  BEFORE UPDATE ON ia_tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Tabela: audit_log
-- Registro de ações administrativas e de sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID,
  agent_id    UUID,
  user_id     UUID,
  acao        TEXT NOT NULL,
  detalhes    JSONB,
  sucesso     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_id ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================================
-- Row Level Security (RLS) — habilitar para produção
-- ============================================================
ALTER TABLE ia_agents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_conversas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_mensagens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_tarefas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;

-- Política temporária: permite tudo para usuários autenticados
-- (Refinar por company_id em produção)
CREATE POLICY "allow_authenticated" ON ia_agents      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_authenticated" ON ia_conversas   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_authenticated" ON ia_mensagens   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_authenticated" ON ia_tarefas     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_authenticated" ON audit_log      FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Habilitar realtime para as tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE ia_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE ia_tarefas;
ALTER PUBLICATION supabase_realtime ADD TABLE ia_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE ia_conversas;
