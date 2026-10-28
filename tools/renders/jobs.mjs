// Render jobs: one entry per catalogue product colourway, keyed by the product's public slug
// (the dashboard derives it from the product name). Shapes follow the demo catalogue's attributes.

const se = (w, h, n, extra = {}) => ({ kind: "se", w, h, n, ...extra });

const RECT = (w = 52, h = 36) => se(w, h, 3.3, { taper: 0.1, flatTop: 0.2 });
const SQUARE = (w = 50, h = 43) => se(w, h, 4, { taper: 0.07, flatTop: 0.15 });
const ROUND = (d = 47) => se(d, d * 0.95, 2.05);
const OVAL = (w = 51, h = 37) => se(w, h, 2.25, { taper: 0.04 });
const spline = (w, h, points) => ({ kind: "spline", w, h, points });
// Brow rising from the nose to a lifted outer corner; the outer side tapers down and in to a narrower base.
const CAT = (w = 53, h = 40) =>
  spline(w, h, [
    [-0.95, 0.22], [-0.7, 0.52], [-0.15, 0.62], [0.45, 0.78], [0.86, 0.98], [1.0, 0.8], [0.93, 0.32],
    [0.72, -0.28], [0.36, -0.8], [-0.12, -0.98], [-0.6, -0.84], [-0.9, -0.4],
  ]);
// Teardrop: near-straight brow, deepest point towards the nose, outer side sloping up.
const AVIATOR = (w = 57, h = 50) =>
  spline(w, h, [
    [-0.92, 0.72], [-0.4, 0.96], [0.3, 0.98], [0.8, 0.86], [1.0, 0.45], [0.94, -0.05], [0.7, -0.55],
    [0.32, -0.9], [-0.15, -1.0], [-0.56, -0.86], [-0.86, -0.46], [-1.0, 0.12],
  ]);
const HEX = (w = 50, h = 42) => ({ kind: "hex", w, h });

const acetate = (lens, o = {}) => ({ style: "acetate", lens, bridge: 19, rim: { top: 6.2, side: 5.2, bottom: 4.6 }, depth: 5.6, wrap: 0.0009, temple: { length: 143, drop: 17, width: 3.8, height: 7.6 }, ...o });
const metal = (lens, o = {}) => ({ style: "metal", lens, bridge: 20, wire: 0.8, wrap: 0.0008, temple: { length: 143, drop: 18, width: 1.5 }, ...o });

/** slug → { spec, colours[] } — colours are the catalogue's variant colours (frames) or lens tints (sunglasses). */
export const MODELS = {
  // Frames
  "arden-101": { spec: acetate(RECT(52, 36), { rim: { top: 5.6, side: 4.6, bottom: 4.1 }, depth: 5.2 }), colours: ["black", "tortoise"] },
  "arden-204": { spec: acetate(SQUARE(51, 44), { rim: { top: 7.2, side: 6, bottom: 5.2 }, depth: 6.2 }), colours: ["black", "crystal", "tortoise"] },
  "arden-round-33": { spec: acetate(ROUND(47), { rim: { top: 5.4, side: 5.2, bottom: 5 }, bridge: 20, pins: 1 }), colours: ["tortoise", "black"] },
  "halden-wire": { spec: metal(ROUND(48), { wire: 0.7, bridgeArch: 5 }), colours: ["gold"] },
  "halden-oval": { spec: metal(OVAL(50, 38), { wire: 0.72 }), colours: ["gold"] },
  "halden-aviator-rx": { spec: metal(AVIATOR(55, 47), { doubleBridge: true, bridge: 18 }), colours: ["gold", "black"] },
  "kiyo-slim": { spec: metal(RECT(53, 32), { wire: 0.85 }), colours: ["black", "gold"] },
  "kiyo-hex": { spec: metal(HEX(50, 42), { wire: 0.8 }), colours: ["gold", "black"] },
  "mesa-classic": { spec: acetate(RECT(51, 38), { style: "browline", rim: { top: 7.4, side: 5.6, bottom: 4, nasal: 3.6 }, depth: 6, browCut: 0.64, bridgeTop: 0.7 }), colours: ["black", "tortoise"] },
  "mesa-cat-9": { spec: acetate(CAT(52, 40), { rim: { top: 6.4, side: 5, bottom: 4.2, wing: 1.6 } }), colours: ["black", "tortoise", "crystal"] },
  "brio-junior": { spec: acetate(RECT(46, 31), { bridge: 16, rim: { top: 5.4, side: 4.8, bottom: 4.4 }, depth: 5, temple: { length: 128, drop: 15, width: 3.4, height: 6.6 } }), colours: ["crystal", "black"] },
  "brio-flex-kids": { spec: acetate(ROUND(44), { bridge: 16, rim: { top: 5, side: 5, bottom: 5 }, depth: 5, pins: false, temple: { length: 125, drop: 16, width: 3.4, height: 6.4 } }), colours: ["crystal", "tortoise"] },
  "vela-air": { spec: acetate(OVAL(51, 36), { rim: { top: 4.6, side: 4.2, bottom: 3.8 }, depth: 4.6, pins: 1 }), colours: ["crystal", "black"] },
  "vela-square-pro": { spec: acetate(SQUARE(53, 45), { rim: { top: 8, side: 6.6, bottom: 6 }, depth: 7, bridge: 20 }), colours: ["black", "tortoise"] },
  "solenne-muse": { spec: metal(CAT(53, 41), { wire: 0.9 }), colours: ["gold"] },
  "solenne-atelier": { spec: acetate(ROUND(49), { rim: { top: 6.4, side: 6, bottom: 5.6 }, depth: 6.4, bridge: 21 }), colours: ["tortoise", "black"] },
  "kiyo-titan": { spec: metal(RECT(54, 34), { wire: 0.95, trim: "black" }), colours: ["black"] },
  "arden-everyday": { spec: acetate(RECT(51, 35), { rim: { top: 5.6, side: 4.8, bottom: 4.4 }, depth: 5 }), colours: ["black", "crystal"] },
  "mesa-studio": { spec: acetate(SQUARE(50, 42), { rim: { top: 6.6, side: 5.6, bottom: 5 }, depth: 6 }), colours: ["black", "tortoise", "crystal"] },
  "halden-sable": { spec: acetate(OVAL(49, 37), { rim: { top: 5.6, side: 5, bottom: 4.6 }, pins: 1 }), colours: ["tortoise", "black"] },
};

/** Sunglasses: frame colour is fixed per model; variants differ by lens tint. */
export const SUN_MODELS = {
  "solenne-riviera": { spec: metal(AVIATOR(58, 50), { doubleBridge: true, sun: true, bridge: 17 }), frame: "gold", tints: ["green", "smoke"] },
  "mesa-coast": { spec: acetate(SQUARE(54, 45), { sun: true, rim: { top: 6.4, side: 5.4, bottom: 4.8 }, depth: 6 }), frame: "black", tints: ["smoke", "brown"] },
  "vela-drift": { spec: acetate(ROUND(50), { sun: true, rim: { top: 6, side: 5.8, bottom: 5.6 }, depth: 6 }), frame: "tortoise", tints: ["brown", "green"] },
  "mesa-cat-sun": { spec: acetate(CAT(55, 43), { sun: true, rim: { top: 7.6, side: 5.8, bottom: 5.2 }, depth: 6.4 }), frame: "black", tints: ["smoke"] },
  "kiyo-sport-polarised": { spec: acetate(RECT(57, 41), { sun: true, wrap: 0.0016, rim: { top: 6.4, side: 6.4, bottom: 5 }, depth: 6, tortoise: "tortoise" }), frame: "matteBlack", tints: ["smoke", "green"] },
  "brio-kids-sun": { spec: acetate(ROUND(45), { sun: true, bridge: 16, rim: { top: 5.6, side: 5.4, bottom: 5.4 }, depth: 5.2, pins: false, temple: { length: 125, drop: 16, width: 3.4, height: 6.4 } }), frame: "crystal", tints: ["smoke"] },
  "halden-pilot": { spec: metal(AVIATOR(57, 49), { doubleBridge: true, sun: true }), frame: "silver", tints: ["brown"] },
};

/** Accessories and contact lenses (one look each): rendered from two angles. */
export const PROPS = [
  "aquasoft-daily-30-pack",
  "aquasoft-monthly-6-pack",
  "aquasoft-toric-monthly-6-pack",
  "clearday-silicone-daily-30-pack",
  "clearday-bi-weekly-6-pack",
  "multipurpose-solution-120-ml",
  "multipurpose-solution-360-ml",
  "lens-cleaning-spray-60-ml",
  "anti-fog-wipes-30",
  "microfiber-cloth",
  "hard-shell-case",
  "kids-case",
  "folding-case",
  "retainer-cord",
  "beaded-eyewear-chain",
  "silicone-nose-pads-pair",
  "eyewear-repair-kit",
];
const PROP_VIEWS = { front: { azimuth: 24, elevation: 24, fill: 0.56, maxFillY: 0.62 }, angle: { azimuth: -32, elevation: 44, fill: 0.56, maxFillY: 0.62 } };

/** Editorial scenes (tools/renders/page/editorial.js) and their output size. */
export const SCENES = {
  "hero-glasses": [1600, 1780],
  "hero-sunglasses": [1600, 1780],
  "duo-sunglasses": [1600, 1600],
  "duo-contacts": [1600, 1600],
  "eye-exam": [1600, 1780],
  "store-wall": [1600, 1780],
  "about-bench": [1600, 1780],
  "collection-glasses": [2000, 1100],
  "collection-sunglasses": [2000, 1100],
  "detail-hinge": [2000, 1000],
};

export function jobs() {
  const list = [];
  const models = { ...Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [k, { spec: v.spec }])), ...Object.fromEntries(Object.entries(SUN_MODELS).map(([k, v]) => [k, { spec: v.spec }])) };
  for (const [scene, [width, height]] of Object.entries(SCENES)) {
    list.push({ id: `scene/${scene}`, kind: "scene", scene, models, width, height, samples: 480, widths: [width, Math.round(width / 2)], path: (_view, w) => `editorial/${scene}-${w}.webp` });
  }
  for (const slug of PROPS) {
    list.push({ id: `props/${slug}`, kind: "prop", prop: slug, samples: 256, plateSamples: 64, angles: ["front", "angle"], views: PROP_VIEWS, path: (view, w) => `products/${slug}/default-${view}-${w}.webp` });
  }
  for (const [slug, m] of Object.entries(MODELS)) {
    for (const colour of m.colours) {
      list.push({ id: `frames/${slug}/${colour}`, kind: "frame", spec: m.spec, colour, samples: 256, plateSamples: 72, path: (view, w) => `products/${slug}/${colour}-${view}-${w}.webp` });
    }
  }
  for (const [slug, m] of Object.entries(SUN_MODELS)) {
    for (const tint of m.tints) {
      list.push({ id: `sun/${slug}/${tint}`, kind: "frame", spec: { ...m.spec, tint }, colour: m.frame, samples: 256, plateSamples: 72, path: (view, w) => `products/${slug}/${tint}-${view}-${w}.webp` });
    }
  }
  return list;
}
