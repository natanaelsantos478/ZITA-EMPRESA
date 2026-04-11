-- ============================================================
-- ZITA — Migração 003: Gestor, Segurança e Tabelas Faltantes
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- ── 1. Tabela companies (multi-tenant real) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  -- ack_code: código ACK da empresa. NUNCA visível ao cliente (proteção em nível de coluna abaixo).
  -- Padrão: ACK00001, ACK00002, etc. O gestor define via painel.
  -- A Edge Function usa este código para montar o nome do Secret: FLOWISE_KEY_ACK00001
  ack_code      TEXT UNIQUE,
  plano         TEXT NOT NULL DEFAULT 'basico'
                  CHECK (plano IN ('basico','profissional','enterprise')),
  status        TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo','suspenso','cancelado')),
  logo_url      TEXT,
  configuracoes JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. Empresa sistema (para conta do gestor) ────────────────────────────────
INSERT INTO companies (id, nome, slug, plano)
  VALUES ('00000000-0000-0000-0000-000000000001', 'ZITA Sistema', 'sistema', 'enterprise')
  ON CONFLICT (id) DO NOTHING;

-- ── 3. FK profiles → companies (se não existir) ──────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_company_id_fkey'
      AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 4. Adicionar role 'gestor' ao CHECK de profiles ──────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('gestor','owner','admin','operator','viewer'));

-- ── 5. Adicionar is_principal à ia_agents ────────────────────────────────────
-- Marca a IA principal de cada empresa (conectada 24/7 ao Flowise)
ALTER TABLE ia_agents
  ADD COLUMN IF NOT EXISTS is_principal BOOLEAN NOT NULL DEFAULT false;

-- ── 6. Tabela ia_acoes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ia_acoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  de_agent_id     UUID REFERENCES ia_agents(id) ON DELETE SET NULL,
  para_agent_id   UUID NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'comando'
                    CHECK (tipo IN ('pergunta','comando','delegacao','relatorio','memoria','broadcast')),
  prioridade      TEXT NOT NULL DEFAULT 'normal'
                    CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_processamento','concluida','erro')),
  payload         JSONB NOT NULL DEFAULT '{}',
  resultado       JSONB,
  erro_msg        TEXT,
  expira_em       TIMESTAMPTZ,
  origem_acao_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER ia_acoes_updated_at
  BEFORE UPDATE ON ia_acoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 7. Tabela ia_memorias ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ia_memorias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  agent_id        UUID NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'fato'
                    CHECK (tipo IN ('fato','contexto','instrucao','resultado','aprendizado','regra')),
  titulo          TEXT,
  conteudo        TEXT NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  visibilidade    TEXT NOT NULL DEFAULT 'equipe'
                    CHECK (visibilidade IN ('privada','equipe','global')),
  importancia     INTEGER NOT NULL DEFAULT 5 CHECK (importancia BETWEEN 1 AND 10),
  expira_em       TIMESTAMPTZ,
  origem_acao_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. RLS em novas tabelas ───────────────────────────────────────────────────
ALTER TABLE companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_acoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_memorias ENABLE ROW LEVEL SECURITY;

-- Helper: função para buscar company_id do usuário atual
-- Usada nas políticas para evitar sub-select repetido
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- companies: qualquer autenticado lê (exceto ack_code — coluna bloqueada abaixo)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='companies_read') THEN
    CREATE POLICY companies_read ON companies FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ia_acoes: apenas da mesma empresa
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_acoes' AND policyname='ia_acoes_by_company') THEN
    CREATE POLICY ia_acoes_by_company ON ia_acoes FOR ALL TO authenticated
      USING (company_id = auth_company_id())
      WITH CHECK (company_id = auth_company_id());
  END IF;
END $$;

-- ia_memorias: apenas da mesma empresa
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_memorias' AND policyname='ia_memorias_by_company') THEN
    CREATE POLICY ia_memorias_by_company ON ia_memorias FOR ALL TO authenticated
      USING (company_id = auth_company_id())
      WITH CHECK (company_id = auth_company_id());
  END IF;
END $$;

-- ── 9. Corrigir RLS das tabelas existentes ────────────────────────────────────
-- Remove políticas permissivas (USING true) e substitui por filtro de empresa

-- profiles
DROP POLICY IF EXISTS allow_authenticated ON profiles;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_by_company') THEN
    CREATE POLICY profiles_by_company ON profiles FOR SELECT TO authenticated
      USING (company_id = auth_company_id() OR id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_self_write') THEN
    CREATE POLICY profiles_self_write ON profiles FOR UPDATE TO authenticated
      USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- ia_agents
DROP POLICY IF EXISTS allow_authenticated ON ia_agents;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_agents' AND policyname='ia_agents_by_company') THEN
    CREATE POLICY ia_agents_by_company ON ia_agents FOR ALL TO authenticated
      USING (company_id = auth_company_id())
      WITH CHECK (company_id = auth_company_id());
  END IF;
END $$;

-- ia_conversas
DROP POLICY IF EXISTS allow_authenticated ON ia_conversas;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_conversas' AND policyname='ia_conversas_by_company') THEN
    CREATE POLICY ia_conversas_by_company ON ia_conversas FOR ALL TO authenticated
      USING (company_id = auth_company_id())
      WITH CHECK (company_id = auth_company_id());
  END IF;
END $$;

-- ia_mensagens
DROP POLICY IF EXISTS allow_authenticated ON ia_mensagens;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_mensagens' AND policyname='ia_mensagens_by_company') THEN
    CREATE POLICY ia_mensagens_by_company ON ia_mensagens FOR ALL TO authenticated
      USING (company_id = auth_company_id())
      WITH CHECK (company_id = auth_company_id());
  END IF;
END $$;

-- ia_tarefas
DROP POLICY IF EXISTS allow_authenticated ON ia_tarefas;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ia_tarefas' AND policyname='ia_tarefas_by_company') THEN
    CREATE POLICY ia_tarefas_by_company ON ia_tarefas FOR ALL TO authenticated
      USING (company_id = auth_company_id())
      WITH CHECK (company_id = auth_company_id());
  END IF;
END $$;

-- audit_log: cada empresa vê apenas seus logs
DROP POLICY IF EXISTS allow_authenticated ON audit_log;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_log' AND policyname='audit_log_by_company') THEN
    CREATE POLICY audit_log_by_company ON audit_log FOR ALL TO authenticated
      USING (company_id = auth_company_id() OR company_id IS NULL)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 10. Proteção em nível de coluna: ack_code ─────────────────────────────────
-- Mesmo com SELECT na tabela, authenticated e anon NÃO conseguem ler ack_code.
-- Apenas service_role (Edge Functions) tem acesso.
-- Testa via F12: supabase.from('companies').select('ack_code') → retorna erro.
REVOKE SELECT (ack_code) ON companies FROM authenticated;
REVOKE SELECT (ack_code) ON companies FROM anon;

-- ── 11. Realtime para novas tabelas ──────────────────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE ia_acoes;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE ia_memorias;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
