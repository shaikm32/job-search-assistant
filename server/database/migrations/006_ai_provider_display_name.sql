-- 006_ai_provider_display_name.sql — provider management in Settings.
--
-- Adds an optional user-assigned display name for a configured provider.
-- The canonical provider identifier remains the primary key and continues to
-- own the credential and model configuration; renaming changes only the label
-- shown in the application.
--
-- The display name is non-secret metadata and never contains credential
-- material. A NULL value means the provider uses its canonical name.

ALTER TABLE ai_provider_configuration ADD COLUMN display_name TEXT;
