-- One date for when a tender starts: the issue date (required). Bids without one take their enquiry date.
UPDATE "bids" SET "issue_date" = "enquiry_date" WHERE "issue_date" IS NULL;--> statement-breakpoint
ALTER TABLE "bids" ALTER COLUMN "issue_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bids" DROP COLUMN "enquiry_date";
