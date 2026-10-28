-- Reporting lines: a user can have several managers (user_managers). Each user's current reporting manager
-- is copied in, then the single users.manager_id column is dropped.
CREATE TABLE "user_managers" (
	"user_id" integer NOT NULL,
	"manager_id" integer NOT NULL,
	CONSTRAINT "user_managers_user_id_manager_id_pk" PRIMARY KEY("user_id","manager_id")
);
--> statement-breakpoint
ALTER TABLE "user_managers" ADD CONSTRAINT "user_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_managers" ADD CONSTRAINT "user_managers_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_managers_manager_idx" ON "user_managers" USING btree ("manager_id");--> statement-breakpoint
INSERT INTO "user_managers" ("user_id", "manager_id")
  SELECT "id", "manager_id" FROM "users" WHERE "manager_id" IS NOT NULL AND "manager_id" <> "id"
  ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_manager_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "manager_id";
