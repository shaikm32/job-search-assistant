-- 004_ai_settings.sql — M9-B AI provider configuration (non-secret).
--
-- Stores ONLY the selected AI provider. The API key is never written to
-- SQLite: credentials live in the OS-native secure credential store
-- (ADR-003, AI_ARCHITECTURE.md §4, SECURITY.md).
--
-- Conventions (matching 002/003):
-- - TEXT primary key; a single row is maintained for this single-user app.
-- - snake_case columns; repositories map to camelCase domain contracts.
-- - Provider membership is enforced by service validation against the
--   canonical shared/domain list (no CHECK constraint).

CREATE TABLE ai_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  updated_at TEXT NOT NULL
);