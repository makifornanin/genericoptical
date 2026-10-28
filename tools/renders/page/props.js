// Accessories and contact lens packaging, modelled in millimetres and resting on y = 0.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { grainTexture } from "./materials.js";

const physical = (o) => new THREE.MeshPhysicalMaterial(o);

// ─── Printed labels ──────────────────────────────────────────────────────────

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

/** Carton front: brand, product line, count, a colour band. Fictional brands from the demo catalogue. */
function cartonFront({ brand, line, detail, band, ink = "#1c2b33" }) {
  return canvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = "#f7f6f2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = band;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = ink;
    ctx.font = `600 64px ${FONT}`;
    ctx.fillText(brand, 60, 120);
    ctx.font = `400 92px ${FONT}`;
    ctx.fillText(line, 60, 300);
    ctx.font = `400 40px ${FONT}`;
    ctx.fillStyle = "#4a555b";
    ctx.fillText(detail, 64, 380);
    ctx.strokeStyle = "#9aa3a8";
    ctx.lineWidth = 3;
    ctx.strokeRect(w - 300, 300, 230, 90);
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText("PWR", w - 285, 290);
    ctx.fillStyle = "#ffffff";
    ctx.font = `500 38px ${FONT}`;
    ctx.fillText("Soft contact lenses", 60, h * 0.78 + 86);
  });
}

function cartonSide({ brand, band }) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#f7f6f2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = band;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = "#1c2b33";
    ctx.font = `600 52px ${FONT}`;
    ctx.fillText(brand, 36, 110);
  });
}

function bottleLabel({ line, detail, band }) {
  return canvasTexture(1536, 512, (ctx, w, h) => {
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = band;
    ctx.fillRect(0, h - 70, w, 70);
    ctx.fillStyle = "#1b2a24";
    ctx.font = `600 50px ${FONT}`;
    ctx.fillText("Lensmere Care", 520, 120);
    ctx.font = `400 74px ${FONT}`;
    ctx.fillText(line, 520, 250);
    ctx.font = `400 42px ${FONT}`;
    ctx.fillStyle = "#4b5751";
    ctx.fillText(detail, 524, 330);
  });
}

// ─── Builders ────────────────────────────────────────────────────────────────

/**
 * Carton: a plain box with printed panels laid on its faces. (One material per mesh: the path
 * tracer mis-assigns multi-material meshes.)
 */
function carton(w, h, d, spec) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), physical({ color: 0xf7f6f2, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
  box.position.y = h / 2;
  group.add(box);
  const panel = (tex, pw, ph, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), physical({ map: tex, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 }));
    m.position.set(...pos);
    m.rotation.y = rotY;
    group.add(m);
  };
  const front = cartonFront(spec);
  const side = cartonSide(spec);
  panel(front, w, h, [0, h / 2, d / 2 + 0.05], 0);
  panel(front, w, h, [0, h / 2, -d / 2 - 0.05], Math.PI);
  panel(side, d, h, [w / 2 + 0.05, h / 2, 0], Math.PI / 2);
  panel(side, d, h, [-w / 2 - 0.05, h / 2, 0], -Math.PI / 2);
  return group;
}

function lathe(points, segments = 96) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function bottle({ r, h, line, detail, band, cap = 0x203029 }) {
  const group = new THREE.Group();
  const body = lathe([
    [0, 0],
    [r - 2, 0],
    [r, 2],
    [r, h * 0.78],
    [r * 0.92, h * 0.86],
    [r * 0.62, h * 0.93],
    [r * 0.46, h * 0.96],
    [r * 0.46, h],
  ]);
  group.add(new THREE.Mesh(body, physical({ color: 0xf4f3ef, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 })));
  const label = new THREE.CylinderGeometry(r + 0.25, r + 0.25, h * 0.5, 96, 1, true, -Math.PI * 0.85, Math.PI * 1.7);
  const lm = new THREE.Mesh(label, physical({ map: bottleLabel({ line, detail, band }), roughness: 0.45, clearcoat: 0.5, side: THREE.DoubleSide }));
  lm.position.y = h * 0.38;
  group.add(lm);
  const capG = new THREE.CylinderGeometry(r * 0.52, r * 0.55, h * 0.16, 64);
  const capM = new THREE.Mesh(capG, physical({ color: cap, roughness: 0.45, clearcoat: 0.3 }));
  capM.position.y = h + h * 0.08 - 1;
  group.add(capM);
  return group;
}

function spray() {
  const g = bottle({ r: 15, h: 68, line: "Lens Spray", detail: "60 ml · cleans and cares", band: "#2e4a3e", cap: 0xffffff });
  g.remove(g.children[g.children.length - 1]); // replace the cap with a pump
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 8, 48), physical({ color: 0xf2f2ef, roughness: 0.4 }));
  collar.position.y = 72;
  const actuator = new THREE.Mesh(new RoundedBoxGeometry(14, 12, 14, 3, 3), physical({ color: 0xf2f2ef, roughness: 0.35 }));
  actuator.position.y = 82;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 16), physical({ color: 0xdedcd6, roughness: 0.4 }));
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(8.5, 83, 0);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 26, 48, 1, false), physical({ color: 0xffffff, transmission: 1, thickness: 1, roughness: 0.15, ior: 1.45 }));
  hood.position.set(32, 13, 8);
  g.add(collar, actuator, nozzle, hood);
  return g;
}

/** Soft folded cloth: thin layers with a gentle, irregular drape. */
function cloth() {
  const mat = physical({ color: 0x77736c, roughness: 1, sheen: 0.5, sheenColor: new THREE.Color(0x9c978e), sheenRoughness: 0.8, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const layer = (size, lift, seed, twist) => {
    const g = new THREE.BoxGeometry(size, 1.6, size, 64, 1, 64);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.max(Math.abs(x), Math.abs(z)) / (size / 2);
      const wave = Math.sin(x * 0.09 + seed) * Math.cos(z * 0.07 + seed * 2) * 0.9 + Math.sin((x + z) * 0.05 + seed) * 0.6;
      p.setY(i, p.getY(i) + lift + wave * edge * edge * 1.8 - edge ** 6 * 1.4);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.rotation.y = twist;
    return m;
  };
  group.add(layer(96, 1.2, 1, 0), layer(94, 3.4, 4, 0.05), layer(92, 5.6, 7, -0.03));
  return group;
}

/** Clamshell case: one rounded shell with a fine seam groove around the middle. */
function hardCase({ color = 0x151617, roughness = 0.62, w = 158, h = 46, d = 62 } = {}) {
  const grain = grainTexture({ seed: 4, scale: 300, contrast: 0.35, base: 0.6 });
  grain.repeat.set(2, 2);
  const mat = physical({ color, roughness, roughnessMap: grain, clearcoat: 0.15, clearcoatRoughness: 0.5 });
  const group = new THREE.Group();
  const r = Math.min(h, d) * 0.46;
  const shell = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 10, r), mat);
  shell.position.y = h / 2;
  // Seam: a thin dark line following the shell's widest outline, at mid height.
  const sw = w / 2;
  const sd = d / 2;
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    const cx = Math.cos(t);
    const cz = Math.sin(t);
    // rounded rectangle via superellipse
    pts.push(new THREE.Vector3(Math.sign(cx) * Math.abs(cx) ** (2 / 5) * (sw - 0.35), h * 0.54, Math.sign(cz) * Math.abs(cz) ** (2 / 5) * (sd - 0.35)));
  }
  const seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 320, 0.45, 8, true), physical({ color: 0x050505, roughness: 0.9 }));
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 34, 24), physical({ color: 0xbfc0c2, metalness: 1, roughness: 0.3 }));
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, h * 0.54, -d / 2 - 0.6);
  group.add(shell, seam, hinge);
  return group;
}

function foldingCase() {
  const r = 6;
  const shape = new THREE.Shape();
  const tri = [
    [-34, 0],
    [34, 0],
    [0, 40],
  ];
  shape.moveTo(tri[0][0] + r, tri[0][1]);
  shape.lineTo(tri[1][0] - r, tri[1][1]);
  shape.quadraticCurveTo(tri[1][0], tri[1][1], tri[1][0] - r * 0.6, tri[1][1] + r);
  shape.lineTo(tri[2][0] + r * 0.6, tri[2][1] - r);
  shape.quadraticCurveTo(tri[2][0], tri[2][1], tri[2][0] - r * 0.6, tri[2][1] - r);
  shape.lineTo(tri[0][0] + r * 0.6, tri[0][1] + r);
  shape.quadraticCurveTo(tri[0][0], tri[0][1], tri[0][0] + r, tri[0][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 150, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 4 });
  g.translate(0, 2.5, -75);
  g.rotateY(Math.PI / 2);
  const grain = grainTexture({ seed: 12, scale: 260, contrast: 0.3, base: 0.6 });
  grain.repeat.set(1 / 90, 1 / 90); // extrude UVs are in millimetres
  const m = new THREE.Mesh(g, physical({ color: 0x7c5233, roughness: 0.62, roughnessMap: grain, clearcoat: 0.12, clearcoatRoughness: 0.5 }));
  return m;
}

function cord({ beads = false } = {}) {
  const group = new THREE.Group();
  // A loose, open loop as if set down on a table.
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const a = t * Math.PI * 1.75 + 0.6;
    const rad = 62 + Math.sin(t * Math.PI * 3) * 9;
    pts.push(new THREE.Vector3(Math.cos(a) * rad * 1.25, 0, Math.sin(a) * rad * 0.8 + t * 18));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  if (beads) {
    const gold = physical({ color: 0xd8b26e, metalness: 1, roughness: 0.25 });
    const pearl = physical({ color: 0xf1ece2, roughness: 0.2, clearcoat: 1, sheen: 0.5 });
    const n = 70;
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n);
      const big = i % 5 === 0;
      const s = new THREE.Mesh(new THREE.SphereGeometry(big ? 3.2 : 1.9, 24, 16), big ? pearl : gold);
      s.position.set(p.x, big ? 3.2 : 1.9, p.z);
      group.add(s);
    }
  } else {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 1.5, 12), physical({ color: 0x141414, roughness: 0.7 }));
    tube.position.y = 1.5;
    group.add(tube);
  }
  for (const end of [0, 1]) {
    const p = curve.getPointAt(end);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(5, 1.6, 12, 32), physical({ color: 0x1b1b1b, roughness: 0.5, transmission: 0.2 }));
    loop.rotation.x = Math.PI / 2;
    loop.position.set(p.x + (end ? 5 : -5), 1.6, p.z);
    group.add(loop);
  }
  return group;
}

function nosePads() {
  const group = new THREE.Group();
  const mat = physical({ color: 0xffffff, transmission: 0.95, thickness: 2.5, roughness: 0.25, ior: 1.42, attenuationColor: new THREE.Color(0xeee6d6), attenuationDistance: 10 });
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
    pad.scale.set(7, 2.6, 11);
    pad.position.set(sx * 11, 2.6, 0);
    pad.rotation.y = sx * 0.35;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 16), physical({ color: 0xd2d3d5, metalness: 1, roughness: 0.3 }));
    stem.position.set(sx * 11, 5.5, 0);
    group.add(pad, stem);
  }
  return group;
}

function repairKit() {
  const group = new THREE.Group();
  const tin = new THREE.Mesh(new RoundedBoxGeometry(76, 13, 46, 4, 4), physical({ color: 0xc9cbcd, metalness: 1, roughness: 0.32 }));
  tin.position.y = 6.5;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 58, 6), physical({ color: 0x232625, roughness: 0.5 }));
  handle.rotation.z = Math.PI / 2;
  handle.rotation.x = 0.3;
  handle.position.set(-6, 4.2, 42);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 32, 16), physical({ color: 0xd9dadc, metalness: 1, roughness: 0.2 }));
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(39, 4.2, 42);
  group.add(tin, handle, shaft);
  return group;
}

const AQUA = "#2f6273";
const CLEAR = "#3f6b4f";

/** Builds a product prop by catalogue slug. */
export function buildProp(slug) {
  switch (slug) {
    case "aquasoft-daily-30-pack":
      return carton(96, 44, 60, { brand: "AquaSoft", line: "Daily", detail: "30 lenses · 1-day wear", band: AQUA });
    case "aquasoft-monthly-6-pack":
      return carton(66, 32, 55, { brand: "AquaSoft", line: "Monthly", detail: "6 lenses · monthly replacement", band: "#4d5f84" });
    case "aquasoft-toric-monthly-6-pack":
      return carton(66, 32, 55, { brand: "AquaSoft", line: "Toric Monthly", detail: "6 lenses · for astigmatism", band: "#6a5a7e" });
    case "clearday-silicone-daily-30-pack":
      return carton(96, 44, 60, { brand: "ClearDay", line: "Silicone Daily", detail: "30 lenses · 1-day wear", band: CLEAR, ink: "#1f2b22" });
    case "clearday-bi-weekly-6-pack":
      return carton(66, 32, 55, { brand: "ClearDay", line: "Bi-weekly", detail: "6 lenses · 2-week replacement", band: "#7a8a52", ink: "#1f2b22" });
    case "multipurpose-solution-120-ml":
      return bottle({ r: 21, h: 92, line: "Multipurpose", detail: "Solution · 120 ml", band: AQUA });
    case "multipurpose-solution-360-ml":
      return bottle({ r: 30, h: 138, line: "Multipurpose", detail: "Solution · 360 ml", band: AQUA });
    case "lens-cleaning-spray-60-ml":
      return spray();
    case "anti-fog-wipes-30":
      return carton(92, 26, 62, { brand: "Lensmere Care", line: "Anti-fog wipes", detail: "30 individually wrapped", band: "#2e4a3e", ink: "#1b2a24" });
    case "microfiber-cloth":
      return cloth();
    case "hard-shell-case":
      return hardCase();
    case "kids-case":
      return hardCase({ color: 0x5e7b93, roughness: 0.35, w: 140, h: 42, d: 56 });
    case "folding-case":
      return foldingCase();
    case "retainer-cord":
      return cord();
    case "beaded-eyewear-chain":
      return cord({ beads: true });
    case "silicone-nose-pads-pair":
      return nosePads();
    case "eyewear-repair-kit":
      return repairKit();
    default:
      throw new Error(`Unknown prop ${slug}`);
  }
}
