-- A practitioner can't hold two active appointments whose times overlap.
-- Enforced in the database so concurrent bookings can't slip past application checks.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_practitioner_overlap"
  EXCLUDE USING gist (
    "practitioner_membership_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("practitioner_membership_id" IS NOT NULL AND "status" IN ('scheduled', 'confirmed', 'completed'));
