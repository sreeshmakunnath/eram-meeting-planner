-- A client's account owner must belong to the client's business unit (they see all of its bids).
-- Clear any account owner who doesn't.
UPDATE "clients" c SET "account_owner_id" = NULL
WHERE c."account_owner_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_business_units" ub
    WHERE ub."user_id" = c."account_owner_id" AND ub."business_unit_id" = c."business_unit_id"
  );
