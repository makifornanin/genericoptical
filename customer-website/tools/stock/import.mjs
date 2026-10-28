// Imports stock photos for products that have no render: crops each to the tiles' 4:3 shape and
// writes public/media/stock/<name>-<width>.webp at 800 and 1600 px. Then run tools/renders/manifest.mjs.
//   node tools/stock/import.mjs <source folder>
// PHOTOS maps each output name to its source file and a crop focus: a sharp strategy ("attention"),
// "centre", or { y } — the vertical centre of the crop as a fraction of the photo's height.
import sharp from "sharp";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "public", "media", "stock");
const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("Usage: node tools/stock/import.mjs <folder with the photos>");
  process.exit(1);
}

/** name → [source file, crop focus]. All photos are from Pexels (free to use, no attribution required). */
export const PHOTOS = {
  "black-cateye": ["pexels-efrem-efre-2786187-14450938.jpg", "attention"],
  "black-orange": ["pexels-shliftik-7357979.jpg", "centre"],
  "black-halfrim": ["pexels-steve-18189953.jpg", "attention"],
  "grey-square": ["pexels-pixabay-159743.jpg", "attention"],
  "brown-round": ["pexels-ashutoshsonwani-1694208.jpg", "attention"],
  "clear-pink": ["pexels-rdne-7947706.jpg", "attention"],
  "silver-hands": ["pexels-arina-krasnikova-5712373.jpg", "centre"],
  "gold-round": ["pexels-pavel-danilyuk-6763886.jpg", { y: 0.44 }],
  "gold-newspaper": ["pexels-asumaani-17435111.jpg", "attention"],
  "metal-teal": ["pexels-silviu-din-1620549-4039400.jpg", "centre"],
  "store-wall": ["pexels-karola-g-5201896.jpg", "centre"],
};

mkdirSync(OUT, { recursive: true });
for (const [name, [file, position]] of Object.entries(PHOTOS)) {
  const input = join(src, file);
  if (!existsSync(input)) {
    console.warn(`missing ${file}`);
    continue;
  }
  let image = sharp(input).rotate();
  if (typeof position === "object") {
    // Manual crop: the widest 4:3 band centred on `y`.
    const { width: w, height: h } = await sharp(input).rotate().metadata();
    const cw = Math.min(w, Math.round((h * 4) / 3));
    const ch = Math.round((cw * 3) / 4);
    const top = Math.max(0, Math.min(h - ch, Math.round(position.y * h - ch / 2)));
    image = sharp(await image.extract({ left: Math.round((w - cw) / 2), top, width: cw, height: ch }).toBuffer());
  }
  for (const width of [800, 1600]) {
    await image
      .clone()
      .resize(width, Math.round((width * 3) / 4), { fit: "cover", position: typeof position === "object" || position === "centre" ? "centre" : sharp.strategy[position] })
      .webp({ quality: 80 })
      .toFile(join(OUT, `${name}-${width}.webp`));
  }
  console.log(name);
}
