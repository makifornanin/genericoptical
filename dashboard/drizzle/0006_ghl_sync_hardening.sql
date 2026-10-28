ALTER TABLE "ghl_opportunities" ADD COLUMN "last_pushed" jsonb;--> statement-breakpoint
-- Audit finding A18: refunds created before migration 0002 defaulted to affects_revenue = true. A
-- refund issued before the sale was completed (or on a sale that never completed) returned a deposit,
-- not revenue. Idempotent: rows written by current code already have the right value.
UPDATE "refunds" r SET "affects_revenue" = false
FROM "sales" s
WHERE s."id" = r."sale_id" AND s."business_id" = r."business_id" AND r."affects_revenue" = true
  AND s."kind" = 'order' AND (s."completed_at" IS NULL OR r."created_at" < s."completed_at");
