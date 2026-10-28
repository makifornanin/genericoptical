ALTER TABLE "sales" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
-- Backfill from the audit trail: the last transition to "ready for pickup" per order.
UPDATE "sales" s SET "ready_at" = a.ready_at
FROM (
  SELECT "entity_id", max("created_at") AS ready_at
  FROM "audit_logs"
  WHERE "action" = 'order.status_changed' AND "changes" -> 'fulfillmentStatus' ->> 'to' = 'ready_for_pickup'
  GROUP BY "entity_id"
) a
WHERE a."entity_id" = s."id" AND s."kind" = 'order';
