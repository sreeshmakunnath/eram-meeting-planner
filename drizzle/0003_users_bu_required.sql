-- Business unit is mandatory for users. Guarded so a database that still has users without a unit
-- doesn't fail the deploy: the constraint is skipped with a notice; assign units, then re-run the ALTER.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "business_unit_id" IS NULL) THEN
    RAISE NOTICE 'users.business_unit_id NOT NULL skipped: some users have no business unit';
  ELSE
    ALTER TABLE "users" ALTER COLUMN "business_unit_id" SET NOT NULL;
  END IF;
END $$;
