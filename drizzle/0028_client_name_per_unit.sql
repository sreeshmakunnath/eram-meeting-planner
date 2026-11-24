ALTER TABLE "clients" DROP CONSTRAINT "clients_name_unique";--> statement-breakpoint
DROP INDEX "clients_name_lower_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "clients_name_bu_lower_idx" ON "clients" USING btree (lower("name"),"business_unit_id");