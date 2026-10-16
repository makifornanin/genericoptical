import type { CSSProperties } from "react";

/*
 * Business theme colours (ported from applyTheme/inkFor in the GHL-builder oc-site.js).
 * The colours come from the API (business.brandColor / accentColor) and are written server-side as
 * --oc-theme-* custom properties on the root .oc wrapper; the tokens in oc-base.css fall back to the
 * defaults when a colour is missing. Text on brand/accent is picked for contrast.
 */

const INK = "#18191b";

export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The text colour (ink or white) with the better contrast on `hex`, or null for an invalid colour. */
export function inkFor(hex: string): string | null {
  const L = luminance(hex);
  const inkL = luminance(INK);
  if (L === null || inkL === null) return null;
  const onWhite = 1.05 / (L + 0.05);
  const onInk = (L + 0.05) / (inkL + 0.05);
  return onInk >= onWhite ? INK : "#ffffff";
}

export function themeStyle(brand: string | null | undefined, accent: string | null | undefined): CSSProperties {
  const style: Record<string, string> = {};
  for (const [name, value] of [
    ["brand", brand],
    ["accent", accent],
  ] as const) {
    if (!value) continue;
    const ink = inkFor(value);
    if (!ink) continue;
    style[`--oc-theme-${name}`] = value;
    style[`--oc-theme-${name}-ink`] = ink;
  }
  return style as CSSProperties;
}
