CREATE TYPE "public"."brief_status" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."meeting_mode" AS ENUM('IN_PERSON', 'TEAMS', 'ZOOM', 'PHONE');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('TO_BE_SCHEDULED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'POSTPONED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('CLIENT_MEETING', 'INTERNAL', 'FOLLOW_UP', 'PRESENTATION', 'SITE_VISIT');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TABLE "brief_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"brief_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"action" text NOT NULL,
	"owner_user_id" integer,
	"owner_group_id" integer,
	"deadline" timestamp
);
--> statement-breakpoint
CREATE TABLE "meeting_action_owners" (
	"meeting_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "meeting_action_owners_meeting_id_user_id_pk" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(50) NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendees" (
	"meeting_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"via_group_id" integer,
	"attended" boolean,
	CONSTRAINT "meeting_attendees_meeting_id_user_id_pk" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"client_attendees" text,
	"discussion_points" text,
	"outcomes" text,
	"documents_used" text,
	"next_follow_up_date" timestamp,
	"status" "brief_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_id" integer,
	"follow_up_meeting_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_briefs_meeting_id_unique" UNIQUE("meeting_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_business_units" (
	"meeting_id" integer NOT NULL,
	"business_unit_id" integer NOT NULL,
	CONSTRAINT "meeting_business_units_meeting_id_business_unit_id_pk" PRIMARY KEY("meeting_id","business_unit_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_contacts" (
	"meeting_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	CONSTRAINT "meeting_contacts_meeting_id_contact_id_pk" PRIMARY KEY("meeting_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_groups" (
	"meeting_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "meeting_groups_meeting_id_group_id_pk" PRIMARY KEY("meeting_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"client_id" integer,
	"location" varchar(150),
	"mode" "meeting_mode" DEFAULT 'IN_PERSON' NOT NULL,
	"venue" varchar(300),
	"client_contacts_text" varchar(500),
	"type" "meeting_type" DEFAULT 'CLIENT_MEETING' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" "meeting_status" DEFAULT 'TO_BE_SCHEDULED' NOT NULL,
	"objective" text NOT NULL,
	"documents" text,
	"next_action" text,
	"follow_up_date" timestamp,
	"notes" text,
	"organiser_id" integer NOT NULL,
	"parent_meeting_id" integer,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_actions" ADD CONSTRAINT "brief_actions_brief_id_meeting_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."meeting_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_actions" ADD CONSTRAINT "brief_actions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_actions" ADD CONSTRAINT "brief_actions_owner_group_id_groups_id_fk" FOREIGN KEY ("owner_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_owners" ADD CONSTRAINT "meeting_action_owners_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_owners" ADD CONSTRAINT "meeting_action_owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_activity" ADD CONSTRAINT "meeting_activity_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_activity" ADD CONSTRAINT "meeting_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_via_group_id_groups_id_fk" FOREIGN KEY ("via_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_briefs" ADD CONSTRAINT "meeting_briefs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_briefs" ADD CONSTRAINT "meeting_briefs_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_briefs" ADD CONSTRAINT "meeting_briefs_follow_up_meeting_id_meetings_id_fk" FOREIGN KEY ("follow_up_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_business_units" ADD CONSTRAINT "meeting_business_units_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_business_units" ADD CONSTRAINT "meeting_business_units_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_contacts" ADD CONSTRAINT "meeting_contacts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_contacts" ADD CONSTRAINT "meeting_contacts_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_groups" ADD CONSTRAINT "meeting_groups_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_groups" ADD CONSTRAINT "meeting_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organiser_id_users_id_fk" FOREIGN KEY ("organiser_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_parent_meeting_id_meetings_id_fk" FOREIGN KEY ("parent_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_action_owners_user_idx" ON "meeting_action_owners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meeting_activity_idx" ON "meeting_activity" USING btree ("meeting_id","created_at");--> statement-breakpoint
CREATE INDEX "meeting_attendees_user_idx" ON "meeting_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meetings_start_idx" ON "meetings" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "meetings_client_idx" ON "meetings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");