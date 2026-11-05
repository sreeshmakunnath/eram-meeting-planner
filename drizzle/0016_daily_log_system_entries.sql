ALTER TYPE "public"."activity_type" ADD VALUE 'MEETING';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'TASK';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'CLIENT_ADDED';--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "system_key" varchar(100);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_logs_system_key_idx" ON "daily_logs" USING btree ("user_id","system_key");