ALTER TYPE "public"."payment_method" ADD VALUE 'online_demo';--> statement-breakpoint
CREATE TABLE "website_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"access_token_hash" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"payment_option" text NOT NULL,
	"prescriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_lens_rx_confirmed" boolean DEFAULT false NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"customer_note" text,
	"client_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by_customer_at" timestamp with time zone,
	CONSTRAINT "website_orders_sale_key" UNIQUE("business_id","sale_id")
);
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_channel_check";--> statement-breakpoint
ALTER TABLE "website_orders" ADD CONSTRAINT "website_orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_orders" ADD CONSTRAINT "website_orders_business_id_sale_id_sales_business_id_id_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "website_orders_business_id_created_at_index" ON "website_orders" USING btree ("business_id","created_at");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_channel_check" CHECK ("sales"."channel" in ('in_store', 'ghl_online', 'website'));