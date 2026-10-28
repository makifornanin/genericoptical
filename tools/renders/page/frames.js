// Frame materials per colourway and posing on a surface, shared by packshots and editorial scenes.
import * as THREE from "three";
import { buildFrame } from "./geometry.js";
import { ACETATE, METAL, LENS, SUN_TINTS, PAD } from "./materials.js";

/** Materials for one colourway of a frame spec. */
export function frameMaterials(spec, colour) {
  const metalFrame = spec.style === "metal";
  const c = String(colour || "black");
  let front;
  if (metalFrame) front = (METAL[c] ?? METAL[c.toLowerCase()] ?? METAL.gold)();
  else front = (ACETATE[c === "tortoise" ? (spec.tortoise ?? "tortoise") : c] ?? ACETATE[c.toLowerCase()] ?? ACETATE.black)();
  const trim = c === "tortoise" || c === "gold" || spec.trim === "gold" ? METAL.gold() : spec.trim === "black" ? METAL.black() : METAL.silver();
  const lens = spec.sun ? LENS.tint(SUN_TINTS[spec.tint] ?? SUN_TINTS.smoke, spec.tintDistance ?? 1.1) : LENS.clear();
  const tip = metalFrame ? (c === "black" ? ACETATE.black() : c === "silver" ? ACETATE.smokeCrystal() : ACETATE.tortoise()) : front;
  return { front, metal: spec.style === "browline" ? (c === "tortoise" ? METAL.gold() : METAL.silver()) : trim, lens, pad: PAD(), tip };
}

/** Rests the frame on the floor: both the lowest point of the front and the temple tips touch y = 0. */
export function poseOnFloor(group) {
  group.updateMatrixWorld(true);
  let front = { y: Infinity, z: 0 };
  let tips = { y: Infinity, z: 0 };
  const v = new THREE.Vector3();
  group.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (v.z > -25 && v.y < front.y) front = { y: v.y, z: v.z };
      if (v.z < -110 && v.y < tips.y) tips = { y: v.y, z: v.z };
    }
  });
  if (Number.isFinite(tips.y) && Number.isFinite(front.y)) {
    const run = front.z - tips.z;
    group.rotation.x = -Math.atan2(tips.y - front.y, run);
  }
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);
  return group;
}

/** Drops any object so its lowest point sits on y = 0. */
export function dropToFloor(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  object.position.y -= box.min.y;
  object.updateMatrixWorld(true);
  return object;
}

/** A frame for a scene: built, coloured, posed open on the floor (or folded flat), wrapped in a group. */
export function sceneFrame(spec, colour, { folded = false } = {}) {
  const s = folded ? { ...spec, temple: { ...(spec.temple ?? {}), fold: 1 } } : spec;
  const g = buildFrame(s, frameMaterials(s, colour)).group;
  if (folded) {
    // Lying on its lenses' bottom edge and temples: tip it back a little and rest it.
    g.rotation.x = -1.25;
    dropToFloor(g);
  } else poseOnFloor(g);
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}
