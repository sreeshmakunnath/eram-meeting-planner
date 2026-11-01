CREATE TYPE "public"."activity_type" AS ENUM('CLIENT_CALL', 'EMAIL_FOLLOW_UP', 'SITE_VISIT', 'RESEARCH', 'PROPOSAL', 'INTERNAL_MEETING', 'ADMIN', 'OTHER');--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"log_date" date NOT NULL,
	"type" "activity_type" NOT NULL,
	"description" text NOT NULL,
	"minutes" integer,
	"client_id" integer,
	"task_id" integer,
	"meeting_id" integer,
	"business_unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_logs_user_date_idx" ON "daily_logs" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE INDEX "daily_logs_client_idx" ON "daily_logs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "daily_logs_task_idx" ON "daily_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "daily_logs_bu_idx" ON "daily_logs" USING btree ("business_unit_id");