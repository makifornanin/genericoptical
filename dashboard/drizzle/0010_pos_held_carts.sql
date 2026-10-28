CREATE TABLE "pos_held_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"label" text NOT NULL,
	"customer_id" uuid,
	"cart" jsonb NOT NULL,
	"item_count" integer NOT NULL,
	"estimated_total_cents" bigint NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"held_by_membership_id" uuid,
	"closed_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "pos_held_carts_items" CHECK ("pos_held_carts"."item_count" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "pos_held_carts" ADD CONSTRAINT "pos_held_carts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_held_carts" ADD CONSTRAINT "pos_held_carts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_held_carts" ADD CONSTRAINT "pos_held_carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_held_carts_business_id_branch_id_status_index" ON "pos_held_carts" USING btree ("business_id","branch_id","status");