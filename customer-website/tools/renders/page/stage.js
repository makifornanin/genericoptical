// Path-traced studio: seamless cove, soft boxes, camera fitting, float readback and compositing.
import * as THREE from "three";
import { WebGLPathTracer, GradientEquirectTexture, PhysicalCamera } from "three-gpu-pathtracer";
import { SET } from "./materials.js";

let renderer;
let tracer;

export function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  tracer = new WebGLPathTracer(renderer);
  tracer.renderToCanvas = false;
  tracer.rasterizeScene = false;
  tracer.renderDelay = 0;
  tracer.minSamples = 0;
  tracer.fadeDuration = 0;
  tracer.dynamicLowRes = false;
  tracer.bounces = 9;
  tracer.transmissiveBounces = 14;
  tracer.filterGlossyFactor = 0.15;
  tracer.multipleImportanceSampling = true;
  tracer.tiles.set(2, 2);
}

export const glInfo = () => {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
};

// ─── Sets ────────────────────────────────────────────────────────────────────

/** A seamless paper cove: floor running into a curved back wall (profile swept along x). */
export function cove({ radius = 380, back = -520, front = 1600, top = 1600, width = 5000, material = SET.seamless() } = {}) {
  const profile = [];
  profile.push([front, 0]);
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * (Math.PI / 2);
    profile.push([back + radius - Math.sin(a) * radius, radius - Math.cos(a) * radius]);
  }
  profile.push([back, top]);
  const positions = [];
  const indices = [];
  profile.forEach(([z, y]) => {
    positions.push(-width / 2, y, z, width / 2, y, z);
  });
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const uv = [];
  profile.forEach(([z, y]) => uv.push(0, (y - z) / 1000, 1, (y - z) / 1000));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(g, material);
  mesh.name = "cove";
  return mesh;
}

export function studioLights(scene, { key = 1, strips = 1, back = 1, warm = false } = {}) {
  const env = new GradientEquirectTexture(512);
  env.topColor.set(warm ? 0xfffaf2 : 0xffffff);
  env.bottomColor.set(0x8a8a88);
  env.exponent = 1.6;
  env.update();
  scene.environment = env;
  scene.background = env;
  scene.environmentIntensity = 0.55;
  const add = (intensity, w, h, pos, look) => {
    const l = new THREE.RectAreaLight(0xffffff, intensity, w, h);
    l.position.set(...pos);
    l.lookAt(...look);
    scene.add(l);
    return l;
  };
  // Overhead soft box (shape and contact shadow), two narrow strips (crisp highlight lines on glossy
  // acetate and metal), and a weak back light to separate the temples from the backdrop.
  if (key) add(4.2 * key, 760, 420, [0, 820, 260], [0, 0, 0]);
  if (strips) {
    add(9 * strips, 46, 640, [-560, 240, 300], [0, 30, 0]);
    add(6 * strips, 46, 640, [560, 240, 300], [0, 30, 0]);
  }
  if (back) add(1.6 * back, 700, 300, [0, 520, -700], [0, 0, 0]);
  // Black flag behind the camera: glossy black acetate reflects it instead of the white studio,
  // so it reads black rather than grey (standard packshot practice). Out of frame for every angle.
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1100), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  flag.position.set(0, 560, 1250);
  flag.lookAt(0, 60, 0);
  flag.name = "flag";
  scene.add(flag);
}

// ─── Camera ──────────────────────────────────────────────────────────────────

/** Places a long-lens camera on a sphere around `object` so it fills `fill` of the frame width. */
export function fitCamera(object, { azimuth = 0, elevation = 10, fov = 18, aspect = 4 / 3, fill = 0.72, maxFillY = 0.78, lift = 0 } = {}) {
  const camera = new PhysicalCamera(fov, aspect, 5, 20000);
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  centre.y += lift;
  const dir = new THREE.Vector3(Math.sin((azimuth * Math.PI) / 180) * Math.cos((elevation * Math.PI) / 180), Math.sin((elevation * Math.PI) / 180), Math.cos((azimuth * Math.PI) / 180) * Math.cos((elevation * Math.PI) / 180));
  let dist = 600;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  for (let i = 0; i < 6; i++) {
    camera.position.copy(centre).addScaledVector(dir, dist);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      const p = c.clone().project(camera);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const sx = (maxX - minX) / 2 / fill;
    const sy = (maxY - minY) / 2 / maxFillY;
    dist *= Math.max(sx, sy);
  }
  camera.position.copy(centre).addScaledVector(dir, dist);
  camera.lookAt(centre);
  camera.focusDistance = dist;
  camera.fStop = 22; // keep the whole frame sharp for packshots
  camera.updateMatrixWorld();
  return camera;
}

// ─── Tracing ─────────────────────────────────────────────────────────────────

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function trace(scene, camera, { width, height, samples }) {
  // Keep every GPU dispatch short (Windows resets the GPU if one call runs for ~2 s): more tiles
  // for bigger images.
  const tiles = Math.max(2, Math.ceil(Math.sqrt((width * height) / 250_000)));
  tracer.tiles.set(tiles, tiles);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  tracer.setScene(scene, camera);
  tracer.reset();
  const started = performance.now();
  // Shaders compile asynchronously; renderSample() is a no-op until they are ready.
  while (tracer.samples < samples) {
    tracer.renderSample();
    await tick();
    if (performance.now() - started > 15 * 60_000) throw new Error(`trace timed out at ${tracer.samples} samples`);
  }
  if (renderer.getContext().isContextLost()) throw new Error("CONTEXT_LOST");
  const buf = new Float32Array(width * height * 4);
  renderer.readRenderTargetPixels(tracer.target, 0, 0, width, height, buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4 * 97) sum += buf[i] + buf[i + 1] + buf[i + 2];
  if (!(sum > 1e-3)) throw new Error("BLANK_RENDER");
  const mid = ((height >> 1) * width + (width >> 1)) * 4;
  console.log(`trace ${width}x${height} samples=${tracer.samples.toFixed(1)} ${((performance.now() - started) / 1000).toFixed(1)}s centre=${buf[mid].toFixed(3)},${buf[mid + 1].toFixed(3)},${buf[mid + 2].toFixed(3)}`);
  return buf;
}

// ─── Compositing ─────────────────────────────────────────────────────────────

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** Soft shoulder above `knee` so specular highlights roll off instead of clipping. */
const shoulder = (v, knee = 0.82) => (v <= knee ? v : knee + (1 - knee) * (1 - Math.exp(-(v - knee) / (1 - knee))));

function boxBlur(buf, w, h, r) {
  const out = new Float32Array(buf.length);
  const tmp = new Float32Array(buf.length);
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += buf[(y * w + Math.min(w - 1, Math.max(0, x))) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = acc / (2 * r + 1);
        const add = Math.min(w - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        acc += buf[(y * w + add) * 4 + c] - buf[(y * w + sub) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = acc / (2 * r + 1);
        const add = Math.min(h - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        acc += tmp[(add * w + x) * 4 + c] - tmp[(sub * w + x) * 4 + c];
      }
    }
  }
  return out;
}

/**
 * Divides the object pass by the empty-set plate, so the background becomes exactly `background`
 * (sRGB) while shadows, reflections and the object keep their relative light. Returns a canvas.
 */
export function compositeOnPlate(obj, plate, w, h, background = [240, 240, 237], exposure = 1) {
  const smoothPlate = boxBlur(plate, w, h, 6);
  const bg = background.map(toLinear);
  const ratio = new Float32Array(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) ratio[p * 3 + c] = obj[p * 4 + c] / Math.max(smoothPlate[p * 4 + c], 1e-5);
  }
  const clean = bilateral(ratio, w, h, 3, 0.035);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y; // GL rows are bottom-up
    for (let x = 0; x < w; x++) {
      const i = (sy * w + x) * 3;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        img.data[o + c] = Math.round(Math.min(1, Math.max(0, toSrgb(shoulder(clean[i + c] * bg[c] * exposure)))) * 255);
      }
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Edge-preserving smoothing (3-channel float image): averages neighbours whose luminance is within
 * `sigmaR`, so path-tracing grain in flat backdrop and shadow areas disappears while edges stay sharp.
 */
function bilateral(src, w, h, radius, sigmaR) {
  const out = new Float32Array(src.length);
  const lum = (i) => 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
  const spatial = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) spatial.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * (radius * 0.7) ** 2))]);
  const inv = 1 / (2 * sigmaR * sigmaR);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const l0 = lum(i);
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (const [dx, dy, ws] of spatial) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 3;
        const d = lum(j) - l0;
        const wt = ws * Math.exp(-d * d * inv);
        r += src[j] * wt;
        g += src[j + 1] * wt;
        b += src[j + 2] * wt;
        wsum += wt;
      }
      out[i] = r / wsum;
      out[i + 1] = g / wsum;
      out[i + 2] = b / wsum;
    }
  }
  return out;
}

/** Straight tone-map of a single pass (editorial scenes with real backgrounds). */
export function developPass(buf, w, h, { exposure = 1, contrast = 1, lift = 0, saturation = 1, grade = [1, 1, 1] } = {}) {
  removeFireflies(buf, w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const i = (sy * w + x) * 4;
      const o = (y * w + x) * 4;
      let rgb = [0, 1, 2].map((c) => buf[i + c] * exposure * grade[c]);
      const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      rgb = rgb.map((v) => lum + (v - lum) * saturation);
      for (let c = 0; c < 3; c++) {
        let v = shoulder(Math.max(0, rgb[c]), 0.7);
        v = toSrgb(Math.min(1, v));
        v = 0.5 + (v - 0.5) * contrast + lift;
        img.data[o + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Replaces isolated over-bright pixels (path-tracing "fireflies") with their neighbourhood mean. */
function removeFireflies(buf, w, h, factor = 3.5) {
  const lum = (i) => 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const l = lum(i);
      let sum = 0;
      const acc = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = ((y + dy) * w + (x + dx)) * 4;
          sum += lum(j);
          acc[0] += buf[j];
          acc[1] += buf[j + 1];
          acc[2] += buf[j + 2];
        }
      }
      const mean = sum / 8;
      if (l > mean * factor + 0.05) {
        buf[i] = acc[0] / 8;
        buf[i + 1] = acc[1] / 8;
        buf[i + 2] = acc[2] / 8;
      }
    }
  }
}

/** Encodes a canvas at several widths as WebP data URLs (high-quality stepped downscale). */
export async function encode(canvas, widths, quality = 0.88) {
  const out = {};
  for (const w of widths) {
    let src = canvas;
    while (src.width / 2 >= w) {
      const half = document.createElement("canvas");
      half.width = Math.round(src.width / 2);
      half.height = Math.round(src.height / 2);
      const c = half.getContext("2d");
      c.imageSmoothingQuality = "high";
      c.drawImage(src, 0, 0, half.width, half.height);
      src = half;
    }
    const dst = document.createElement("canvas");
    dst.width = w;
    dst.height = Math.round((canvas.height / canvas.width) * w);
    const c = dst.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(src, 0, 0, dst.width, dst.height);
    out[w] = dst.toDataURL("image/webp", quality);
  }
  return out;
}
