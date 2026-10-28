// Editorial still lifes: hard sun, window shadows, stone and plaster, shallow depth of field.
// Each scene returns { scene, camera, develop }; renderEditorial traces it and encodes the result.
import * as THREE from "three";
import { GradientEquirectTexture, PhysicalCamera } from "three-gpu-pathtracer";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { sceneFrame } from "./frames.js";
import { grainTexture } from "./materials.js";
import { buildProp } from "./props.js";
import { developPass, encode, trace } from "./stage.js";

const physical = (o) => new THREE.MeshPhysicalMaterial(o);
const hex = (h) => new THREE.Color(h);

// ─── Surfaces ────────────────────────────────────────────────────────────────

function tinted(seed, scale, contrast, tint, base = 0.86) {
  const c = new THREE.Color(tint);
  const t = grainTexture({ seed, scale, contrast, base, tint: [c.r / base, c.g / base, c.b / base].map((v) => Math.min(1.15, v)) });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const plaster = (tint, seed = 1) => {
  const map = tinted(seed, 14, 0.07, tint);
  map.repeat.set(3, 3);
  return physical({ map, roughness: 0.92 });
};
const stone = (tint, seed = 2) => {
  const map = tinted(seed, 9, 0.16, tint);
  map.repeat.set(1, 1);
  return physical({ map, roughness: 0.78, clearcoat: 0.08, clearcoatRoughness: 0.6 });
};

/** Oak: fine streaks along x. */
function oak(tint = "#c49f76", seed = 5) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const base = new THREE.Color(tint);
  const img = ctx.createImageData(1024, 1024);
  for (let y = 0; y < 1024; y++) {
    const band = Math.sin(y * 0.11 + Math.sin(y * 0.013) * 6) * 0.5 + 0.5;
    for (let x = 0; x < 1024; x++) {
      const n = Math.sin(x * 0.004 + y * 0.03 + seed) * 0.5 + 0.5;
      const v = 0.86 + band * 0.1 - n * 0.05 + Math.sin((x + seed * 97) * 0.9 + y * 0.2) * 0.012;
      const i = (y * 1024 + x) * 4;
      img.data[i] = Math.min(255, base.r * 255 * v);
      img.data[i + 1] = Math.min(255, base.g * 255 * v);
      img.data[i + 2] = Math.min(255, base.b * 255 * v);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return physical({ map: t, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.4 });
}

function room(scene, { floor, wall, wallZ = -300, size = 6000 }) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floor);
  f.rotation.x = -Math.PI / 2;
  scene.add(f);
  if (wall) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wall);
    w.position.set(0, size / 2 - 1, wallZ);
    scene.add(w);
  }
}

function sky(scene, { top = 0xf4efe6, bottom = 0x6f6a62, intensity = 0.35 } = {}) {
  const env = new GradientEquirectTexture(256);
  env.topColor.set(top);
  env.bottomColor.set(bottom);
  env.exponent = 1.4;
  env.update();
  scene.environment = env;
  scene.background = env;
  scene.environmentIntensity = intensity;
}

function sun(scene, from, intensity = 3.2, color = 0xfff1dc) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(new THREE.Vector3(...from).normalize().multiplyScalar(4000));
  l.target.position.set(0, 0, 0);
  scene.add(l, l.target);
  return l;
}

/** A window frame between the sun and the set: its mullions cast a soft grid of shadow bars. */
function gobo(scene, from, { distance = 900, cols = 2, rows = 2, pane = [300, 380], bar = 34, center = [0, 0, 0] } = {}) {
  const w = cols * pane[0] + (cols + 1) * bar;
  const h = rows * pane[1] + (rows + 1) * bar;
  const outer = new THREE.Shape();
  outer.moveTo(-w * 2, -h * 2);
  outer.lineTo(w * 2, -h * 2);
  outer.lineTo(w * 2, h * 2);
  outer.lineTo(-w * 2, h * 2);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x0 = -w / 2 + bar + c * (pane[0] + bar);
      const y0 = -h / 2 + bar + r * (pane[1] + bar);
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x0, y0 + pane[1]);
      hole.lineTo(x0 + pane[0], y0 + pane[1]);
      hole.lineTo(x0 + pane[0], y0);
      outer.holes.push(hole);
    }
  }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(outer), physical({ color: 0x111111, roughness: 1, side: THREE.DoubleSide }));
  const dir = new THREE.Vector3(...from).normalize();
  const c = new THREE.Vector3(...center);
  m.position.copy(c).addScaledVector(dir, distance);
  m.lookAt(c);
  scene.add(m);
}

function camera({ pos, look, fov = 28, aspect, fStop = 11, focus = null }) {
  const cam = new PhysicalCamera(fov, aspect, 5, 40000);
  cam.position.set(...pos);
  cam.lookAt(new THREE.Vector3(...look));
  cam.fStop = fStop;
  cam.focusDistance = focus ?? cam.position.distanceTo(new THREE.Vector3(...look));
  cam.apertureBlades = 6;
  cam.updateMatrixWorld();
  return cam;
}

function place(obj, { x = 0, y = 0, z = 0, ry = 0 }) {
  obj.rotation.y = ry;
  obj.position.set(x, y, z);
  return obj;
}

// ─── Small props for scenes ──────────────────────────────────────────────────

function trialLens(power, positive) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(19, 1.3, 16, 96), physical({ color: 0xcfd0d2, metalness: 1, roughness: 0.25 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.3;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(18.6, 18.6, 1.4, 64), physical({ color: 0xffffff, transmission: 1, thickness: 1.4, roughness: 0, ior: 1.52 }));
  glass.position.y = 1.3;
  const tab = new THREE.Mesh(new RoundedBoxGeometry(14, 2.4, 6, 2, 0.8), physical({ color: positive ? 0xa12a22 : 0x161616, roughness: 0.45 }));
  tab.position.set(25, 1.3, 0);
  g.add(ring, glass, tab);
  g.userData.power = power;
  return g;
}

function letterChart() {
  const c = document.createElement("canvas");
  c.width = 800;
  c.height = 1130;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, 800, 1130);
  ctx.fillStyle = "#151515";
  ctx.textAlign = "center";
  const rows = ["E", "F P", "T O Z", "L P E D", "P E C F D", "E D F C Z P", "F E L O P Z D", "D E F P O T E C"];
  let y = 210;
  rows.forEach((r, i) => {
    const size = Math.round(200 / (1 + i * 0.62));
    ctx.font = `600 ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(r.split(" ").join("  "), 400, y);
    y += size * 1.05 + 26;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.BoxGeometry(210, 297, 1.5), physical({ color: 0xfbfaf7, roughness: 0.8 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(206, 292), physical({ map: t, roughness: 0.75 }));
  face.position.z = 0.8;
  const g = new THREE.Group();
  g.add(card, face);
  return g;
}

function lensCase() {
  const g = new THREE.Group();
  const body = physical({ color: 0xf2f1ec, roughness: 0.35 });
  for (const [x, cap] of [
    [-17, 0xf2f1ec],
    [17, 0x5f8696],
  ]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 14, 48), body);
    well.position.set(x, 7, 0);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 15.5, 7, 48), physical({ color: cap, roughness: 0.4 }));
    lid.position.set(x, 17, 0);
    g.add(well, lid);
  }
  const bridge = new THREE.Mesh(new RoundedBoxGeometry(20, 6, 10, 2, 2), body);
  bridge.position.y = 3;
  g.add(bridge);
  return g;
}

// ─── Scenes ──────────────────────────────────────────────────────────────────

const SCENES = {
  /** A tortoise round frame on a travertine block, window light across a plaster wall. */
  "hero-glasses": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { intensity: 0.62 });
    room(scene, { floor: plaster("#ebe4d8", 3), wall: plaster("#ece5d9", 4), wallZ: -230 });
    const block = new THREE.Mesh(new RoundedBoxGeometry(250, 120, 170, 4, 2.5), stone("#e2d9ca"));
    block.position.set(-15, 60, -45);
    scene.add(block);
    const frame = place(sceneFrame(m["solenne-atelier"].spec, "tortoise"), { x: -10, y: 120, z: -15, ry: -0.42 });
    scene.add(frame);
    const from = [-1, 1.05, 0.55];
    sun(scene, from, 3.6);
    gobo(scene, from, { distance: 1000, cols: 3, rows: 2, pane: [200, 300], bar: 30, center: [-10, 160, -120] });
    return { scene, camera: camera({ pos: [95, 225, 360], look: [-15, 138, -30], fov: 30, aspect, fStop: 7 }), develop: { exposure: 1.3, contrast: 1.03, saturation: 0.92, grade: [1.02, 1, 0.97] } };
  },

  /** Sunglasses on warm sand-coloured plaster under hard low sun. */
  "hero-sunglasses": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xfdf0dd, bottom: 0x6d6050, intensity: 0.5 });
    room(scene, { floor: plaster("#e8dcc8", 7), wall: plaster("#e9ddca", 8), wallZ: -520 });
    scene.add(place(sceneFrame({ ...m["solenne-riviera"].spec, tint: "green" }, "gold"), { x: -35, z: 40, ry: 0.38 }));
    scene.add(place(sceneFrame({ ...m["mesa-cat-sun"].spec, tint: "smoke" }, "black"), { x: 105, z: -150, ry: -0.5 }));
    sun(scene, [0.85, 0.62, -0.55], 4.2, 0xfff0d8);
    return { scene, camera: camera({ pos: [-40, 400, 470], look: [25, 10, -40], fov: 30, aspect, fStop: 8 }), develop: { exposure: 1.2, contrast: 1.05, saturation: 0.86, grade: [1.02, 1, 0.97] } };
  },

  /** Two pairs of sunglasses, one open and one folded, on cool grey stone; high, hard light. */
  "duo-sunglasses": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xf3f1ec, bottom: 0x5d6062, intensity: 0.55 });
    room(scene, { floor: stone("#c8cbc8", 11) });
    scene.add(place(sceneFrame({ ...m["mesa-coast"].spec, tint: "smoke" }, "black"), { x: -30, z: 20, ry: 0.18 }));
    scene.add(place(sceneFrame({ ...m["vela-drift"].spec, tint: "brown" }, "tortoise", { folded: true }), { x: 60, z: -120, ry: -0.35 }));
    sun(scene, [-0.7, 1.2, 0.35], 3.8);
    return { scene, camera: camera({ pos: [0, 520, 300], look: [10, 0, -40], fov: 32, aspect, fStop: 10 }), develop: { exposure: 1.2, contrast: 1.05 } };
  },

  /** Contact lens cartons, solution and a lens case on stone by a window. */
  "duo-contacts": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xf5f3ee, bottom: 0x6a6b68, intensity: 0.58 });
    room(scene, { floor: stone("#e2dfd8", 13), wall: plaster("#e8e5de", 14), wallZ: -170 });
    scene.add(place(buildProp("aquasoft-daily-30-pack"), { x: -70, z: -60, ry: 0.22 }));
    const top = buildProp("clearday-silicone-daily-30-pack");
    scene.add(place(top, { x: -62, y: 44, z: -58, ry: 0.08 }));
    scene.add(place(buildProp("multipurpose-solution-360-ml"), { x: 70, z: -70, ry: -0.5 }));
    scene.add(place(lensCase(), { x: 40, z: 40, ry: 0.4 }));
    const from = [0.9, 0.9, 0.5];
    sun(scene, from, 3.4);
    gobo(scene, from, { distance: 900, cols: 3, rows: 2, pane: [150, 220], bar: 26, center: [0, 40, -50] });
    return { scene, camera: camera({ pos: [40, 300, 470], look: [0, 60, -40], fov: 32, aspect, fStop: 9 }), develop: { exposure: 1.2, contrast: 1.04 } };
  },

  /** Trial lenses in a tray, a letter chart and a pair of wire frames: the eye exam. */
  "eye-exam": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xf2f3f2, bottom: 0x63676a, intensity: 0.4 });
    room(scene, { floor: plaster("#ebeae6", 21), wall: plaster("#e3e4e1", 22), wallZ: -260 });
    const tray = new THREE.Mesh(new RoundedBoxGeometry(330, 14, 210, 3, 3), physical({ color: 0x1a1b1c, roughness: 0.9, sheen: 0.6, sheenColor: hex(0x3a3c3e) }));
    tray.position.set(-30, 7, -40);
    scene.add(tray);
    let i = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const lens = trialLens(i, (c + r) % 2 === 0);
        lens.position.set(-30 - 128 + c * 64, 14, -40 - 60 + r * 62);
        lens.rotation.y = 0.04 * ((i * 7) % 5);
        scene.add(lens);
        i++;
      }
    }
    const chart = letterChart();
    chart.position.set(150, 148, -245);
    chart.rotation.x = -0.12;
    chart.rotation.y = -0.18;
    scene.add(chart);
    scene.add(place(sceneFrame(m["halden-wire"].spec, "gold", { folded: true }), { x: 120, z: 90, ry: -0.5 }));
    const win = new THREE.RectAreaLight(0xffffff, 14, 600, 900);
    win.position.set(-900, 600, 200);
    win.lookAt(0, 60, -40);
    scene.add(win);
    sun(scene, [-0.9, 1.1, 0.3], 1.6);
    return { scene, camera: camera({ pos: [10, 470, 600], look: [-5, 40, -80], fov: 36, aspect, fStop: 10 }), develop: { exposure: 1.1, contrast: 1.03 } };
  },

  /** A branch's frame wall: oak shelves with frames standing in rows. */
  "store-wall": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xfffaf2, bottom: 0x8a857c, intensity: 0.75 });
    room(scene, { floor: plaster("#ddd6ca", 31), wall: plaster("#f3f0ea", 32), wallZ: -150 });
    const shelfMat = oak("#d2b089");
    const picks = [
      ["arden-101", "black"], ["mesa-cat-9", "tortoise"], ["halden-wire", "gold"], ["vela-square-pro", "black"], ["arden-204", "crystal"],
      ["solenne-atelier", "tortoise"], ["kiyo-hex", "gold"], ["mesa-classic", "black"], ["vela-air", "crystal"], ["halden-sable", "tortoise"],
      ["mesa-studio", "tortoise"], ["arden-round-33", "black"], ["solenne-muse", "gold"], ["brio-junior", "crystal"], ["arden-everyday", "black"],
    ];
    let k = 0;
    for (let row = 0; row < 3; row++) {
      const y = 140 + row * 230;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1000, 18, 150), shelfMat);
      shelf.position.set(0, y - 9, -75);
      scene.add(shelf);
      for (let c = 0; c < 5; c++) {
        const [slug, colour] = picks[k++];
        const f = place(sceneFrame(m[slug].spec, colour), { x: -380 + c * 190, y, z: -20, ry: 0 });
        f.scale.setScalar(0.92);
        scene.add(f);
      }
    }
    const top = new THREE.RectAreaLight(0xfff6ea, 12, 1400, 400);
    top.position.set(0, 1400, 500);
    top.lookAt(0, 300, -100);
    scene.add(top);
    return { scene, camera: camera({ pos: [330, 470, 820], look: [-90, 360, -40], fov: 28, aspect, fStop: 4.5, focus: 820 }), develop: { exposure: 1.18, contrast: 1.03 } };
  },

  /** An oak workbench: a frame upside down, a screwdriver, a cloth. */
  "about-bench": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xfbf3e8, bottom: 0x6e6455, intensity: 0.6 });
    room(scene, { floor: oak("#d8c0a2", 9), wall: plaster("#ece6dc", 41), wallZ: -330 });
    const frame = sceneFrame(m["arden-101"].spec, "tortoise", { folded: true });
    scene.add(place(frame, { x: -20, z: 0, ry: 0.35 }));
    const kit = buildProp("eyewear-repair-kit");
    scene.add(place(kit, { x: 140, z: -110, ry: -0.3 }));
    scene.add(place(buildProp("microfiber-cloth"), { x: -170, z: -150, ry: 0.5 }));
    const from = [0.8, 1, 0.25];
    sun(scene, from, 3.6, 0xffeeda);
    gobo(scene, from, { distance: 1000, cols: 2, rows: 2, pane: [340, 300], bar: 24, center: [0, 0, -40] });
    return { scene, camera: camera({ pos: [-40, 300, 340], look: [0, 15, -40], fov: 30, aspect, fStop: 5 }), develop: { exposure: 1.25, contrast: 1.04, saturation: 0.92, grade: [1.02, 1, 0.97] } };
  },

  /** Three frames in a diagonal on pale stone, window light. */
  "collection-glasses": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xf6f2ea, bottom: 0x6b675f, intensity: 0.58 });
    room(scene, { floor: stone("#e3dfd6", 51) });
    scene.add(place(sceneFrame(m["mesa-cat-9"].spec, "crystal"), { x: -230, z: -60, ry: 0.3 }));
    scene.add(place(sceneFrame(m["arden-101"].spec, "tortoise"), { x: 0, z: 10, ry: 0.22 }));
    scene.add(place(sceneFrame(m["halden-wire"].spec, "gold"), { x: 235, z: 70, ry: 0.15 }));
    const from = [-0.8, 1.1, 0.6];
    sun(scene, from, 3.4);
    gobo(scene, from, { distance: 1100, cols: 3, rows: 2, pane: [260, 320], bar: 34, center: [0, 0, 0] });
    return { scene, camera: camera({ pos: [60, 420, 760], look: [0, 10, 0], fov: 30, aspect, fStop: 11 }), develop: { exposure: 1.2, contrast: 1.04 } };
  },

  /** Sunglasses on warm plaster, very hard light. */
  "collection-sunglasses": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xfdf0dd, bottom: 0x6d6050, intensity: 0.5 });
    room(scene, { floor: plaster("#e6d9c4", 61) });
    scene.add(place(sceneFrame({ ...m["halden-pilot"].spec, tint: "brown" }, "silver"), { x: -150, z: 0, ry: 0.25 }));
    scene.add(place(sceneFrame({ ...m["kiyo-sport-polarised"].spec, tint: "green" }, "matteBlack", { folded: true }), { x: 160, z: -40, ry: -0.3 }));
    sun(scene, [0.75, 0.7, -0.45], 4.2, 0xfff0d6);
    return { scene, camera: camera({ pos: [0, 420, 700], look: [0, 0, -10], fov: 30, aspect, fStop: 10 }), develop: { exposure: 1.2, contrast: 1.05, saturation: 0.88, grade: [1.02, 1, 0.97] } };
  },

  /** Macro: the hinge and temple of a tortoise frame, shallow focus. */
  "detail-hinge": (m, aspect) => {
    const scene = new THREE.Scene();
    sky(scene, { top: 0xf4f2ee, bottom: 0x67645e, intensity: 0.45 });
    room(scene, { floor: plaster("#ecebe7", 71), wall: plaster("#ecebe7", 72), wallZ: -600 });
    const f = place(sceneFrame(m["vela-square-pro"].spec, "tortoise"), { x: 0, z: 0, ry: 0.85 });
    scene.add(f);
    const key = new THREE.RectAreaLight(0xffffff, 10, 500, 300);
    key.position.set(-300, 500, 400);
    key.lookAt(0, 20, 0);
    scene.add(key);
    sun(scene, [-0.6, 1, 0.8], 1.4);
    return { scene, camera: camera({ pos: [130, 75, 160], look: [55, 28, 20], fov: 22, aspect, fStop: 2.8 }), develop: { exposure: 1.2, contrast: 1.04 } };
  },
};

export async function renderEditorial(job) {
  const { width = 1600, height = 1780, samples = 480, widths = [1600, 800], quality = 0.86 } = job;
  const build = SCENES[job.scene];
  if (!build) throw new Error(`Unknown scene ${job.scene}`);
  const { scene, camera: cam, develop } = build(job.models, width / height);
  scene.traverse((o) => o.updateMatrixWorld?.(true));
  const buf = await trace(scene, cam, { width, height, samples });
  const canvas = developPass(buf, width, height, { ...develop, ...(job.develop ?? {}) });
  return { main: await encode(canvas, widths, quality) };
}
