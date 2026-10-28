/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks ink or white text for a background, whichever contrasts more. */
export function readableOn(bg: string, ink = "#18191b", light = "#ffffff") {
  return contrast(bg, ink) >= contrast(bg, light) ? ink : light;
}

/** CSS variables that apply a business's brand colours. */
export function brandVars(brandColor: string, accentColor: string): Record<string, string> {
  return {
    "--brand": brandColor,
    "--brand-ink": readableOn(brandColor),
    "--accent": accentColor,
    "--accent-ink": readableOn(accentColor),
  };
}
