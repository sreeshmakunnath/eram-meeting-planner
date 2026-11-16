CREATE TABLE "bid_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"bid_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" varchar(1000) NOT NULL,
	"added_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bid_documents_bid_idx" ON "bid_documents" USING btree ("bid_id");