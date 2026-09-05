-- 001_initial_schema.sql — M2 persistence-infrastructure baseline.
--
-- Intentionally creates NO business tables. The applications, people, and
-- documents domain schema will be established by later milestones (M3/M4)
-- in the appropriate sequence.
--
-- This baseline exists so the first startup exercises the full migration
-- path: deterministic discovery, transactional execution, and
-- schema_migrations tracking.
SELECT 1;
