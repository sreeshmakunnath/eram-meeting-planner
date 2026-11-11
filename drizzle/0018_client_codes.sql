-- Business unit codes: known units get their agreed code, any other unit BU<id> until a Super Admin sets one.
ALTER TABLE "business_units" ADD COLUMN "code" varchar(6);--> statement-breakpoint
UPDATE "business_units" SET "code" = CASE "name"
  WHEN 'Eram Engineering' THEN 'ENG'
  WHEN 'Eram Trading' THEN 'TRD'
  WHEN 'Eram Egypt' THEN 'EGY'
  WHEN 'Eram Namibia' THEN 'NAM'
  WHEN 'Source Philipines' THEN 'SPH'
  WHEN 'Source Philippines' THEN 'SPH'
  WHEN 'Source India' THEN 'SIN'
  WHEN 'Source Russia' THEN 'SRU'
  WHEN 'Source France' THEN 'SFR'
  WHEN 'Eram HCM' THEN 'HCM'
  WHEN 'Eram Digital' THEN 'DIG'
  ELSE 'BU' || "id" END;--> statement-breakpoint
ALTER TABLE "business_units" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_code_unique" UNIQUE("code");--> statement-breakpoint

-- Client codes: CL-<BU code>-<company-wide running number>, at least 4 digits.
ALTER TABLE "clients" ADD COLUMN "client_code" varchar(20);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_client_code_unique" UNIQUE("client_code");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "client_code_seq";--> statement-breakpoint

-- Existing clients, numbered in the order they were added; the unit is their lowest-id business unit.
WITH o AS (
  SELECT c."id", bu."code", row_number() OVER (ORDER BY c."created_at", c."id") AS n
  FROM "clients" c
  JOIN LATERAL (
    SELECT b."code" FROM "client_business_units" cb JOIN "business_units" b ON b."id" = cb."business_unit_id"
    WHERE cb."client_id" = c."id" ORDER BY b."id" LIMIT 1
  ) bu ON true
)
UPDATE "clients" SET "client_code" = 'CL-' || o."code" || '-' || lpad(o.n::text, greatest(4, length(o.n::text)), '0')
FROM o WHERE "clients"."id" = o."id";--> statement-breakpoint
SELECT setval('client_code_seq', greatest(1, (SELECT count(*) FROM "clients" WHERE "client_code" IS NOT NULL)), (SELECT count(*) FROM "clients" WHERE "client_code" IS NOT NULL) > 0);--> statement-breakpoint

-- New clients: the code is assigned when the first business unit is linked (every create path links one),
-- so forms, importers and scripts all get one. A client that already has a code keeps it.
CREATE OR REPLACE FUNCTION "assign_client_code"() RETURNS trigger AS $$
DECLARE
  bu_code text;
  n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM "clients" WHERE "id" = NEW."client_id" AND "client_code" IS NULL) THEN
    SELECT "code" INTO bu_code FROM "business_units" WHERE "id" = NEW."business_unit_id";
    n := nextval('client_code_seq');
    UPDATE "clients" SET "client_code" = 'CL-' || bu_code || '-' || lpad(n::text, greatest(4, length(n::text)), '0')
    WHERE "id" = NEW."client_id" AND "client_code" IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "client_business_units_assign_code" AFTER INSERT ON "client_business_units"
FOR EACH ROW EXECUTE FUNCTION "assign_client_code"();
