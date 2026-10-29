CREATE TABLE "contact_shares" (
	"contact_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "contact_shares_contact_id_user_id_pk" PRIMARY KEY("contact_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "contact_shares" ADD CONSTRAINT "contact_shares_contact_id_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_shares" ADD CONSTRAINT "contact_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_shares_user_idx" ON "contact_shares" USING btree ("user_id");