/**
 * Receipt wording shared by the printable receipt and the PDF. The platform isn't registered with any
 * tax authority as an invoicing system, so its receipts must never pass for official tax documents.
 */
export const RECEIPT_DISCLAIMER = "This is not an official receipt or tax invoice.";
export const MANUAL_PAYMENT_NOTE = "Card, e-wallet and bank payments were confirmed on an external terminal or app and recorded manually.";
export const NON_CASH_METHODS = new Set(["card", "gcash", "maya", "bank_transfer", "other"]);
