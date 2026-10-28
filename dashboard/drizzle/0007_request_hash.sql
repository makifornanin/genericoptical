ALTER TABLE "payments" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "request_hash" text;