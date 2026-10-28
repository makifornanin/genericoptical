"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { CHAT_WIDGET, EMBED_SCRIPT, formUrl, INQUIRY_FORM } from "@/lib/ghl";

/** The business's GoHighLevel inquiry form, embedded as GHL provides it (submissions go to GHL). */
export function GhlInquiryForm() {
  const { id, name, height } = INQUIRY_FORM;
  return (
    <div className="ghl-embed">
      <iframe
        src={formUrl(id)}
        style={{ width: "100%", height, border: "none" }}
        id={`inline-${id}`}
        data-layout="{'id':'INLINE'}"
        data-trigger-type="alwaysShow"
        data-trigger-value=""
        data-activation-type="alwaysActivated"
        data-activation-value=""
        data-deactivation-type="neverDeactivate"
        data-deactivation-value=""
        data-form-name={name}
        data-height={String(height)}
        data-layout-iframe-id={`inline-${id}`}
        data-form-id={id}
        data-cookie-consent="true"
        data-cookie-consent-provider="auto"
        title={name}
      />
      <Script src={EMBED_SCRIPT} strategy="lazyOnload" />
    </div>
  );
}

/**
 * GoHighLevel's Conversation AI chat bubble. Not loaded on checkout, so no third-party script runs
 * where card details are typed; if it was loaded on an earlier page, it is hidden there.
 */
export function GhlChat() {
  const pathname = usePathname();
  const onCheckout = pathname.startsWith("/checkout");
  useEffect(() => {
    document.documentElement.toggleAttribute("data-hide-chat", onCheckout);
  }, [onCheckout]);
  if (onCheckout) return null;
  return <Script id="ghl-chat" src={CHAT_WIDGET.loader} data-resources-url={CHAT_WIDGET.resources} data-widget-id={CHAT_WIDGET.id} strategy="lazyOnload" />;
}
