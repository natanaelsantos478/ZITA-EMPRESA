-- ============================================================
-- ZITA — Limpar todos os agentes para teste de criação limpa
-- ATENÇÃO: apaga TODOS os agentes e dados relacionados
-- Execute apenas em ambiente de desenvolvimento/teste
-- ============================================================

-- 1. Remover tarefas (FK para ia_agents)
TRUNCATE TABLE ia_tarefas CASCADE;

-- 2. Remover mensagens e conversas (FK para ia_agents)
TRUNCATE TABLE ia_mensagens CASCADE;
TRUNCATE TABLE ia_conversas CASCADE;

-- 3. Remover todos os agentes
TRUNCATE TABLE ia_agents CASCADE;

-- 4. Limpar log de auditoria (opcional)
-- TRUNCATE TABLE audit_log;

-- Verificar resultado
SELECT COUNT(*) AS agentes_restantes FROM ia_agents;
