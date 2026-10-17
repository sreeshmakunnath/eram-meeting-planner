-- One client per name, ignoring case. Guarded so a database that already holds "SABIC" and "sabic"
-- doesn't fail the deploy: the index is skipped with a notice; merge the duplicates, then re-run it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "clients" GROUP BY lower("name") HAVING count(*) > 1) THEN
    RAISE NOTICE 'clients_name_lower_idx skipped: some client names differ only in case';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "clients_name_lower_idx" ON "clients" USING btree (lower("name"));
  END IF;
END $$;
