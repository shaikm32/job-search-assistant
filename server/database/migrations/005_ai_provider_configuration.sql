-- 005_ai_provider_configuration.sql — M9-E multi-provider configuration.
--
-- Replaces the single-row `ai_settings` table with one row per configured AI
-- provider, so multiple providers can be configured independently (ADR-006).
--
-- Stores ONLY the non-secret fact that a provider is configured. API keys are
-- never written to SQLite: they live in the OS-native secure credential store
-- (ADR-003, AI_ARCHITECTURE.md §4, SECURITY.md), isolated per provider.
--
-- Conventions (matching 002/003/004):
-- - TEXT primary key; snake_case columns; repositories map to camelCase.
-- - Provider membership is enforced by service validation against the
--   canonical shared/domain list (no CHECK constraint).
--
-- Existing single-provider configuration is preserved: a previously selected
-- provider remains configured because its credential already lives in the OS
-- store under the same per-provider target name.

CREATE TABLE ai_provider_configuration (
  provider TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL
);

INSERT INTO ai_provider_configuration (provider, updated_at)
  SELECT provider, updated_at
  FROM ai_settings
  WHERE provider IS NOT NULL AND provider <> '';

DROP TABLE ai_settings;