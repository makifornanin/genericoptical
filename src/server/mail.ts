import "server-only";

export type MailResult = { delivered: boolean; reason?: string };

/**
 * Outbound email adapter. No email provider is integrated in this build: in development the
 * message is logged on the server so flows (e.g. password reset) can be exercised; in production
 * it is reported as undelivered. Owners can always issue a temporary password from Staff.
 * To enable delivery, implement a provider here (SMTP, Resend, Postmark…).
 */
export async function sendMail(message: { to: string; subject: string; text: string }): Promise<MailResult> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`\n[mail:not-configured] To: ${message.to}\nSubject: ${message.subject}\n${message.text}\n`);
  }
  return { delivered: false, reason: "not_configured" };
}

/** Whether email can actually be delivered. Flip to true once a provider is implemented above. */
export const emailDeliveryAvailable = () => false;
