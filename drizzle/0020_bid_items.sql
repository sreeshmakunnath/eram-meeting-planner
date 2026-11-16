CREATE TABLE "bid_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bid_id" integer NOT NULL,
	"position" integer NOT NULL,
	"description" varchar(300) NOT NULL,
	"unit" varchar(50),
	"quantity" numeric(12, 2),
	"unit_price" numeric(14, 2)
);
--> statement-breakpoint
ALTER TABLE "bid_items" ADD CONSTRAINT "bid_items_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bid_items_bid_idx" ON "bid_items" USING btree ("bid_id","position");