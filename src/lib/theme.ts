import type { CSSProperties } from "react";

/*
 * Business colours from the dashboard (brandColor for dark surfaces, accentColor for the eye-exam
 * call to action) become --theme-* custom properties; text on each is ink or white, whichever
 * contrasts more. Invalid or missing colours fall back to the defaults in styles/tokens.css.
 */

const INK = "#121212";

export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function inkFor(hex: string): string | null {
  const onInk = contrast(hex, INK);
  const onWhite = contrast(hex, "#ffffff");
  if (onInk === null || onWhite === null) return null;
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
    if (!ink || (contrast(value, ink) ?? 0) < 4.5) continue;
    style[`--theme-${name}`] = value;
    style[`--theme-${name}-ink`] = ink;
  }
  return style as CSSProperties;
}
