CREATE TYPE "public"."bid_stage" AS ENUM('ENQUIRY', 'PRE_BID', 'SUBMITTED', 'UNDER_EVALUATION', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."bid_type" AS ENUM('BID', 'RFQ', 'RFP');--> statement-breakpoint
CREATE TYPE "public"."probability_band" AS ENUM('P0_20', 'P21_50', 'P51_80', 'P81_90', 'P100');--> statement-breakpoint
CREATE TYPE "public"."submission_mode" AS ENUM('PORTAL', 'ENVELOPE', 'EMAIL', 'HAND');--> statement-breakpoint
CREATE TYPE "public"."tender_category" AS ENUM('GOVERNMENT', 'SEMI_GOVERNMENT', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_unit_id" integer NOT NULL,
	"owner_id" integer,
	"external_ref" varchar(50),
	"quotation_ref" varchar(100),
	"client_tender_no" varchar(100),
	"client_ref_no" varchar(100),
	"client_id" integer NOT NULL,
	"end_client_id" integer,
	"contact_id" integer,
	"title" varchar(200) NOT NULL,
	"scope" text,
	"sector" varchar(100),
	"tender_category" "tender_category",
	"bid_type" "bid_type" NOT NULL,
	"submission_mode" "submission_mode",
	"country" varchar(100),
	"location" varchar(100),
	"site" varchar(200),
	"enquiry_date" date NOT NULL,
	"issue_date" date,
	"acknowledged_date" date,
	"tender_purchased_date" date,
	"review_deadline" date,
	"clarification_deadline" date,
	"closing_date" date NOT NULL,
	"submitted_date" date,
	"expected_award_date" date,
	"expected_start_date" date,
	"bid_value" numeric(14, 2),
	"manpower_estimate" integer,
	"duration_months" integer,
	"option_months" integer,
	"monthly_billing" numeric(14, 2),
	"profit_per_head" numeric(14, 2),
	"retention_pct" numeric(5, 2),
	"advance_payment" varchar(200),
	"payment_terms" text,
	"invoicing_schedule" text,
	"insurance_terms" text,
	"penalty_terms" text,
	"risks" text,
	"stage" "bid_stage" DEFAULT 'ENQUIRY' NOT NULL,
	"probability_band" "probability_band",
	"closed_reason" text,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_external_ref_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_end_client_id_clients_id_fk" FOREIGN KEY ("end_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bids_bu_idx" ON "bids" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "bids_client_idx" ON "bids" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bids_owner_idx" ON "bids" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "bids_stage_idx" ON "bids" USING btree ("stage","closing_date");