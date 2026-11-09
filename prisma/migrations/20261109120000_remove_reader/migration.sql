-- Removes the Reader app from databases whose earlier version ran its migrations. Where it never ran, nothing changes.
DROP TABLE IF EXISTS "reader_feed_folders", "reader_entries", "reader_rules", "reader_settings", "reader_feeds", "reader_folders" CASCADE;
DROP TYPE IF EXISTS "ReaderFeedKind", "ReaderRuleKind";

-- Accounts stop listing it among their apps.
UPDATE "users" SET "apps" = array_remove("apps", 'reader') WHERE 'reader' = ANY ("apps");

-- Its migrations leave the history, so the history matches the migrations folder again. The shadow database that
-- `prisma migrate dev` replays migrations into has no history table, hence the check.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    DELETE FROM "_prisma_migrations"
    WHERE "migration_name" IN ('20261101120000_reader', '20261102120000_reader_layouts', '20261102130000_reader_feed_folders');
  END IF;
END $$;
