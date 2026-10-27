-- Subtasks replace the task checklist. A subtask is a normal task with parent_task_id set, so it has its own
-- assignee, due date and status. Each existing checklist step becomes a subtask of its task, assigned to the
-- task's people, and the checklist table is dropped.
ALTER TABLE "tasks" ADD COLUMN "parent_task_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
DO $$
DECLARE
  c record;
  new_id integer;
BEGIN
  FOR c IN
    SELECT cl."task_id", cl."text", cl."done", t."client_id", t."meeting_id", t."priority", t."start_date", t."due_date", t."created_by_id"
    FROM "task_checklist" cl JOIN "tasks" t ON t."id" = cl."task_id"
    ORDER BY cl."task_id", cl."position", cl."id"
  LOOP
    INSERT INTO "tasks" ("title", "category", "client_id", "meeting_id", "parent_task_id", "priority", "start_date", "due_date", "status", "percent", "completed_at", "created_by_id")
    VALUES (
      left(c."text", 200), 'GENERAL', c."client_id", c."meeting_id", c."task_id", c."priority", c."start_date", c."due_date",
      (CASE WHEN c."done" THEN 'COMPLETED' ELSE 'NOT_STARTED' END)::"task_status",
      CASE WHEN c."done" THEN 100 ELSE 0 END,
      CASE WHEN c."done" THEN now() END,
      c."created_by_id"
    )
    RETURNING "id" INTO new_id;
    INSERT INTO "task_assignees" ("task_id", "user_id") SELECT new_id, "user_id" FROM "task_assignees" WHERE "task_id" = c."task_id";
    INSERT INTO "task_activity" ("task_id", "action", "details") VALUES (new_id, 'CREATED', '{"from": "checklist"}');
  END LOOP;
END $$;--> statement-breakpoint
DROP TABLE "task_checklist" CASCADE;
