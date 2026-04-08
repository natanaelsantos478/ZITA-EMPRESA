-- ============================================================
-- ZITA Escritório de IA — Schema principal
-- Executar no SQL Editor do Supabase Dashboard
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---- Tabela: profiles ----
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY,
  company_id    UUID NOT NULL,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('owner','admin','operator','viewer')),
  avatar_url    TEXT,
  ultimo_acesso_at TIMESTAMPTZ,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Tabela: ia_agents ----
CREATE TABLE IF NOT EXISTS ia_agents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL,
  nome                    TEXT NOT NULL,
  descricao               TEXT,
  funcao                  TEXT,
  tipo                    TEXT NOT NULL DEFAULT 'subordinada'
                            CHECK (tipo IN ('zeus','subordinada','especialista')),
  avatar_url              TEXT,
  cor_hex                 TEXT NOT NULL DEFAULT '#4e5eff',
  status                  TEXT NOT NULL DEFAULT 'offline'
                            CHECK (status IN ('online','ocupada','aguardando','offline','erro','pausada')),
  status_detalhe          TEXT,
  integracao_tipo         TEXT,
  integracao_url          TEXT,
  integracao_config       JSONB NOT NULL DEFAULT '{}',
  organograma_x           FLOAT NOT NULL DEFAULT 100,
  organograma_y           FLOAT NOT NULL DEFAULT 100,
  organograma_parent_id   UUID REFERENCES ia_agents(id) ON DELETE SET NULL,
  capacidades             JSONB NOT NULL DEFAULT '{}',
  personalidade           JSONB NOT NULL DEFAULT
    '{"tom":"profissional","idioma":"pt-BR","prompt_sistema":"","temperatura":0.7,"max_tokens":2048}',
  modo_arquivo            TEXT NOT NULL DEFAULT 'none'
                            CHECK (modo_arquivo IN ('none','texto','pdf','imagem','qualquer')),
  total_conversas         INTEGER NOT NULL DEFAULT 0,
  total_tarefas_concluidas INTEGER NOT NULL DEFAULT 0,
  total_tarefas_erro      INTEGER NOT NULL DEFAULT 0,
  uptime_segundos         INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER ia_agents_updated_at
  BEFORE UPDATE ON ia_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- Tabela: ia_conversas ----
CREATE TABLE IF NOT EXISTS ia_conversas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  agent_id            UUID NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  iniciada_por        UUID,
  titulo              TEXT,
  status              TEXT NOT NULL DEFAULT 'ativa'
                        CHECK (status IN ('ativa','concluida','pausada','erro')),
  contexto            JSONB NOT NULL DEFAULT '{}',
  resumo              TEXT,
  total_mensagens     INTEGER NOT NULL DEFAULT 0,
  total_tokens_usados INTEGER NOT NULL DEFAULT 0,
  custo_estimado_usd  NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_at        TIMESTAMPTZ
);

CREATE OR REPLACE TRIGGER ia_conversas_updated_at
  BEFORE UPDATE ON ia_conversas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- Tabela: ia_mensagens ----
CREATE TABLE IF NOT EXISTS ia_mensagens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id     UUID NOT NULL REFERENCES ia_conversas(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL,
  remetente_tipo  TEXT NOT NULL
                    CHECK (remetente_tipo IN ('humano','ia','sistema','zeus')),
  remetente_id    UUID,
  remetente_nome  TEXT NOT NULL,
  conteudo        TEXT NOT NULL,
  conteudo_tipo   TEXT NOT NULL DEFAULT 'text',
  metadados       JSONB NOT NULL DEFAULT '{}',
  acao_tipo       TEXT,
  acao_status     TEXT,
  acao_resultado  JSONB,
  tokens_prompt   INTEGER NOT NULL DEFAULT 0,
  tokens_resposta INTEGER NOT NULL DEFAULT 0,
  latencia_ms     INTEGER,
  modelo_usado    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Tabela: ia_tarefas ----
CREATE TABLE IF NOT EXISTS ia_tarefas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL,
  agent_id              UUID NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  delegada_por_agent_id UUID REFERENCES ia_agents(id) ON DELETE SET NULL,
  delegada_por_profile_id UUID,
  titulo                TEXT NOT NULL,
  descricao             TEXT,
  instrucoes            JSONB NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente','em_execucao','concluida','erro','cancelada','aguardando_aprovacao')),
  prioridade            TEXT NOT NULL DEFAULT 'normal'
                          CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  resultado             TEXT,
  resultado_dados       JSONB,
  erro_mensagem         TEXT,
  progresso_pct         INTEGER NOT NULL DEFAULT 0
                          CHECK (progresso_pct BETWEEN 0 AND 100),
  iniciada_at           TIMESTAMPTZ,
  concluida_at          TIMESTAMPTZ,
  duracao_segundos      INTEGER,
  conversa_id           UUID REFERENCES ia_conversas(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER ia_tarefas_updated_at
  BEFORE UPDATE ON ia_tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- Tabela: audit_log ----
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  agent_id   UUID,
  user_id    UUID,
  acao       TEXT NOT NULL,
  detalhes   JSONB,
  sucesso    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Row Level Security ----
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_agents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_conversas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_mensagens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_tarefas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para usuários autenticados (ajuste conforme necessário)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles'     AND policyname='allow_authenticated') THEN
    CREATE POLICY allow_authenticated ON profiles     FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_agents'    AND policyname='allow_authenticated') THEN
    CREATE POLICY allow_authenticated ON ia_agents    FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_conversas' AND policyname='allow_authenticated') THEN
    CREATE POLICY allow_authenticated ON ia_conversas FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_mensagens' AND policyname='allow_authenticated') THEN
    CREATE POLICY allow_authenticated ON ia_mensagens FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_tarefas'   AND policyname='allow_authenticated') THEN
    CREATE POLICY allow_authenticated ON ia_tarefas   FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_log'    AND policyname='allow_authenticated') THEN
    CREATE POLICY allow_authenticated ON audit_log    FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---- Realtime ----
ALTER PUBLICATION supabase_realtime ADD TABLE ia_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE ia_tarefas;
ALTER PUBLICATION supabase_realtime ADD TABLE ia_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE ia_conversas;
