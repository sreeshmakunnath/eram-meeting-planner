CREATE TABLE "client_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"location" varchar(150),
	"description" text,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_projects_client_name_idx" ON "client_projects" USING btree ("client_id",lower("name"));--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bids_project_idx" ON "bids" USING btree ("project_id");