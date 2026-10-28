// Parametric eyewear geometry. Units are millimetres; +x is the viewer's right, +y up, +z towards the
// camera when the frame faces it. Lens outlines are built for the lens on the viewer's right (nasal
// side towards -x) and mirrored for the other eye.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import polygonClipping from "polygon-clipping";

// ─── 2D helpers ──────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

/** Closed polygon resampled to `count` points evenly spaced along its length. */
export function resample(points, count) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  const out = [];
  let s = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total;
    while (s < segs.length - 1 && segs[s].start + segs[s].len < d) s++;
    const g = segs[s];
    const t = g.len ? (d - g.start) / g.len : 0;
    out.push([g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t]);
  }
  return out;
}

/** Chaikin corner cutting, closed polygon. */
function chaikin(points, iterations = 2) {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  return pts;
}

/** Polygon with straight edges and circular corners of radius r (points listed counter-clockwise). */
function roundedPolygon(vertices, r) {
  const out = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const cur = vertices[i];
    const next = vertices[(i + 1) % n];
    const d1 = [prev[0] - cur[0], prev[1] - cur[1]];
    const d2 = [next[0] - cur[0], next[1] - cur[1]];
    const l1 = Math.hypot(...d1);
    const l2 = Math.hypot(...d2);
    const u1 = [d1[0] / l1, d1[1] / l1];
    const u2 = [d2[0] / l2, d2[1] / l2];
    const angle = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const t = Math.min(r / Math.tan(angle / 2), l1 * 0.45, l2 * 0.45);
    const p1 = [cur[0] + u1[0] * t, cur[1] + u1[1] * t];
    const p2 = [cur[0] + u2[0] * t, cur[1] + u2[1] * t];
    // Quadratic Bézier through the corner approximates the arc closely enough at this size.
    for (let k = 0; k <= 10; k++) {
      const s = k / 10;
      out.push([(1 - s) ** 2 * p1[0] + 2 * (1 - s) * s * cur[0] + s * s * p2[0], (1 - s) ** 2 * p1[1] + 2 * (1 - s) * s * cur[1] + s * s * p2[1]]);
    }
  }
  return out;
}

function signedArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

const ccw = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);

/** Outward unit normals of a counter-clockwise closed polygon. */
function normals(points) {
  return points.map((p, i) => {
    const a = points[(i - 1 + points.length) % points.length];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  });
}

/** Moving-average smoothing of a closed polygon (removes small kinks after variable offsets). */
export function smoothRing(points, radius = 3, iterations = 2) {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    pts = pts.map((_, i) => {
      let x = 0;
      let y = 0;
      for (let d = -radius; d <= radius; d++) {
        const p = pts[(i + d + pts.length) % pts.length];
        x += p[0];
        y += p[1];
      }
      return [x / (2 * radius + 1), y / (2 * radius + 1)];
    });
  }
  return pts;
}

/** Offsets a CCW polygon outward by width(point, normal). */
export function offset(points, width) {
  const n = normals(points);
  return points.map((p, i) => {
    const w = typeof width === "function" ? width(p, n[i], i) : width;
    return [p[0] + n[i][0] * w, p[1] + n[i][1] * w];
  });
}

// ─── Lens outlines ───────────────────────────────────────────────────────────

/**
 * One lens outline centred on (0, 0), nasal side towards -x. `spec`:
 *  { kind: "se" | "hex", w, h, n, taper, wing, drop, flatTop, tilt }
 */
export function lensOutline(spec, count = 220) {
  const a = spec.w / 2;
  const b = spec.h / 2;
  let pts = [];
  if (spec.kind === "hex") {
    pts = roundedPolygon(
      [
        [a, -b * 0.06],
        [a * 0.55, b],
        [-a * 0.55, b],
        [-a, -b * 0.06],
        [-a * 0.5, -b],
        [a * 0.5, -b],
      ],
      spec.corner ?? 4,
    );
  } else if (spec.kind === "spline") {
    // Normalised control points (nasal side at -1), joined by a closed centripetal Catmull-Rom curve.
    const curve = new THREE.CatmullRomCurve3(spec.points.map(([u, v]) => new THREE.Vector3(u * a, v * b, 0)), true, "centripetal");
    pts = curve.getSpacedPoints(400).slice(0, -1).map((p) => [p.x, p.y]);
  } else {
    const n = spec.n ?? 2;
    for (let i = 0; i < 360; i++) {
      const t = (i / 360) * TAU;
      pts.push([a * sgnPow(Math.cos(t), 2 / n), b * sgnPow(Math.sin(t), 2 / n)]);
    }
  }
  pts = pts.map(([x, y]) => {
    const u = x / a;
    const v = y / b;
    let X = x;
    let Y = y;
    if (spec.taper) X *= 1 - spec.taper * Math.max(0, -v); // narrower towards the bottom
    if (spec.flatTop && v > 0) Y = b * (1 - (1 - v) ** (1 + spec.flatTop)) * (1 - spec.flatTop * 0.08); // flatter brow line
    if (spec.wing && u > 0 && v > -0.2) {
      // cat-eye: lift and stretch the outer top corner
      const k = u ** 3 * Math.max(0, v + 0.2);
      Y += spec.wing * b * k;
      X += spec.wing * 0.18 * a * k;
    }
    if (spec.drop && v < 0) {
      // aviator teardrop: the lower half sags, most on the nasal side
      Y -= spec.drop * b * -v * (0.45 + 0.55 * Math.max(0, (1 - u) / 2));
    }
    if (spec.tilt) {
      const c = Math.cos(spec.tilt);
      const s = Math.sin(spec.tilt);
      [X, Y] = [X * c - Y * s, X * s + Y * c];
    }
    return [X, Y];
  });
  // Re-centre vertically on the bounding box so different warps keep the same optical centre height.
  const ys = pts.map((p) => p[1]);
  const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
  pts = pts.map(([x, y]) => [x, y - mid]);
  return resample(ccw(pts), count);
}

const mirror = (points) => ccw(points.map(([x, y]) => [-x, y]));
const translate = (points, dx, dy = 0) => points.map(([x, y]) => [x + dx, y + dy]);
const bounds = (points) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

/** Lens outlines placed in frame coordinates: { left, right, centreX }. */
export function placedLenses(spec) {
  const lens = lensOutline(spec.lens);
  const bb = bounds(lens);
  const cx = spec.bridge / 2 - bb.minX; // nasal edge of the right lens sits at x = bridge/2
  const right = translate(lens, cx);
  const left = mirror(right);
  return { left, right, centreX: cx, lensBounds: bounds(right) };
}

// ─── 3D helpers ──────────────────────────────────────────────────────────────

/** Face-form wrap: the front curves back towards the temples. */
export const wrapZ = (spec, x) => -(spec.wrap ?? 0.0009) * x * x;

function bendGeometry(geometry, spec, extra = () => 0) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) + wrapZ(spec, x) + extra(x, y));
  }
  p.needsUpdate = true;
}

/** Smooth-shaded, re-merged geometry with planar UVs (front projection) for textured acetate. */
function smooth(geometry, uvScale = [1 / 150, 1 / 60]) {
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();
  const p = merged.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * uvScale[0] + 0.5 + p.getZ(i) * 0.004;
    uv[i * 2 + 1] = p.getY(i) * uvScale[1] + 0.5 + p.getZ(i) * 0.01;
  }
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}

function shapeFromPolygon(poly) {
  // poly = [outerRing, ...holes] from polygon-clipping (rings closed: first point repeated).
  const ring = (r) => r.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(ring(poly[0]));
  for (const h of poly.slice(1)) shape.holes.push(new THREE.Path(ring(h)));
  return shape;
}

function extrudePolygons(multi, depth, bevel, curveSegments = 1) {
  const shapes = multi.map(shapeFromPolygon);
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.92,
    bevelOffset: -bevel * 0.92, // keep the outline where it was drawn
    bevelSegments: 6,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Sweeps a rounded-rectangle section along a curve that lies in the y-z plane. */
export function sweep(curve, section, segments = 160, ring = 28) {
  const positions = [];
  const indices = [];
  const side = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    const N = new THREE.Vector3().crossVectors(T, side).normalize();
    const B = new THREE.Vector3().crossVectors(N, T).normalize();
    const { w, h, n = 3.2 } = section(t);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * TAU;
      const x = (w / 2) * sgnPow(Math.cos(a), 2 / n);
      const y = (h / 2) * sgnPow(Math.sin(a), 2 / n);
      positions.push(p.x + B.x * x + N.x * y, p.y + B.y * x + N.y * y, p.z + B.z * x + N.z * y);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j;
      const d = (i + 1) * ring + ((j + 1) % ring);
      indices.push(a, c, b, b, c, d);
    }
  }
  // End caps (fans around the centre point).
  for (const [i, flip] of [
    [0, true],
    [segments, false],
  ]) {
    const centre = curve.getPointAt(i / segments);
    const ci = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      indices.push(...(flip ? [ci, a, b] : [ci, b, a]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    uv[i * 2] = positions[i * 3 + 2] * -0.008 + 0.3;
    uv[i * 2 + 1] = positions[i * 3 + 1] * 0.02 + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function tube(points3, radius, closed = false, segments = 200) {
  const curve = new THREE.CatmullRomCurve3(points3, closed, "centripetal");
  return new THREE.TubeGeometry(curve, segments, radius, 14, closed);
}

const to3 = (spec, pts, z = 0) => pts.map(([x, y]) => new THREE.Vector3(x, y, z + wrapZ(spec, x)));

// ─── Frames ──────────────────────────────────────────────────────────────────

/**
 * Builds a frame. Returns { group, parts } with named materials slots:
 *  front (acetate or metal colour), metal (hinges, pins, wire), lens, pad, tip (temple tips on metal frames)
 *
 * spec: {
 *   style: "acetate" | "metal" | "browline",
 *   lens: lensOutline spec, bridge, rim: { top, side, bottom }, depth, wire,
 *   temple: { length, drop, width, height }, doubleBridge, pins, sun
 * }
 */
export function buildFrame(spec, materials) {
  const group = new THREE.Group();
  const { left, right, centreX, lensBounds } = placedLenses(spec);
  const depth = spec.depth ?? 5;
  const bevel = spec.bevel ?? Math.min(1.05, depth * 0.19);
  const rim = spec.rim ?? { top: 5, side: 4.5, bottom: 4 };
  const rimWidth = (p, n) => {
    const s = n[1];
    let w = rim.side + (rim.top - rim.side) * Math.max(0, s) ** 2 + (rim.bottom - rim.side) * Math.max(0, -s) ** 2;
    // The rim is slimmer on the nasal side (normal pointing towards the bridge) …
    if (n[0] < 0) w += ((rim.nasal ?? rim.side * 0.68) - w) * (-n[0]) ** 1.5;
    // … and, on cat-eyes, swept up at the outer top corner.
    if (rim.wing && n[0] > 0 && s > 0) w += rim.wing * (n[0] * s * 2) ** 1.4;
    return w;
  };
  const lensTopNasal = Math.max(...right.filter((p) => p[0] < centreX - (lensBounds.maxX - centreX) * 0.4).map((p) => p[1]));
  const outerX = lensBounds.maxX;

  const addMesh = (geometry, material, name) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    group.add(m);
    return m;
  };

  // Lens holes are cut slightly smaller than the glass so the lens edge hides in the groove.
  const holeR = right;
  const holeL = left;
  const glassR = offset(right, 0.7);
  const glassL = offset(left, 0.7);

  let lugY = (lensBounds.maxY + lensBounds.minY) / 2 + (lensBounds.maxY - lensBounds.minY) * 0.22;
  let frontZBack = -depth / 2 - bevel * 0.2;

  if (spec.style === "acetate" || spec.style === "browline") {
    const rimR = smoothRing(offset(right, rimWidth), 4, 3);
    const rimL = mirror(rimR);
    // Saddle bridge: follows the rim tops and arches underneath down into the rims at mid-lens height.
    const X = spec.bridge / 2 + (rim.nasal ?? rim.side * 0.68) * 0.6;
    // Start the bridge's top edge exactly on the rim's top line so there is no step where they meet.
    const rimTopAtX = Math.max(...rimR.filter((p) => Math.abs(p[0] - X) < 1.2).map((p) => p[1]));
    const yT = Number.isFinite(rimTopAtX) ? rimTopAtX - 0.15 : lensTopNasal + rim.top * 0.6;
    const thick = spec.bridgeThickness ?? Math.max(5.2, rim.top * 0.95);
    const dip = spec.bridgeDip ?? 1.8;
    const yApex = yT - dip - thick;
    const lensMidY = (lensBounds.maxY + lensBounds.minY) / 2;
    const yEnd = lensMidY + (lensBounds.maxY - lensMidY) * 0.25;
    const bridge = [];
    for (let i = 0; i <= 32; i++) {
      const x = -X + (2 * X * i) / 32;
      bridge.push([x, yT - dip * (1 - (x / X) ** 2) ** 1.5]); // the top dips over the nose
    }
    for (let i = 32; i >= 0; i--) {
      const x = -X + (2 * X * i) / 32;
      const k = Math.abs(x / X) ** 3;
      bridge.push([x, yApex - (yApex - yEnd) * k]);
    }
    // End pieces (lugs) where the temples attach.
    const lugH = spec.lugHeight ?? 8.5;
    const lugW = spec.lugWidth ?? 3.2;
    const lugR = chaikin(
      [
        [outerX + rim.side - 1.5, lugY - lugH / 2],
        [outerX + rim.side + lugW, lugY - lugH / 2 + 0.6],
        [outerX + rim.side + lugW, lugY + lugH / 2],
        [outerX + rim.side - 1.5, lugY + lugH / 2 + 0.6],
      ],
      2,
    );
    const lugL = mirror(lugR);
    let solid = polygonClipping.union([rimL], [rimR], [ccw(bridge)], [lugR], [lugL]);
    solid = polygonClipping.difference(solid, [holeR], [holeL]);

    if (spec.style === "browline") {
      // Keep only the upper part of the acetate; the lower rims become thin metal wire.
      const cut = lensBounds.minY + (lensBounds.maxY - lensBounds.minY) * (spec.browCut ?? 0.52);
      const keep = [
        [
          [-500, cut],
          [500, cut],
          [500, 500],
          [-500, 500],
        ],
      ];
      solid = polygonClipping.intersection(solid, keep);
      const lowerR = right.filter((p) => p[1] <= cut + 1.2);
      // Order the lower points nasal → bottom → outer, with angles unwrapped so the wire never jumps across the lens.
      const cyL = (lensBounds.minY + lensBounds.maxY) / 2;
      const ang = (p) => {
        const a = Math.atan2(p[1] - cyL, p[0] - centreX);
        return a > Math.PI / 2 ? a - 2 * Math.PI : a;
      };
      const sorted = [...lowerR].sort((a, b) => ang(a) - ang(b));
      const wireR = to3(spec, sorted, 0);
      addMesh(tube(wireR, 0.65), materials.metal, "lower-rim-r");
      addMesh(tube(to3(spec, sorted.map(([x, y]) => [-x, y]), 0), 0.65), materials.metal, "lower-rim-l");
      addNosePads(spec, group, right, centreX, lensBounds, materials, 0);
    }

    const front = extrudePolygons(solid, depth, bevel);
    bendGeometry(front, spec);
    addMesh(smooth(front), materials.front, "front");
    frontZBack = -depth / 2 - bevel;

    // Decorative pins on the end pieces.
    if (spec.pins !== false) {
      for (const sx of [-1, 1]) {
        for (const dy of spec.pins === 1 ? [0] : [-1.4, 1.4]) {
          const x = sx * (outerX + rim.side - 0.2);
          const pin = new THREE.CylinderGeometry(0.62, 0.62, 1.2, 20);
          pin.rotateX(Math.PI / 2);
          const zf = depth / 2 + bevel * 0.55 + wrapZ(spec, x);
          pin.translate(x, lugY + dy, zf);
          addMesh(pin, materials.metal, "pin");
        }
      }
    }
  } else {
    // Metal: wire rims, a bridge, optional top bar, nose pads.
    const wireR = spec.wire ?? 0.75;
    for (const outline of [right, left]) {
      addMesh(tube(to3(spec, offset(outline, wireR * 0.6), 0), wireR, true, 260), materials.front, "wire-rim");
    }
    const nasalTop = right.reduce((best, p) => (p[0] < centreX && p[1] > lensBounds.minY + (lensBounds.maxY - lensBounds.minY) * 0.62 && p[0] < best[0] ? p : best), [999, 0]);
    const bx = nasalTop[0];
    const by = nasalTop[1];
    const arch = spec.bridgeArch ?? 4;
    addMesh(
      tube(
        to3(spec, [
          [bx + 0.6, by - 0.4],
          [bx * 0.55, by + arch * 0.75],
          [0, by + arch],
          [-bx * 0.55, by + arch * 0.75],
          [-bx - 0.6, by - 0.4],
        ]),
        wireR * 1.05,
      ),
      materials.front,
      "bridge",
    );
    if (spec.doubleBridge) {
      const ty = lensBounds.maxY - 0.5;
      const tx = centreX - (lensBounds.maxX - centreX) * 0.15;
      addMesh(
        tube(
          to3(spec, [
            [tx, ty],
            [tx * 0.5, ty + 1.6],
            [0, ty + 1.9],
            [-tx * 0.5, ty + 1.6],
            [-tx, ty],
          ]),
          wireR * 0.95,
        ),
        materials.front,
        "top-bar",
      );
    }
    // End pieces: short bars from the rim to the hinge.
    lugY = lensBounds.maxY - (lensBounds.maxY - lensBounds.minY) * 0.22;
    const rimAtLug = right.reduce((best, p) => (Math.abs(p[1] - lugY) < 3 && p[0] > best[0] ? p : best), [0, lugY]);
    for (const sx of [-1, 1]) {
      const x0 = sx * rimAtLug[0];
      const x1 = sx * (rimAtLug[0] + 5);
      addMesh(
        tube(
          [new THREE.Vector3(x0, lugY, wrapZ(spec, x0)), new THREE.Vector3((x0 + x1) / 2, lugY + 0.4, wrapZ(spec, (x0 + x1) / 2) - 1.2), new THREE.Vector3(x1, lugY, wrapZ(spec, x1) - 3.5)],
          wireR * 1.15,
        ),
        materials.front,
        "end-piece",
      );
    }
    addNosePads(spec, group, right, centreX, lensBounds, materials, 0);
    frontZBack = -1;
  }

  // Lenses.
  const lensDepth = spec.sun ? 1.6 : 1.3;
  const thinLens = materials.lens.thickness === 0;
  for (const outline of [glassR, glassL]) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    let g;
    if (thinLens) {
      g = new THREE.ShapeGeometry(shape, 4);
      // Subdivide so the curvature below bends it smoothly.
      g = subdivideFlat(g, 3);
      g.translate(0, 0, spec.style === "metal" ? 0 : 0.2);
    } else {
      g = new THREE.ExtrudeGeometry(shape, { depth: lensDepth, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelOffset: -0.25, bevelSegments: 2, curveSegments: 2 });
      g.translate(0, 0, -lensDepth / 2 + (spec.style === "metal" ? 0 : 0.2));
    }
    const cx = outline === glassR ? centreX : -centreX;
    const cy = (lensBounds.maxY + lensBounds.minY) / 2;
    bendGeometry(g, spec, (x, y) => -0.0016 * ((x - cx) ** 2 + (y - cy) ** 2));
    if (thinLens) {
      g.deleteAttribute("normal");
      g.deleteAttribute("uv");
      g = mergeVertices(g, 1e-4);
    }
    g.computeVertexNormals();
    addMesh(g, materials.lens, "lens");
  }

  // Temples and hinges.
  const T = spec.temple ?? {};
  const length = T.length ?? 142;
  const metalTemple = spec.style === "metal";
  const hingeX = metalTemple ? outerX + 5.5 : outerX + rim.side + (spec.lugWidth ?? 3.2) - 1.2;
  for (const sx of [-1, 1]) {
    const x = sx * hingeX;
    const z0 = wrapZ(spec, x) + (metalTemple ? -3.5 : frontZBack);
    const path = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.2, -length * 0.25),
        new THREE.Vector3(0, -1.5, -length * 0.62),
        new THREE.Vector3(0, -4.5, -length * 0.8),
        new THREE.Vector3(0, -(T.drop ?? 16) * 0.75, -length * 0.93),
        new THREE.Vector3(0, -(T.drop ?? 16), -length),
      ],
      false,
      "centripetal",
    );
    let geometry;
    if (metalTemple) {
      geometry = new THREE.TubeGeometry(path, 180, (T.width ?? 1.6) / 2, 14, false);
      // Acetate tip over the last third.
      const tipPath = new THREE.CatmullRomCurve3(path.getSpacedPoints(60).slice(36), false, "centripetal");
      const tip = sweep(tipPath, (t) => ({ w: 3.2 - t * 0.4, h: 3.6 - t * 0.3, n: 2.6 }), 80, 22);
      const tipMesh = new THREE.Mesh(tip, materials.tip);
      tipMesh.name = "temple-tip";
      const holder = new THREE.Group();
      holder.add(new THREE.Mesh(geometry, materials.front), tipMesh);
      placeTemple(holder, x, lugY, z0, sx, T);
      group.add(holder);
    } else {
      const h0 = T.height ?? 7.5;
      geometry = sweep(path, (t) => {
        const taper = t < 0.18 ? 1 - t * 1.6 : 0.71 - (t - 0.18) * 0.22;
        return { w: (T.width ?? 3.6) * (1 - t * 0.18), h: h0 * Math.max(0.5, taper), n: 3.4 };
      });
      const holder = new THREE.Group();
      holder.add(new THREE.Mesh(geometry, materials.front));
      // Hinge barrel, visible from above and behind.
      const hinge = new THREE.BoxGeometry(1.6, 4, 5.5);
      hinge.translate(-sx * 2.4, 0, -3.4);
      holder.add(new THREE.Mesh(hinge, materials.metal));
      placeTemple(holder, x, lugY, z0, sx, T);
      group.add(holder);
    }
  }

  // Shift so the optical centre is at the origin.
  return { group, lugY, outerX: hingeX, lensBounds };
}

/** Splits every triangle of a flat, non-indexed-or-indexed geometry into 4, `levels` times. */
function subdivideFlat(geometry, levels) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (let l = 0; l < levels; l++) {
    const p = g.attributes.position;
    const out = [];
    for (let i = 0; i < p.count; i += 3) {
      const a = [p.getX(i), p.getY(i), p.getZ(i)];
      const b = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
      const c = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
      const m = (u, v) => u.map((x, k) => (x + v[k]) / 2);
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      out.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  }
  return g;
}

function placeTemple(holder, x, y, z, sx, T) {
  holder.position.set(x, y, z);
  // Temples open slightly wider than square, as on a frame set down on a table; `fold` (0–1) closes
  // them behind the front, the left one resting on the right.
  const fold = T.fold ?? 0;
  holder.rotation.y = sx * ((T.splay ?? 0.08) * (1 - fold) + fold * (Math.PI / 2 - 0.07));
  holder.rotation.x = (T.pitch ?? 0) + (sx < 0 ? fold * 0.07 : 0);
  if (fold) holder.position.y += sx < 0 ? fold * 2.2 : 0;
}

function addNosePads(spec, group, right, centreX, lensBounds, materials) {
  const cy = lensBounds.minY + (lensBounds.maxY - lensBounds.minY) * 0.32;
  const nasal = right.reduce((best, p) => (Math.abs(p[1] - cy) < 4 && p[0] < best[0] ? p : best), [999, cy]);
  for (const sx of [-1, 1]) {
    const px = sx * (nasal[0] - 3.2);
    const pad = new THREE.SphereGeometry(1, 24, 16);
    pad.scale(2.2, 4.4, 0.9);
    const m = new THREE.Mesh(pad, materials.pad);
    m.position.set(px, cy - 2, wrapZ(spec, px) - 7);
    m.rotation.y = sx * 0.55;
    m.rotation.z = sx * 0.18;
    group.add(m);
    const arm = tube(
      [new THREE.Vector3(sx * (nasal[0] + 0.2), cy + 3, wrapZ(spec, nasal[0])), new THREE.Vector3(sx * (nasal[0] - 1.6), cy + 1.4, wrapZ(spec, nasal[0]) - 3.5), new THREE.Vector3(px, cy - 0.5, wrapZ(spec, px) - 6.2)],
      0.4,
    );
    group.add(new THREE.Mesh(arm, materials.metal));
  }
}
