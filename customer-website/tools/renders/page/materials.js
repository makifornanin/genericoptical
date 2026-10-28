// Physically based materials for frames, lenses, props and sets.
import * as THREE from "three";

// ─── Procedural textures ─────────────────────────────────────────────────────

function hash(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, octaves = 5) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    s += amp * valueNoise(x * f, y * f, seed + i * 13);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Tortoiseshell acetate: honey ground with dark, domain-warped blotches, slightly streaked. */
export function tortoiseTexture({ seed = 3, size = 1024, palette = "classic" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const pal =
    palette === "light"
      ? { light: [226, 160, 78], mid: [168, 96, 38], dark: [70, 34, 14] }
      : { light: [214, 136, 52], mid: [140, 70, 24], dark: [30, 13, 5] };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 17;
      const v = (y / size) * 7.5; // stretched: acetate blocks are cut from layered sheets
      const wx = fbm(u + 3.1, v + 1.7, seed, 4) * 2.6;
      const wy = fbm(u - 2.3, v + 4.1, seed + 9, 4) * 2.6;
      const n = fbm(u + wx, v + wy, seed + 21, 5);
      const fine = fbm(u * 5, v * 5, seed + 40, 3);
      const speck = fbm(u * 3.2 + wx, v * 3.2 + wy, seed + 60, 3);
      const darkT = Math.max(smoothstep(0.41, 0.55, n + (fine - 0.5) * 0.16), smoothstep(0.56, 0.66, speck) * 0.9);
      const midT = smoothstep(0.3, 0.46, n);
      const c = [0, 1, 2].map((k) => {
        const base = mix(pal.light[k], pal.mid[k], midT * 0.7);
        return mix(base, pal.dark[k], darkT) * (0.9 + fine * 0.2);
      });
      const i = (y * size + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Fine fibre/noise texture for paper, plaster and fabric sets (greyscale, used as roughness or colour). */
export function grainTexture({ seed = 5, size = 1024, scale = 40, contrast = 0.12, base = 0.85, tint = [1, 1, 1] } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * scale, (y / size) * scale, seed, 4);
      const v = Math.min(1, Math.max(0, base + (n - 0.5) * contrast * 2));
      const i = (y * size + x) * 4;
      img.data[i] = v * 255 * tint[0];
      img.data[i + 1] = v * 255 * tint[1];
      img.data[i + 2] = v * 255 * tint[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Materials ───────────────────────────────────────────────────────────────

const physical = (o) => new THREE.MeshPhysicalMaterial(o);

export const ACETATE = {
  black: () => physical({ color: 0x0b0b0c, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.49 }),
  // Tortoiseshell lets some light through its amber areas, which gives acetate its depth.
  tortoise: () => physical({ map: tortoiseTexture({ seed: 3 }), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.49, transmission: 0.28, thickness: 5, attenuationColor: new THREE.Color(0xb8661f), attenuationDistance: 7 }),
  tortoiseLight: () => physical({ map: tortoiseTexture({ seed: 11, palette: "light" }), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, transmission: 0.32, thickness: 5, attenuationColor: new THREE.Color(0xc77a2c), attenuationDistance: 8 }),
  crystal: () =>
    physical({
      color: 0xffffff,
      transmission: 1,
      thickness: 4,
      roughness: 0.06,
      ior: 1.49,
      attenuationColor: new THREE.Color(0xe9e2d4),
      attenuationDistance: 22,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
  smokeCrystal: () => physical({ color: 0xffffff, transmission: 1, thickness: 4, roughness: 0.06, ior: 1.49, attenuationColor: new THREE.Color(0x8d8a86), attenuationDistance: 9, clearcoat: 1 }),
  blush: () => physical({ color: 0xffffff, transmission: 1, thickness: 4, roughness: 0.07, ior: 1.49, attenuationColor: new THREE.Color(0xe3b8a8), attenuationDistance: 12, clearcoat: 1 }),
  matteBlack: () => physical({ color: 0x111112, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
};

export const METAL = {
  gold: () => physical({ color: 0xe1bf84, metalness: 1, roughness: 0.2 }),
  silver: () => physical({ color: 0xd6d7d9, metalness: 1, roughness: 0.18 }),
  black: () => physical({ color: 0x1c1c1e, metalness: 0.7, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
  gunmetal: () => physical({ color: 0x5b5d61, metalness: 1, roughness: 0.28 }),
};

export const LENS = {
  // Rendered as a thin surface (thickness 0, no attenuation): no refraction offset, so it converges fast.
  clear: () =>
    physical({
      color: 0xffffff,
      transmission: 1,
      thickness: 0,
      side: THREE.DoubleSide,
      roughness: 0,
      ior: 1.52,
      // Anti-reflection coated: about a quarter of bare glass's reflectance, with a faint coloured sheen.
      iridescence: 0.25,
      iridescenceIOR: 1.45,
      iridescenceThicknessRange: [300, 460],
      specularIntensity: 0.28,
    }),
  tint: (hex, distance = 1.1) =>
    physical({
      color: 0xffffff,
      transmission: 1,
      thickness: 1.6,
      roughness: 0,
      ior: 1.52,
      attenuationColor: new THREE.Color(hex),
      attenuationDistance: distance,
      specularIntensity: 1,
    }),
};

export const SUN_TINTS = { green: 0x2f3a2a, smoke: 0x252528, brown: 0x4a2c16 };

export const PAD = () => physical({ color: 0xffffff, transmission: 0.9, thickness: 1.5, roughness: 0.3, ior: 1.42, attenuationColor: new THREE.Color(0xf2ece0), attenuationDistance: 8 });

export const SET = {
  seamless: () => new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.95, metalness: 0 }),
};
