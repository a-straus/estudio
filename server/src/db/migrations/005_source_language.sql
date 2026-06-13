-- 005_source_language.sql — orchestrator-approved schema-gate change:
--   Add nullable TEXT column source.language (`es`|`en`) so the triage ->
--   word-materialization path can route words into the matching deck (an
--   upcoming Project Gutenberg / King James Bible ingest needs the English
--   deck). Plain additive column, so a direct ALTER TABLE suffices (no CHECK
--   change → no table rebuild, like 004). Every source created so far is
--   Spanish, so backfill existing NULLs to 'es'. Language is validated in
--   code, not by a DB CHECK.
ALTER TABLE source ADD COLUMN language TEXT;
UPDATE source SET language = 'es' WHERE language IS NULL;
