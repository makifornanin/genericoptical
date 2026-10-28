# Product and editorial renders

Every image on the site is made here. This tool builds a 3D model of each catalogue frame, sunglass and accessory from a short spec. It lights them like a studio packshot and path-traces them on the local GPU. The output is WebP files under `public/media/`, which are committed. Nothing here runs on Vercel or at build time.

Why renders and not photos: see [DESIGN_REFERENCES.md](../../DESIGN_REFERENCES.md#imagery-why-the-photos-are-renders).

## Run

```bash
cd tools/renders
npm install                       # three, three-mesh-bvh, three-gpu-pathtracer, polygon-clipping
npx playwright install chromium   # once, if the site's tests haven't installed it already
node render.mjs --skip-existing   # everything that isn't on disk yet
node manifest.mjs                 # rewrite src/lib/media-manifest.json from what's on disk
```

`manifest.mjs` must run after rendering. The site only uses images listed in the manifest, so a missing file can never show as a broken image.

| Flag | Effect |
|---|---|
| `--only arden-101,scene/hero` | jobs whose id contains any of the texts |
| `--skip-existing` | skip jobs whose files all exist |
| `--samples 64` | fewer samples, for quick previews |
| `--angles front` / `--size 800x600` | one view / one size, for previews |
| `--out <dir>` | write somewhere other than `public/media` (use this for previews) |

## How it works

- `render.mjs` serves `page/` on port 4411 and opens it in headless Chromium with the GPU enabled (`--use-angle=d3d11`). It then calls `renderPackshot` or `renderScene` in the page for each job. If the GPU context is lost or a frame comes back blank, it reloads the page and retries the job (up to 3 attempts).
- `jobs.mjs` lists the jobs:
  - `MODELS` (frames): one job per colour, with front, angle and side views.
  - `SUN_MODELS`: one job per lens tint.
  - `PROPS`: cases, cloths, solution and contact-lens cartons, with front and angle views.
  - `SCENES`: the editorial images.
  - Products render at 256 samples per pixel, scenes at 480.
- `page/geometry.js` builds a frame from its spec:
  - The lens outline is a superellipse, spline or hexagon.
  - The rim is an offset of that outline. For acetate, the two rims and the bridge are unioned into one front with `polygon-clipping` and extruded.
  - Metal frames are swept tubes.
  - Temples are swept and folded. Lenses are thin curved shells.
- `page/materials.js`, `page/frames.js` and `page/props.js` hold the acetate colours, tortoise pattern, metals, lens tints and accessories.
- `page/stage.js` sets up the studio (a cove, soft lights, a black flag behind the camera for reflections) and traces the image in tiles. It then composites onto an exact `#F0F0ED` background, so images sit on the site's stone tiles with no edge. The last steps are a light denoise and stray-bright-pixel removal, then WebP encoding.
- `page/editorial.js` holds the scenes: frames on oak, plaster and stone, with window light and shadows.

## Adding a product

1. Add the product in the dashboard. Its public slug is derived from the name.
2. Add an entry to `MODELS` (or `SUN_MODELS` / `PROPS`) in `jobs.mjs` under that slug, with the colours named as in the dashboard's variant attributes (`colour`, `color` or `tint`).
3. `node render.mjs --only <slug>`, check the images, then `node manifest.mjs`.
4. Refresh the test fixtures if the product should be in the tests: `node tests/fixtures/snapshot.mjs` from the repository root, with the dashboard running.

## Notes

- Rendering takes about 35–40 s per frame colour and 2–4 minutes per editorial scene on an Intel Arc A530M laptop GPU. The full set takes roughly 1.5 hours.
- On Windows, a long GPU job can trip the driver's timeout (TDR) and lose the WebGL context. The tile size keeps each draw short, and the retry handles the rest. Keep other GPU-heavy programs closed while rendering.
- As of 20 October 2026, only 4 frames, 9 care products and the editorial scenes are rendered. The other products use stock photos (`tools/stock/import.mjs`) until their renders exist. A render always takes priority.
- Renders are illustrations of the demo catalogue, not photographs of stock. Replace them with real photography for a live shop: the site reads whatever is in `public/media` through the manifest.
