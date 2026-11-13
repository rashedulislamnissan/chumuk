// Chrome trace of first-paint GPU raster while wheel-scrolling from the end of the journey down the sections.
// Prints the longest GPU tasks (RasterDecoderImpl::DoEndRasterCHROMIUM > 20 ms = a dropped frame on first paint).
// node tools/rastertrace.mjs <trace.json>   Env: N=wheel steps (40 = Range only, 260 = whole page), CSS="..." injected to bisect.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const out = process.argv[2];
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5179/?skip");
await page.waitForFunction(() => window.__chumuk?.ready, null, { timeout: 30000 });
if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
await page.waitForTimeout(4000);
const end = await page.evaluate(() => { const j = document.getElementById("journey"); return j.offsetTop + j.offsetHeight - innerHeight; });
await page.evaluate((y) => window.scrollTo(0, y - 300), end);
await page.waitForTimeout(2500);
await browser.startTracing(page, { path: out, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "cc", "gpu"] });
for (let i = 0; i < +(process.env.N || 40); i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(30); }
await page.waitForTimeout(1500);
await browser.stopTracing();
await browser.close();
const tr = JSON.parse(readFileSync(out, "utf8"));
const ev = tr.traceEvents || tr;
const names = {};
for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names[`${e.pid}:${e.tid}`] = e.args.name;
const long = ev.filter((e) => e.ph === "X" && e.dur > 20000).map((e) => ({ t: names[`${e.pid}:${e.tid}`], n: e.name, ms: +(e.dur / 1000).toFixed(1), a: JSON.stringify(e.args?.data ?? {}).slice(0, 140) }));
long.sort((a, b) => b.ms - a.ms);
console.log(long.slice(0, 40).map((l) => `${l.ms}ms  [${l.t}] ${l.n}  ${l.a}`).join("\n"));
