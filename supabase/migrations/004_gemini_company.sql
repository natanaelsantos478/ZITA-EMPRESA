-- ============================================================
-- ZITA — Migração 004: Gemini API Key por Empresa
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- ── 1. Colunas na tabela companies ───────────────────────────────────────────
-- gemini_api_key_enc: valor já criptografado via AES-256-GCM (Edge Function)
-- gemini_modelo: modelo padrão da empresa
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS gemini_api_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS gemini_modelo      TEXT NOT NULL DEFAULT 'gemini-2.0-flash';

-- ── 2. View segura — NUNCA expõe a key ───────────────────────────────────────
CREATE OR REPLACE VIEW companies_safe AS
SELECT
  id,
  nome,
  slug,
  plano,
  status,
  logo_url,
  configuracoes,
  gemini_modelo,
  CASE WHEN gemini_api_key_enc IS NOT NULL THEN true ELSE false END AS gemini_configurado,
  created_at,
  updated_at
FROM companies;

-- ── 3. Bloquear acesso direto à coluna criptografada via RLS ─────────────────
-- Mesmo com SELECT na tabela, authenticated e anon NÃO conseguem ler gemini_api_key_enc.
-- Apenas service_role (Edge Functions) tem acesso.
REVOKE SELECT (gemini_api_key_enc) ON companies FROM authenticated;
REVOKE SELECT (gemini_api_key_enc) ON companies FROM anon;

-- ── 4. Política de update: apenas admin/owner da própria empresa ─────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'companies' AND policyname = 'companies_admin_update'
  ) THEN
    CREATE POLICY companies_admin_update ON companies FOR UPDATE TO authenticated
      USING  (id = auth_company_id())
      WITH CHECK (id = auth_company_id());
  END IF;
END $$;
