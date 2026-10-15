-- Keep the tenant-safe composite FK customers(business_id, converted_from_lead_id) → leads(business_id, id).
-- It lives in SQL rather than schema.ts to avoid a TypeScript type cycle between customers and leads.
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_business_id_converted_from_lead_id_leads_business_id_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_converted_lead_fk"
  FOREIGN KEY ("business_id", "converted_from_lead_id") REFERENCES "leads"("business_id", "id");
