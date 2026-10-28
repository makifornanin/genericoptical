// Entry point driven by render.mjs through Playwright: window.renderPackshot(job), window.renderScene(job).
import * as THREE from "three";
import { buildFrame } from "./geometry.js";
import { frameMaterials, poseOnFloor } from "./frames.js";
import { initRenderer, glInfo, cove, studioLights, fitCamera, trace, compositeOnPlate, encode } from "./stage.js";
import { buildProp } from "./props.js";
import { renderEditorial } from "./editorial.js";

initRenderer();

const ANGLES = {
  front: { azimuth: 0, elevation: 9, fill: 0.74 },
  angle: { azimuth: 36, elevation: 13, fill: 0.78 },
  side: { azimuth: 90, elevation: 5, fill: 0.8 },
  top: { azimuth: 0, elevation: 62, fill: 0.72 },
};

window.renderPackshot = async (job) => {
  const t0 = performance.now();
  const { width = 1600, height = 1200, samples = 320, plateSamples = 96, angles = ["front", "angle", "side"], widths = [1600, 800], background = [240, 240, 237] } = job;
  const scene = new THREE.Scene();
  studioLights(scene, job.lights ?? {});
  scene.add(cove());

  let object;
  if (job.kind === "frame") {
    const mats = frameMaterials(job.spec, job.colour);
    object = buildFrame(job.spec, mats).group;
    poseOnFloor(object);
  } else {
    object = buildProp(job.prop, job.options ?? {});
  }
  const out = {};
  for (const a of angles) {
    const view = { ...ANGLES[a], ...(job.views?.[a] ?? {}) };
    const camera = fitCamera(object, { ...view, aspect: width / height });
    scene.remove(object);
    const plate = await trace(scene, camera, { width, height, samples: plateSamples });
    scene.add(object);
    const obj = await trace(scene, camera, { width, height, samples });
    const canvas = compositeOnPlate(obj, plate, width, height, background, job.exposure ?? 1);
    out[a] = await encode(canvas, widths, job.quality ?? 0.88);
  }
  return { images: out, ms: Math.round(performance.now() - t0) };
};

window.renderScene = async (job) => {
  const t0 = performance.now();
  const images = await renderEditorial(job);
  return { images, ms: Math.round(performance.now() - t0) };
};

window.glInfo = glInfo;
window.ready = true;
