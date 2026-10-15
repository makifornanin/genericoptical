import type { Handler } from "../engine";
import { appointmentPush, inboundAppointment } from "./appointments";
import { customerUpsert, inboundContact, leadUpsert, orderReady } from "./contacts";
import { inboundOpportunity, saleSync } from "./opportunities";
import { orderImport } from "./orders";
import { inventoryPush, productSync } from "./products";
import { refreshMetadata } from "./system";

/** Event type → handler. Phase 1 event names are kept so queued events still drain after the upgrade. */
export const HANDLERS: Record<string, Handler> = {
  // outbound
  "lead.upsert": leadUpsert,
  "customer.upsert": customerUpsert,
  "order.ready": orderReady,
  "sale.sync": saleSync,
  "product.sync": productSync,
  "inventory.push": inventoryPush,
  "appointment.push": appointmentPush,
  "system.refresh_metadata": refreshMetadata,
  // inbound
  "ghl.ContactCreate": inboundContact,
  "ghl.ContactUpdate": inboundContact,
  "ghl.ContactTagUpdate": inboundContact,
  "ghl.ContactDelete": inboundContact,
  "ghl.OpportunityCreate": inboundOpportunity,
  "ghl.OpportunityUpdate": inboundOpportunity,
  "ghl.OpportunityStageUpdate": inboundOpportunity,
  "ghl.OpportunityStatusUpdate": inboundOpportunity,
  "ghl.OpportunityMonetaryValueUpdate": inboundOpportunity,
  "ghl.OpportunityAssignedToUpdate": inboundOpportunity,
  "ghl.OpportunityDelete": inboundOpportunity,
  "ghl.AppointmentCreate": inboundAppointment,
  "ghl.AppointmentUpdate": inboundAppointment,
  "ghl.AppointmentDelete": inboundAppointment,
  "order.import": orderImport,
  // Phase 1 names
  "contact.upsert": leadUpsert,
  "opportunity.stage": leadUpsert,
  "order.ready_for_pickup": orderReady,
  "appointment.upsert": appointmentPush,
};
