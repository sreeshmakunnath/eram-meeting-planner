-- Contacts are private to whoever added them unless shared. Existing contacts become private, owned by
-- the client's account owner (else whoever created the client).
ALTER TABLE "client_contacts" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "client_contacts" cc SET "owner_id" = coalesce(c."account_owner_id", c."created_by_id")
  FROM "clients" c WHERE c."id" = cc."client_id";
