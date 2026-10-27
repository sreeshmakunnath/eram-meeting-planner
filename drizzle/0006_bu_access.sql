-- Business-unit access: Super Admin role, and users/admins can belong to several business units.
-- The role type is rebuilt (instead of ALTER TYPE ... ADD VALUE) so the new value can be used in the same
-- transaction. Existing Admins become Super Admins so nobody loses access; demote BU admins afterwards.
ALTER TYPE "public"."role" RENAME TO "role_old";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'USER');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."role"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'SUPER_ADMIN' ELSE "role"::text END)::"public"."role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';--> statement-breakpoint
DROP TYPE "public"."role_old";--> statement-breakpoint
CREATE TABLE "user_business_units" (
	"user_id" integer NOT NULL,
	"business_unit_id" integer NOT NULL,
	CONSTRAINT "user_business_units_user_id_business_unit_id_pk" PRIMARY KEY("user_id","business_unit_id")
);
--> statement-breakpoint
ALTER TABLE "user_business_units" ADD CONSTRAINT "user_business_units_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_business_units" ADD CONSTRAINT "user_business_units_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_business_units_bu_idx" ON "user_business_units" USING btree ("business_unit_id");--> statement-breakpoint
-- Every user starts with access to their current (primary) business unit.
INSERT INTO "user_business_units" ("user_id", "business_unit_id")
  SELECT "id", "business_unit_id" FROM "users" WHERE "business_unit_id" IS NOT NULL
  ON CONFLICT DO NOTHING;
