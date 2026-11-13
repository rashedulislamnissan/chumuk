// Renders every 3D bag (src/gl/Bag.ts) to public/img/bags/<id>.webp with alpha.
// Start the dev server first (npx vite --port 5179 --strictPort), then: node tools/bagshots.mjs
// Needs ffmpeg on PATH. Re-run whenever products.ts or the bag label changes.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL || "http://localhost:5179/";
const OUT = "public/img/bags";
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), "chumuk-bagshots");
mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
// TURN=<id> OUT_DIR=<dir>: review renders (front/side/back/side) as PNGs instead of the site images
const TURN = process.env.TURN;
await page.goto(URL + "tools/bagshot.html" + (TURN ? `?turn=${TURN}` : ""));
await page.waitForFunction(() => window.__bagsDone, null, { timeout: 60000 });
const bags = await page.evaluate(() => window.__bags);
await browser.close();

if (TURN) {
  const dir = process.env.OUT_DIR || "bagturn";
  mkdirSync(dir, { recursive: true });
  for (const [id, url] of Object.entries(bags)) writeFileSync(join(dir, id + ".png"), Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", Object.keys(bags).length, "views to", dir);
  process.exit(0);
}

for (const [id, url] of Object.entries(bags)) {
  const png = join(tmp, id + ".png");
  writeFileSync(png, Buffer.from(url.split(",")[1], "base64"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-vf", "scale=480:-2", "-c:v", "libwebp", "-quality", "88", "-pix_fmt", "yuva420p", `${OUT}/${id}.webp`]);
  console.log("wrote", `${OUT}/${id}.webp`);
}
rmSync(tmp, { recursive: true, force: true });
