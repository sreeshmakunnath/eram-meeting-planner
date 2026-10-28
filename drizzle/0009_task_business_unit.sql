-- Every task belongs to exactly one business unit. Existing tasks get: the client's unit (one the creator has
-- access to first, then the creator's primary unit), else the meeting's unit, else the creator's primary unit.
-- Subtasks take their main task's unit. Same rule as taskBuFor() in src/lib/task-bu.ts.
ALTER TABLE "tasks" ADD COLUMN "business_unit_id" integer;--> statement-breakpoint
UPDATE "tasks" t SET "business_unit_id" = coalesce(
  (SELECT cb."business_unit_id" FROM "client_business_units" cb WHERE cb."client_id" = t."client_id"
    ORDER BY EXISTS (SELECT 1 FROM "user_business_units" ub WHERE ub."user_id" = t."created_by_id" AND ub."business_unit_id" = cb."business_unit_id") DESC,
             coalesce(cb."business_unit_id" = (SELECT u."business_unit_id" FROM "users" u WHERE u."id" = t."created_by_id"), false) DESC,
             cb."business_unit_id"
    LIMIT 1),
  (SELECT mb."business_unit_id" FROM "meeting_business_units" mb WHERE mb."meeting_id" = t."meeting_id"
    ORDER BY EXISTS (SELECT 1 FROM "user_business_units" ub WHERE ub."user_id" = t."created_by_id" AND ub."business_unit_id" = mb."business_unit_id") DESC,
             coalesce(mb."business_unit_id" = (SELECT u."business_unit_id" FROM "users" u WHERE u."id" = t."created_by_id"), false) DESC,
             mb."business_unit_id"
    LIMIT 1),
  (SELECT u."business_unit_id" FROM "users" u WHERE u."id" = t."created_by_id"),
  (SELECT min(b."id") FROM "business_units" b)
) WHERE t."parent_task_id" IS NULL;--> statement-breakpoint
UPDATE "tasks" s SET "business_unit_id" = p."business_unit_id" FROM "tasks" p WHERE s."parent_task_id" = p."id";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "business_unit_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_bu_idx" ON "tasks" USING btree ("business_unit_id");
