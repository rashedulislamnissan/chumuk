// Screenshot harness: node tools/shots.mjs <outDir> [width] [height]
// Captures the intro (timed) and journey progress points (forced via ?p=).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] || "shots";
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const URL = process.env.URL || "http://localhost:5179/";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// intro, timed
if (!process.env.NO_INTRO) {
  await page.goto(`${URL}?full`); // software GL: ?full skips the slow-GPU lite fallback
  const t0 = Date.now();
  for (const ms of (process.env.INTRO || "400,900,1500,1900,2150,2400,2700,3400").split(",").map(Number)) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    await page.screenshot({ path: `${out}/intro_${String(ms).padStart(4, "0")}.png` });
  }
}

// journey points
for (const p of (process.env.PS || "0,0.12,0.25,0.33,0.36,0.4,0.5,0.62,0.65,0.75,0.86,0.89,0.92,0.98").split(",")) {
  await page.goto(`${URL}?skip&full&p=${p}`);
  await page.waitForFunction(() => window.__chumuk?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/p_${p.padEnd(4, "0")}.png` });
}
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
