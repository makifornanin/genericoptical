CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('frames', 'rx_lenses', 'contact_lenses', 'sunglasses', 'accessories', 'cleaning', 'cases', 'services');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM('new', 'confirmed', 'processing', 'awaiting_lab', 'ready_for_pickup', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('not_configured', 'connected', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'qualified', 'appointment_scheduled', 'follow_up', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'sales', 'inventory', 'practitioner');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('opening', 'receipt', 'adjustment', 'sale', 'sale_return', 'order_consumption', 'transfer_out', 'transfer_in', 'damage', 'count');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'bank_transfer', 'gcash', 'maya', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('stock', 'service', 'made_to_order');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."refund_method" AS ENUM('cash', 'card', 'bank_transfer', 'gcash', 'maya', 'other', 'balance_adjustment');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'released', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."sale_kind" AS ENUM('pos', 'order');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('open', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sync_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'processed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "appointment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"requires_practitioner" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"price_cents" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "appointment_types_business_id_code_unique" UNIQUE("business_id","code"),
	CONSTRAINT "appointment_types_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "appointment_types_duration" CHECK ("appointment_types"."duration_minutes" between 5 and 480)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"appointment_type_id" uuid NOT NULL,
	"customer_id" uuid,
	"lead_id" uuid,
	"practitioner_membership_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"source" text DEFAULT 'dashboard' NOT NULL,
	"guest_name" text,
	"guest_phone" text,
	"guest_email" text,
	"cancel_reason" text,
	"external_ghl_appointment_id" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "appointments_ghl_key" UNIQUE("business_id","external_ghl_appointment_id"),
	CONSTRAINT "appointments_time_order" CHECK ("appointments"."ends_at" > "appointments"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_membership_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"changes" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"phone" text,
	"email" text,
	"map_url" text,
	"image_url" text,
	"business_hours" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_business_id_code_unique" UNIQUE("business_id","code"),
	CONSTRAINT "branches_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "business_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"default_branch_id" uuid,
	"title" text,
	"phone" text,
	"calendar_color" text,
	"takes_appointments" boolean DEFAULT false NOT NULL,
	"permission_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_memberships_business_id_user_id_unique" UNIQUE("business_id","user_id"),
	CONSTRAINT "business_memberships_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "business_sequences" (
	"business_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "business_sequences_business_id_key_pk" PRIMARY KEY("business_id","key")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tagline" text,
	"description" text,
	"logo_url" text,
	"brand_color" text DEFAULT '#1F2B22' NOT NULL,
	"accent_color" text DEFAULT '#B5E14A' NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text DEFAULT 'PH' NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"locale" text DEFAULT 'en-PH' NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"tax_name" text DEFAULT 'VAT' NOT NULL,
	"tax_rate_bps" integer DEFAULT 1200 NOT NULL,
	"prices_include_tax" boolean DEFAULT true NOT NULL,
	"tax_registration" text,
	"receipt_footer" text,
	"business_hours" jsonb NOT NULL,
	"website_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "businesses_tax_rate_range" CHECK ("businesses"."tax_rate_bps" >= 0 and "businesses"."tax_rate_bps" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"birth_date" date,
	"gender" text,
	"address_line1" text,
	"city" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"home_branch_id" uuid,
	"converted_from_lead_id" uuid,
	"external_ghl_contact_id" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "customers_business_id_code_unique" UNIQUE("business_id","code"),
	CONSTRAINT "customers_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "customers_converted_lead_key" UNIQUE("business_id","converted_from_lead_id"),
	CONSTRAINT "customers_ghl_contact_key" UNIQUE("business_id","external_ghl_contact_id")
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expense_categories_business_id_name_unique" UNIQUE("business_id","name"),
	CONSTRAINT "expense_categories_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"category_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"expense_date" date NOT NULL,
	"payment_method" text,
	"payee" text,
	"description" text NOT NULL,
	"reference" text,
	"attachment_path" text,
	"attachment_name" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "integration_status" DEFAULT 'not_configured' NOT NULL,
	"external_account_id" text,
	"credentials_encrypted" text,
	"webhook_secret_encrypted" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_business_id_provider_unique" UNIQUE("business_id","provider")
);
--> statement-breakpoint
CREATE TABLE "integration_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"direction" "sync_direction" NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"external_id" text,
	"idempotency_key" text,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"business_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_variant_id_location_id_pk" PRIMARY KEY("variant_id","location_id"),
	CONSTRAINT "inventory_balances_non_negative" CHECK ("inventory_balances"."on_hand" >= 0 and "inventory_balances"."reserved" >= 0 and "inventory_balances"."reserved" <= "inventory_balances"."on_hand")
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "inventory_locations_business_id_code_unique" UNIQUE("business_id","code"),
	CONSTRAINT "inventory_locations_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"from_stage" "lead_stage",
	"to_stage" "lead_stage",
	"actor_membership_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"source" text DEFAULT 'website' NOT NULL,
	"interest" text,
	"message" text,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"assigned_membership_id" uuid,
	"preferred_branch_id" uuid,
	"follow_up_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"lost_reason" text,
	"estimated_value_cents" bigint,
	"converted_customer_id" uuid,
	"converted_at" timestamp with time zone,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"external_ghl_contact_id" text,
	"external_ghl_opportunity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "leads_business_id_code_unique" UNIQUE("business_id","code"),
	CONSTRAINT "leads_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "leads_ghl_contact_key" UNIQUE("business_id","external_ghl_contact_id")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tendered_cents" bigint,
	"change_cents" bigint,
	"reference" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"received_by_membership_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"idempotency_key" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text DEFAULT 'spectacles' NOT NULL,
	"examined_on" date NOT NULL,
	"expires_on" date,
	"practitioner_membership_id" uuid,
	"od_sphere" numeric(5, 2),
	"od_cylinder" numeric(5, 2),
	"od_axis" smallint,
	"od_add" numeric(4, 2),
	"os_sphere" numeric(5, 2),
	"os_cylinder" numeric(5, 2),
	"os_axis" smallint,
	"os_add" numeric(4, 2),
	"pd_distance" numeric(4, 1),
	"notes" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescriptions_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "prescriptions_axis_range" CHECK (("prescriptions"."od_axis" is null or "prescriptions"."od_axis" between 0 and 180) and ("prescriptions"."os_axis" is null or "prescriptions"."os_axis" between 0 and 180))
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_categories_business_id_slug_unique" UNIQUE("business_id","slug"),
	CONSTRAINT "product_categories_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"label" text DEFAULT 'Default' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" bigint NOT NULL,
	"cost_cents" bigint DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"reorder_qty" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "product_variants_business_id_sku_unique" UNIQUE("business_id","sku"),
	CONSTRAINT "product_variants_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "product_variants_amounts" CHECK ("product_variants"."price_cents" >= 0 and "product_variants"."cost_cents" >= 0 and "product_variants"."reorder_point" >= 0 and "product_variants"."reorder_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"supplier_id" uuid,
	"name" text NOT NULL,
	"brand" text,
	"description" text,
	"image_url" text,
	"product_type" "product_type" DEFAULT 'stock' NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"show_on_website" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "products_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint NOT NULL,
	CONSTRAINT "purchase_order_items_purchase_order_id_variant_id_unique" UNIQUE("purchase_order_id","variant_id"),
	CONSTRAINT "purchase_order_items_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "purchase_order_items_quantities" CHECK ("purchase_order_items"."quantity_ordered" > 0 and "purchase_order_items"."quantity_received" >= 0 and "purchase_order_items"."quantity_received" <= "purchase_order_items"."quantity_ordered" and "purchase_order_items"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by_membership_id" uuid,
	"notes" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_receipts_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"ordered_at" timestamp with time zone,
	"expected_on" date,
	"notes" text,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"created_by_membership_id" uuid,
	"approved_by_membership_id" uuid,
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_business_id_number_unique" UNIQUE("business_id","number"),
	CONSTRAINT "purchase_orders_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "refund_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"restock" boolean NOT NULL,
	CONSTRAINT "refund_items_amounts" CHECK ("refund_items"."quantity" > 0 and "refund_items"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"cost_reversal_cents" bigint DEFAULT 0 NOT NULL,
	"method" "refund_method" NOT NULL,
	"reason" text NOT NULL,
	"processed_by_membership_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_business_id_number_unique" UNIQUE("business_id","number"),
	CONSTRAINT "refunds_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "refunds_amounts" CHECK ("refunds"."amount_cents" > 0 and "refunds"."tax_cents" >= 0 and "refunds"."cost_reversal_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"category_id" uuid,
	"product_name" text NOT NULL,
	"variant_label" text,
	"sku" text NOT NULL,
	"product_type" "product_type" NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"net_cents" bigint NOT NULL,
	"line_total_cents" bigint NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"refunded_quantity" integer DEFAULT 0 NOT NULL,
	"prescription_id" uuid,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sale_items_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "sale_items_amounts" CHECK ("sale_items"."quantity" > 0 and "sale_items"."refunded_quantity" >= 0 and "sale_items"."refunded_quantity" <= "sale_items"."quantity" and "sale_items"."unit_price_cents" >= 0 and "sale_items"."discount_cents" >= 0 and "sale_items"."tax_cents" >= 0 and "sale_items"."net_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" "sale_kind" NOT NULL,
	"status" "sale_status" NOT NULL,
	"fulfillment_status" "fulfillment_status" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"branch_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"customer_id" uuid,
	"sold_by_membership_id" uuid,
	"currency" text NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"prices_include_tax" boolean NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"cost_cents" bigint DEFAULT 0 NOT NULL,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"refunded_cents" bigint DEFAULT 0 NOT NULL,
	"refunded_cash_cents" bigint DEFAULT 0 NOT NULL,
	"balance_due_cents" bigint NOT NULL,
	"order_discount_type" text,
	"order_discount_value" bigint,
	"notes" text,
	"due_on" date,
	"lab_supplier_id" uuid,
	"lab_reference" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_business_id_number_unique" UNIQUE("business_id","number"),
	CONSTRAINT "sales_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "sales_amounts" CHECK ("sales"."subtotal_cents" >= 0 and "sales"."discount_cents" >= 0 and "sales"."tax_cents" >= 0 and "sales"."total_cents" >= 0 and "sales"."paid_cents" >= 0 and "sales"."refunded_cents" >= 0 and "sales"."refunded_cash_cents" >= 0 and "sales"."refunded_cash_cents" <= "sales"."paid_cents" and "sales"."refunded_cents" <= "sales"."total_cents" and "sales"."balance_due_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"on_hand_after" integer NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"reason" text,
	"reference_type" text,
	"reference_id" uuid,
	"reference_line_id" uuid,
	"idempotency_key" text,
	"actor_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("stock_movements"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "stock_reservations_quantity_positive" CHECK ("stock_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"payment_terms" text,
	"lead_time_days" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "suppliers_business_id_code_unique" UNIQUE("business_id","code"),
	CONSTRAINT "suppliers_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_types" ADD CONSTRAINT "appointment_types_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_appointment_type_id_appointment_types_business_id_id_fk" FOREIGN KEY ("business_id","appointment_type_id") REFERENCES "public"."appointment_types"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_lead_id_leads_business_id_id_fk" FOREIGN KEY ("business_id","lead_id") REFERENCES "public"."leads"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_practitioner_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","practitioner_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_created_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","created_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_actor_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","actor_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_default_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","default_branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_sequences" ADD CONSTRAINT "business_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_home_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","home_branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_converted_from_lead_id_leads_business_id_id_fk" FOREIGN KEY ("business_id","converted_from_lead_id") REFERENCES "public"."leads"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_created_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","created_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_category_id_expense_categories_business_id_id_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."expense_categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_created_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","created_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_events" ADD CONSTRAINT "integration_sync_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_business_id_variant_id_product_variants_business_id_id_fk" FOREIGN KEY ("business_id","variant_id") REFERENCES "public"."product_variants"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_business_id_location_id_inventory_locations_business_id_id_fk" FOREIGN KEY ("business_id","location_id") REFERENCES "public"."inventory_locations"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_business_id_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_business_id_lead_id_leads_business_id_id_fk" FOREIGN KEY ("business_id","lead_id") REFERENCES "public"."leads"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_business_id_actor_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","actor_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_assigned_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","assigned_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_preferred_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","preferred_branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_converted_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","converted_customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_sale_id_sales_business_id_id_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_received_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","received_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_business_id_practitioner_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","practitioner_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_business_id_product_id_products_business_id_id_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_category_id_product_categories_business_id_id_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."product_categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_supplier_id_suppliers_business_id_id_fk" FOREIGN KEY ("business_id","supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_business_id_purchase_order_id_purchase_orders_business_id_id_fk" FOREIGN KEY ("business_id","purchase_order_id") REFERENCES "public"."purchase_orders"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_business_id_variant_id_product_variants_business_id_id_fk" FOREIGN KEY ("business_id","variant_id") REFERENCES "public"."product_variants"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_business_id_purchase_order_id_purchase_orders_business_id_id_fk" FOREIGN KEY ("business_id","purchase_order_id") REFERENCES "public"."purchase_orders"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_business_id_received_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","received_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_supplier_id_suppliers_business_id_id_fk" FOREIGN KEY ("business_id","supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_location_id_inventory_locations_business_id_id_fk" FOREIGN KEY ("business_id","location_id") REFERENCES "public"."inventory_locations"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_created_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","created_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_business_id_approved_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","approved_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_business_id_refund_id_refunds_business_id_id_fk" FOREIGN KEY ("business_id","refund_id") REFERENCES "public"."refunds"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_business_id_sale_item_id_sale_items_business_id_id_fk" FOREIGN KEY ("business_id","sale_item_id") REFERENCES "public"."sale_items"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_business_id_sale_id_sales_business_id_id_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_business_id_processed_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","processed_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_sale_id_sales_business_id_id_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_variant_id_product_variants_business_id_id_fk" FOREIGN KEY ("business_id","variant_id") REFERENCES "public"."product_variants"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_category_id_product_categories_business_id_id_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."product_categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_prescription_id_prescriptions_business_id_id_fk" FOREIGN KEY ("business_id","prescription_id") REFERENCES "public"."prescriptions"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_branch_id_branches_business_id_id_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_location_id_inventory_locations_business_id_id_fk" FOREIGN KEY ("business_id","location_id") REFERENCES "public"."inventory_locations"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_sold_by_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","sold_by_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_lab_supplier_id_suppliers_business_id_id_fk" FOREIGN KEY ("business_id","lab_supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_variant_id_product_variants_business_id_id_fk" FOREIGN KEY ("business_id","variant_id") REFERENCES "public"."product_variants"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_location_id_inventory_locations_business_id_id_fk" FOREIGN KEY ("business_id","location_id") REFERENCES "public"."inventory_locations"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_actor_membership_id_business_memberships_business_id_id_fk" FOREIGN KEY ("business_id","actor_membership_id") REFERENCES "public"."business_memberships"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_business_id_variant_id_product_variants_business_id_id_fk" FOREIGN KEY ("business_id","variant_id") REFERENCES "public"."product_variants"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_business_id_location_id_inventory_locations_business_id_id_fk" FOREIGN KEY ("business_id","location_id") REFERENCES "public"."inventory_locations"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_business_id_sale_id_sales_business_id_id_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_business_id_sale_item_id_sale_items_business_id_id_fk" FOREIGN KEY ("business_id","sale_item_id") REFERENCES "public"."sale_items"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_business_id_starts_at_index" ON "appointments" USING btree ("business_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_business_id_practitioner_membership_id_starts_at_index" ON "appointments" USING btree ("business_id","practitioner_membership_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_business_id_customer_id_index" ON "appointments" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "audit_logs_business_id_created_at_index" ON "audit_logs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_business_id_entity_type_entity_id_index" ON "audit_logs" USING btree ("business_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "customers_business_id_created_at_index" ON "customers" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("business_id",lower("email"));--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("business_id",lower("last_name"),lower("first_name"));--> statement-breakpoint
CREATE INDEX "expenses_business_id_expense_date_index" ON "expenses" USING btree ("business_id","expense_date");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_sync_events_idempotency_key" ON "integration_sync_events" USING btree ("business_id","provider","direction","idempotency_key") WHERE "integration_sync_events"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "integration_sync_events_business_id_status_next_attempt_at_index" ON "integration_sync_events" USING btree ("business_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "inventory_balances_business_id_location_id_index" ON "inventory_balances" USING btree ("business_id","location_id");--> statement-breakpoint
CREATE INDEX "lead_activities_business_id_lead_id_created_at_index" ON "lead_activities" USING btree ("business_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_business_id_stage_index" ON "leads" USING btree ("business_id","stage");--> statement-breakpoint
CREATE INDEX "leads_business_id_assigned_membership_id_index" ON "leads" USING btree ("business_id","assigned_membership_id");--> statement-breakpoint
CREATE INDEX "leads_business_id_follow_up_at_index" ON "leads" USING btree ("business_id","follow_up_at");--> statement-breakpoint
CREATE INDEX "leads_business_id_created_at_index" ON "leads" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree (lower("email"),"created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key" ON "payments" USING btree ("business_id","idempotency_key") WHERE "payments"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_key" ON "payments" USING btree ("business_id","method","reference") WHERE "payments"."reference" is not null and "payments"."status" = 'completed';--> statement-breakpoint
CREATE INDEX "payments_business_id_received_at_index" ON "payments" USING btree ("business_id","received_at");--> statement-breakpoint
CREATE INDEX "payments_business_id_sale_id_index" ON "payments" USING btree ("business_id","sale_id");--> statement-breakpoint
CREATE INDEX "prescriptions_business_id_customer_id_examined_on_index" ON "prescriptions" USING btree ("business_id","customer_id","examined_on");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants" USING btree ("business_id","barcode") WHERE "product_variants"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "product_variants_business_id_product_id_index" ON "product_variants" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "products_business_id_category_id_index" ON "products" USING btree ("business_id","category_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("business_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_receipts_idempotency_key" ON "purchase_order_receipts" USING btree ("business_id","idempotency_key") WHERE "purchase_order_receipts"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "purchase_orders_business_id_status_index" ON "purchase_orders" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "refund_items_business_id_refund_id_index" ON "refund_items" USING btree ("business_id","refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_key" ON "refunds" USING btree ("business_id","idempotency_key") WHERE "refunds"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "refunds_business_id_created_at_index" ON "refunds" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "sale_items_business_id_sale_id_index" ON "sale_items" USING btree ("business_id","sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_business_id_variant_id_index" ON "sale_items" USING btree ("business_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_key" ON "sales" USING btree ("business_id","idempotency_key") WHERE "sales"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "sales_business_id_completed_at_index" ON "sales" USING btree ("business_id","completed_at");--> statement-breakpoint
CREATE INDEX "sales_business_id_created_at_index" ON "sales" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_business_id_customer_id_index" ON "sales" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "sales_business_id_kind_fulfillment_status_index" ON "sales" USING btree ("business_id","kind","fulfillment_status");--> statement-breakpoint
CREATE INDEX "sales_business_id_sold_by_membership_id_index" ON "sales" USING btree ("business_id","sold_by_membership_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_idempotency_key" ON "stock_movements" USING btree ("business_id","idempotency_key") WHERE "stock_movements"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "stock_movements_business_id_variant_id_created_at_index" ON "stock_movements" USING btree ("business_id","variant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_business_id_created_at_index" ON "stock_movements" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_business_id_reference_type_reference_id_index" ON "stock_movements" USING btree ("business_id","reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_reservations_active_item_key" ON "stock_reservations" USING btree ("sale_item_id") WHERE "stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "stock_reservations_business_id_status_index" ON "stock_reservations" USING btree ("business_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));