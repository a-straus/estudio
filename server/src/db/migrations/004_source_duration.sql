-- 004_source_duration.sql — orchestrator-approved schema-gate change (S7):
--   Add nullable REAL column source.duration_minutes — the lesson-audio
--   recording length in minutes, computed at ingestion and read by the
--   Lessons list for the "· N min" row label. Plain additive column, so a
--   direct ALTER TABLE suffices (no CHECK change → no table rebuild, unlike
--   002/003). Existing rows get NULL, which the UI renders as "no duration".
ALTER TABLE source ADD COLUMN duration_minutes REAL;
