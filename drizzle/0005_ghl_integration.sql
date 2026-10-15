ALTER TYPE "public"."payment_method" ADD VALUE 'ghl_online';--> statement-breakpoint
CREATE TABLE "ghl_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"ghl_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"branch_id" uuid,
	"appointment_type_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_calendars_business_calendar_key" UNIQUE("business_id","ghl_calendar_id")
);
--> statement-breakpoint
CREATE TABLE "ghl_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"ghl_contact_id" text NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text,
	"ghl_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_contacts_business_contact_key" UNIQUE("business_id","ghl_contact_id")
);
--> statement-breakpoint
CREATE TABLE "ghl_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"ghl_opportunity_id" text NOT NULL,
	"ghl_contact_id" text,
	"lead_id" uuid,
	"customer_id" uuid,
	"sale_id" uuid,
	"name" text NOT NULL,
	"pipeline_id" text,
	"pipeline_stage_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"monetary_value_cents" bigint DEFAULT 0 NOT NULL,
	"assigned_to" text,
	"source" text,
	"ghl_created_at" timestamp with time zone,
	"ghl_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_opportunities_business_opportunity_key" UNIQUE("business_id","ghl_opportunity_id"),
	CONSTRAINT "ghl_opportunities_status_check" CHECK ("ghl_opportunities"."status" in ('open', 'won', 'lost', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "ghl_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"ghl_pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_pipelines_business_pipeline_key" UNIQUE("business_id","ghl_pipeline_id")
);
--> statement-breakpoint
CREATE TABLE "ghl_product_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"ghl_product_id" text,
	"ghl_price_id" text,
	"last_pushed_hash" text,
	"last_pushed_quantity" integer,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_product_links_variant_key" UNIQUE("business_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "ghl_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"ghl_user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"membership_id" uuid,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_users_business_user_key" UNIQUE("business_id","ghl_user_id")
);
--> statement-breakpoint
CREATE TABLE "integration_mismatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"external_id" text,
	"message" text NOT NULL,
	"local_value" jsonb,
	"external_value" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_membership_id" uuid,
	"resolution" text,
	CONSTRAINT "integration_mismatches_status_check" CHECK ("integration_mismatches"."status" in ('open', 'resolved', 'ignored'))
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connections" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "integration_connections" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "integration_connections" ALTER COLUMN "status" SET DEFAULT 'not_configured';--> statement-breakpoint
ALTER TABLE "integration_sync_events" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
-- Phase 1 used "processed" for confirmed deliveries; Phase 2 calls that "synced".
UPDATE "integration_sync_events" SET "status" = 'synced' WHERE "status" = 'processed';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "ghl_calendar_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "ghl_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "sync_state" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "auth_type" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "account_name" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "account_timezone" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "scopes" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "connected_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "rate_limited_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "category" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "last_http_status" integer;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD COLUMN "reviewed_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "channel" text DEFAULT 'in_store' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "external_ghl_order_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "external_ghl_status" text;--> statement-breakpoint
-- Backfill: categorise existing sync events and mark existing token connections as private-token auth.
UPDATE "integration_sync_events" SET "category" = CASE
  WHEN "event_type" LIKE 'contact%' OR "event_type" LIKE 'opportunity%' THEN 'contacts'
  WHEN "event_type" LIKE 'appointment%' THEN 'appointments'
  WHEN "event_type" LIKE 'order%' THEN 'sales'
  ELSE 'system' END;--> statement-breakpoint
UPDATE "integration_connections" SET "auth_type" = 'private_token' WHERE "credentials_encrypted" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ghl_calendars" ADD CONSTRAINT "ghl_calendars_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_calendars" ADD CONSTRAINT "ghl_calendars_business_id_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_calendars" ADD CONSTRAINT "ghl_calendars_business_id_appointment_type_id_appointment_types_business_id_id_fk" FOREIGN KEY ("business_id","appointment_type_id") REFERENCES "public"."appointment_types"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_contacts" ADD CONSTRAINT "ghl_contacts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_contacts" ADD CONSTRAINT "ghl_contacts_business_id_lead_id_leads_business_id_id_fk" FOREIGN KEY ("business_id","lead_id") REFERENCES "public"."leads"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_contacts" ADD CONSTRAINT "ghl_contacts_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_opportunities" ADD CONSTRAINT "ghl_opportunities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_opportunities" ADD CONSTRAINT "ghl_opportunities_business_id_lead_id_leads_business_id_id_fk" FOREIGN KEY ("business_id","lead_id") REFERENCES "public"."leads"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_opportunities" ADD CONSTRAINT "ghl_opportunities_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_opportunities" ADD CONSTRAINT "ghl_opportunities_business_id_sale_id_sales_business_id_id_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_pipelines" ADD CONSTRAINT "ghl_pipelines_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_product_links" ADD CONSTRAINT "ghl_product_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_product_links" ADD CONSTRAINT "ghl_product_links_business_id_product_id_products_business_id_id_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_product_links" ADD CONSTRAINT "ghl_product_links_business_id_variant_id_product_variants_business_id_id_fk" FOREIGN KEY ("business_id","variant_id") REFERENCES "public"."product_variants"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_users" ADD CONSTRAINT "ghl_users_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_users" ADD CONSTRAINT "ghl_users_business_id_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_mismatches" ADD CONSTRAINT "integration_mismatches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_business_id_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ghl_contacts_business_id_lead_id_index" ON "ghl_contacts" USING btree ("business_id","lead_id");--> statement-breakpoint
CREATE INDEX "ghl_contacts_business_id_customer_id_index" ON "ghl_contacts" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_opportunities_sale_key" ON "ghl_opportunities" USING btree ("business_id","sale_id") WHERE "ghl_opportunities"."sale_id" is not null;--> statement-breakpoint
CREATE INDEX "ghl_opportunities_business_id_status_index" ON "ghl_opportunities" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "ghl_opportunities_business_id_pipeline_id_pipeline_stage_id_index" ON "ghl_opportunities" USING btree ("business_id","pipeline_id","pipeline_stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_product_links_price_key" ON "ghl_product_links" USING btree ("business_id","ghl_price_id") WHERE "ghl_product_links"."ghl_price_id" is not null;--> statement-breakpoint
CREATE INDEX "ghl_product_links_business_id_ghl_product_id_index" ON "ghl_product_links" USING btree ("business_id","ghl_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_users_membership_key" ON "ghl_users" USING btree ("business_id","membership_id") WHERE "ghl_users"."membership_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_mismatches_open_key" ON "integration_mismatches" USING btree ("business_id","provider","kind","dedupe_key") WHERE "integration_mismatches"."status" = 'open';--> statement-breakpoint
CREATE INDEX "integration_mismatches_business_id_status_detected_at_index" ON "integration_mismatches" USING btree ("business_id","status","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_external_account_key" ON "integration_connections" USING btree ("provider","external_account_id") WHERE "integration_connections"."external_account_id" is not null and "integration_connections"."status" <> 'disabled';--> statement-breakpoint
CREATE INDEX "integration_sync_events_due" ON "integration_sync_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "integration_sync_events_business_id_category_created_at_index" ON "integration_sync_events" USING btree ("business_id","category","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_ghl_order_key" ON "sales" USING btree ("business_id","external_ghl_order_id") WHERE "sales"."external_ghl_order_id" is not null;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_sync_state_check" CHECK ("appointments"."sync_state" in ('local', 'synced', 'pending', 'failed'));--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_status_check" CHECK ("integration_connections"."status" in ('not_configured', 'connected', 'error', 'disabled', 'reauth_required'));--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_auth_type_check" CHECK ("integration_connections"."auth_type" is null or "integration_connections"."auth_type" in ('oauth', 'private_token'));--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD CONSTRAINT "integration_sync_events_status_check" CHECK ("integration_sync_events"."status" in ('pending', 'processing', 'synced', 'retry_scheduled', 'failed', 'needs_review', 'skipped'));--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD CONSTRAINT "integration_sync_events_category_check" CHECK ("integration_sync_events"."category" in ('contacts', 'opportunities', 'appointments', 'products', 'inventory', 'sales', 'orders', 'system'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_channel_check" CHECK ("sales"."channel" in ('in_store', 'ghl_online'));--> statement-breakpoint
DROP TYPE "public"."integration_status";--> statement-breakpoint
DROP TYPE "public"."sync_status";