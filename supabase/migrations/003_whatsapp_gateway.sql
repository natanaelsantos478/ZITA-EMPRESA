-- ============================================================
-- ZITA — WhatsApp Gateway: campos Z-API, canal e sessões
-- Migration idempotente (IF NOT EXISTS em tudo)
-- ============================================================

-- 1. Campos de WhatsApp na tabela ia_agents
ALTER TABLE ia_agents
  ADD COLUMN IF NOT EXISTS zapi_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS zapi_token       TEXT,
  ADD COLUMN IF NOT EXISTS zapi_numero      TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_ativo   BOOLEAN NOT NULL DEFAULT false;

-- Índice para busca rápida por número WhatsApp
CREATE INDEX IF NOT EXISTS idx_ia_agents_zapi_numero
  ON ia_agents(zapi_numero)
  WHERE zapi_numero IS NOT NULL;

-- 2. Canal e remetente nas conversas
ALTER TABLE ia_conversas
  ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'chat'
    CHECK (canal IN ('chat', 'whatsapp', 'api', 'zeus'));

ALTER TABLE ia_conversas
  ADD COLUMN IF NOT EXISTS canal_remetente TEXT;

-- 3. Tabela de sessões WhatsApp
--    Mantém contexto Flowise por contato/agente
CREATE TABLE IF NOT EXISTS whatsapp_sessoes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id          UUID        NOT NULL REFERENCES ia_agents(id) ON DELETE CASCADE,
  contato_numero    TEXT        NOT NULL,
  contato_nome      TEXT,
  conversa_id       UUID        REFERENCES ia_conversas(id),
  sessao_flowise    TEXT,
  ultimo_contato_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_mensagens   INT         NOT NULL DEFAULT 0,
  ativo             BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, contato_numero)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessoes_agent_contato
  ON whatsapp_sessoes(agent_id, contato_numero);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessoes_company
  ON whatsapp_sessoes(company_id);

-- RLS
ALTER TABLE whatsapp_sessoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'whatsapp_sessoes'
      AND policyname = 'whatsapp_sessoes_company'
  ) THEN
    CREATE POLICY "whatsapp_sessoes_company" ON whatsapp_sessoes
      FOR ALL USING (company_id = auth_company_id());
  END IF;
END $$;

-- Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_whatsapp_sessoes_updated'
  ) THEN
    CREATE TRIGGER trg_whatsapp_sessoes_updated
      BEFORE UPDATE ON whatsapp_sessoes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
