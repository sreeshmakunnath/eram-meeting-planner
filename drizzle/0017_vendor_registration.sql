CREATE TYPE "public"."vendor_reg_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'MAILED', 'ON_HOLD', 'SUBMITTED', 'PORTAL_CREATED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "vendor_reg_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" varchar(1000),
	"storage_key" varchar(500),
	"added_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(150) DEFAULT 'Vendor registration' NOT NULL,
	"assignee_id" integer,
	"status" "vendor_reg_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"due_date" date,
	"portal_url" varchar(500),
	"portal_username" varchar(200),
	"portal_password_enc" text,
	"vendor_code" varchar(100),
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_reg_documents" ADD CONSTRAINT "vendor_reg_documents_registration_id_vendor_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."vendor_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_reg_documents" ADD CONSTRAINT "vendor_reg_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_registrations" ADD CONSTRAINT "vendor_registrations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_registrations" ADD CONSTRAINT "vendor_registrations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_registrations" ADD CONSTRAINT "vendor_registrations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_reg_docs_reg_idx" ON "vendor_reg_documents" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "vendor_reg_client_idx" ON "vendor_registrations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "vendor_reg_assignee_idx" ON "vendor_registrations" USING btree ("assignee_id","status");