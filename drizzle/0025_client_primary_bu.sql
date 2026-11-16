-- A client belongs to exactly one business unit (its primary unit); the list of relevant units goes.
-- Meetings keep their own relevant units.
ALTER TABLE "clients" ADD COLUMN "business_unit_id" integer;--> statement-breakpoint

-- Existing clients: the unit their client code was made from (CL-<unit code>-…), else their lowest-id unit,
-- else the creator's primary unit, else the first unit.
UPDATE "clients" c SET "business_unit_id" = coalesce(
  (SELECT cb."business_unit_id" FROM "client_business_units" cb JOIN "business_units" b ON b."id" = cb."business_unit_id"
    WHERE cb."client_id" = c."id" AND c."client_code" LIKE 'CL-' || b."code" || '-%' LIMIT 1),
  (SELECT min(cb."business_unit_id") FROM "client_business_units" cb WHERE cb."client_id" = c."id"),
  (SELECT u."business_unit_id" FROM "users" u WHERE u."id" = c."created_by_id"),
  (SELECT min(b."id") FROM "business_units" b)
);--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "business_unit_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_bu_idx" ON "clients" USING btree ("business_unit_id");--> statement-breakpoint

-- A bid is in its client's unit
UPDATE "bids" b SET "business_unit_id" = c."business_unit_id" FROM "clients" c WHERE c."id" = b."client_id" AND b."business_unit_id" <> c."business_unit_id";--> statement-breakpoint

-- The client code now comes from the client's own unit, when the client is added
DROP TRIGGER IF EXISTS "client_business_units_assign_code" ON "client_business_units";--> statement-breakpoint
DROP TABLE "client_business_units" CASCADE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assign_client_code"() RETURNS trigger AS $$
DECLARE
  bu_code text;
  n bigint;
BEGIN
  IF NEW."client_code" IS NULL THEN
    SELECT "code" INTO bu_code FROM "business_units" WHERE "id" = NEW."business_unit_id";
    n := nextval('client_code_seq');
    NEW."client_code" := 'CL-' || bu_code || '-' || lpad(n::text, greatest(4, length(n::text)), '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "clients_assign_code" BEFORE INSERT ON "clients"
FOR EACH ROW EXECUTE FUNCTION "assign_client_code"();--> statement-breakpoint
-- Any client that somehow has no code yet gets one
UPDATE "clients" c SET "client_code" = 'CL-' || b."code" || '-' || lpad(n.v::text, greatest(4, length(n.v::text)), '0')
FROM "business_units" b, LATERAL (SELECT nextval('client_code_seq') AS v) n
WHERE c."client_code" IS NULL AND b."id" = c."business_unit_id";
