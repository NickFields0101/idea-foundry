import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markPath = path.join(projectDirectory, "public", "brand", "sift-mark.svg");
const markSource = await fs.readFile(markPath);

const transparentMark = await sharp(markSource)
  .resize(1024, 1024, { fit: "contain" })
  .png()
  .toBuffer();

const iconBackdrop = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect x="48" y="48" width="928" height="928" rx="224" fill="#080a08"/>
    <rect x="49" y="49" width="926" height="926" rx="223" fill="none" stroke="#232722" stroke-width="2"/>
  </svg>
`);
const iconMark = await sharp(markSource)
  .resize(704, 704, { fit: "contain" })
  .png()
  .toBuffer();
const appIcon = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: iconBackdrop, left: 0, top: 0 },
    { input: iconMark, left: 160, top: 160 },
  ])
  .png()
  .toBuffer();

const socialBackdrop = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1731" height="909">
    <rect width="1731" height="909" fill="#080a08"/>
    <circle cx="355" cy="454" r="300" fill="#111510"/>
    <circle cx="355" cy="454" r="299" fill="none" stroke="#222821" stroke-width="2"/>
    <text x="785" y="385" fill="#f7f8f5" font-family="Arial, Helvetica, sans-serif" font-size="214" font-weight="800" letter-spacing="24">SIFT</text>
    <rect x="1075" y="430" width="116" height="20" rx="10" fill="#91f22e"/>
    <text x="798" y="522" fill="#91f22e" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" letter-spacing="8">XAHAU + EVERNODE</text>
    <text x="798" y="628" fill="#aeb5aa" font-family="Arial, Helvetica, sans-serif" font-size="49" font-weight="400">Find what holds.</text>
  </svg>
`);
const socialMark = await sharp(markSource)
  .resize(490, 490, { fit: "contain" })
  .png()
  .toBuffer();
const socialCard = await sharp(socialBackdrop)
  .composite([{ input: socialMark, left: 110, top: 208 }])
  .png()
  .toBuffer();

const outputs = [
  [path.join(projectDirectory, "public", "brand", "sift-mark.png"), transparentMark],
  [path.join(projectDirectory, "app", "icon.png"), appIcon],
  [path.join(projectDirectory, "app", "apple-icon.png"), appIcon],
  [path.join(projectDirectory, "build", "icon.png"), appIcon],
  [path.join(projectDirectory, "public", "og.png"), socialCard],
];

for (const [destination, contents] of outputs) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, contents);
  process.stdout.write(`${path.relative(projectDirectory, destination)}\n`);
}
