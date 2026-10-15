// Generates the original line-art product illustrations in public/products (run once; output is committed).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = join(import.meta.dirname, "..", "public", "products");
mkdirSync(out, { recursive: true });

const BG = "#EFEEE8";
const frameColors = {
  black: { stroke: "#1B1C1E", width: 9 },
  tortoise: { stroke: "#6B4426", width: 9, accent: "#A0713F" },
  crystal: { stroke: "#9DB0B8", width: 8, opacity: 0.9 },
  gold: { stroke: "#B08A3C", width: 4 },
};

const lensShapes = {
  round: (cx) => `<circle cx="${cx}" cy="150" r="56"/>`,
  oval: (cx) => `<ellipse cx="${cx}" cy="150" rx="62" ry="45"/>`,
  rectangle: (cx) => `<rect x="${cx - 62}" y="112" width="124" height="76" rx="12"/>`,
  square: (cx) => `<rect x="${cx - 56}" y="98" width="112" height="104" rx="20"/>`,
  hexagon: (cx) => `<polygon points="${cx - 58},150 ${cx - 30},100 ${cx + 30},100 ${cx + 58},150 ${cx + 30},200 ${cx - 30},200"/>`,
  cateye: (cx, side) => {
    const s = side === "L" ? -1 : 1;
    const outer = cx + s * 64;
    const inner = cx - s * 56;
    return `<path d="M ${inner} 128 C ${inner} 110, ${cx} 104, ${outer} 96 C ${outer + s * 4} 140, ${cx + s * 40} 196, ${cx} 196 C ${cx - s * 40} 196, ${inner} 176, ${inner} 128 Z"/>`;
  },
  aviator: (cx, side) => {
    const s = side === "L" ? -1 : 1;
    return `<path d="M ${cx - s * 58} 112 C ${cx - s * 20} 104, ${cx + s * 40} 104, ${cx + s * 62} 116 C ${cx + s * 70} 160, ${cx + s * 40} 206, ${cx} 206 C ${cx - s * 44} 206, ${cx - s * 64} 160, ${cx - s * 58} 112 Z"/>`;
  },
  browline: (cx) => `<path d="M ${cx - 60} 128 C ${cx - 60} 200, ${cx + 60} 200, ${cx + 60} 128"/>`,
};

function frameSvg(shape, color, tint) {
  const c = frameColors[color];
  const L = lensShapes[shape](132, "L");
  const R = lensShapes[shape](268, "R");
  const lensFill = tint ? `fill="${tint}" fill-opacity="0.82"` : `fill="#FFFFFF" fill-opacity="0.55"`;
  const brow =
    shape === "browline"
      ? `<path d="M 66 124 C 90 108, 176 108, 192 124 M 208 124 C 224 108, 310 108, 334 124" stroke="${c.stroke}" stroke-width="16" stroke-linecap="round" fill="none"/>`
      : "";
  const bridge = shape === "aviator" ? `<path d="M 192 120 Q 200 112 208 120 M 186 104 L 214 104" fill="none"/>` : `<path d="M 190 ${shape === "round" ? 142 : 134} Q 200 ${shape === "round" ? 128 : 122} 210 ${shape === "round" ? 142 : 134}" fill="none"/>`;
  const temples = `<path d="M 72 ${shape === "cateye" ? 104 : 126} L 48 ${shape === "cateye" ? 96 : 120} M 328 ${shape === "cateye" ? 104 : 126} L 352 ${shape === "cateye" ? 96 : 120}" fill="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img"><rect width="400" height="300" fill="${BG}"/>
<g stroke="${c.stroke}" stroke-width="${c.width}" stroke-linejoin="round" stroke-linecap="round" ${c.opacity ? `stroke-opacity="${c.opacity}"` : ""}>
<g ${lensFill}>${L}${R}</g>${bridge}${temples}</g>${brow}
${c.accent ? `<g fill="${c.accent}" opacity="0.5"><circle cx="96" cy="118" r="5"/><circle cx="304" cy="118" r="5"/></g>` : ""}
</svg>`;
}

const files = [];
for (const shape of Object.keys(lensShapes)) {
  for (const color of Object.keys(frameColors)) {
    files.push([`frame-${shape}-${color}.svg`, frameSvg(shape, color)]);
  }
}
const tints = { smoke: "#3A3D40", green: "#3F5B45", brown: "#6E4E33" };
for (const shape of ["aviator", "square", "round", "cateye"]) {
  for (const [name, tint] of Object.entries(tints)) {
    files.push([`sun-${shape}-${name}.svg`, frameSvg(shape, shape === "aviator" ? "gold" : "black", tint)]);
  }
}

const simple = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img"><rect width="400" height="300" fill="${BG}"/><g fill="none" stroke="#1B1C1E" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
files.push(["contact-box.svg", simple(`<rect x="118" y="84" width="164" height="132" rx="8" fill="#FFFFFF"/><path d="M118 120 H282"/><circle cx="200" cy="168" r="30"/><path d="M178 168 Q200 150 222 168"/>`)]);
files.push(["solution-bottle.svg", simple(`<path d="M168 70 H232 V96 Q262 110 262 140 V226 Q262 236 252 236 H148 Q138 236 138 226 V140 Q138 110 168 96 Z" fill="#FFFFFF"/><path d="M180 52 H220 V70 H180 Z"/><path d="M152 160 H248"/>`)]);
files.push(["case-hard.svg", simple(`<path d="M86 160 Q86 108 200 108 Q314 108 314 160 Q314 212 200 212 Q86 212 86 160 Z" fill="#FFFFFF"/><path d="M86 160 H314"/>`)]);
files.push(["cloth.svg", simple(`<path d="M110 96 L290 86 L300 206 L120 216 Z" fill="#FFFFFF"/><path d="M130 116 L280 108 M135 150 L284 142 M140 184 L288 176" stroke-dasharray="6 10"/>`)]);
files.push(["accessory.svg", simple(`<path d="M80 150 C 140 90, 260 210, 320 150"/><circle cx="80" cy="150" r="10" fill="#FFFFFF"/><circle cx="320" cy="150" r="10" fill="#FFFFFF"/>`)]);
files.push(["rx-lens.svg", simple(`<ellipse cx="200" cy="150" rx="86" ry="64" fill="#FFFFFF"/><path d="M146 126 Q200 100 254 126" stroke-opacity="0.45"/><path d="M200 86 V214" stroke-dasharray="4 8" stroke-opacity="0.5"/>`)]);
files.push(["service-exam.svg", simple(`<path d="M80 150 Q200 60 320 150 Q200 240 80 150 Z" fill="#FFFFFF"/><circle cx="200" cy="150" r="34"/><circle cx="200" cy="150" r="12" fill="#1B1C1E"/>`)]);

for (const [name, svg] of files) writeFileSync(join(out, name), svg.replace(/\n/g, ""));
console.log(`Wrote ${files.length} illustrations to public/products`);
