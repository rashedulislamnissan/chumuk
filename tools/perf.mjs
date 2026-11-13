// Real-GPU scroll test: node tools/perf.mjs [outDir] [width] [height]
// Scrolls the journey with wheel "flicks" like a person, logs frame times and the journey
// progress each frame, and saves a screencast so the motion can be inspected frame by frame.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2] || "perf";
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const URL = process.env.URL || "http://localhost:5179/";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: process.env.HEADED ? false : true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${URL}?skip`);
await page.waitForFunction(() => window.__chumuk?.ready, null, { timeout: 30000 });
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
console.log("GPU:", gpu);
await page.waitForTimeout(800);

// frame logger
await page.evaluate(() => {
  window.__log = [];
  let last = performance.now();
  const tick = (t) => {
    window.__log.push({ dt: t - last, y: scrollY, p: window.__chumuk.p ?? null });
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// screencast
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async (f) => {
  frames.push({ t: f.metadata.timestamp, data: f.data });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 480, everyNthFrame: 1 });

// a person scrolling: flicks of wheel notches with pauses
await page.mouse.move(W / 2, H / 2);
const flick = async (notches, gap = 22) => { for (let i = 0; i < notches; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(gap); } };
for (let k = 0; k < 14; k++) { await flick(5 + (k % 3) * 2); await page.waitForTimeout(450); }
await page.waitForTimeout(1200);
await cdp.send("Page.stopScreencast");

const log = await page.evaluate(() => window.__log);
await browser.close();

const dts = log.map((f) => f.dt).slice(2).sort((a, b) => a - b);
const pct = (q) => dts[Math.floor(q * (dts.length - 1))].toFixed(1);
const slow = dts.filter((d) => d > 25).length;
console.log(`frames ${dts.length}  median ${pct(0.5)}ms  p95 ${pct(0.95)}ms  max ${pct(1)}ms  >25ms: ${slow}`);
writeFileSync(`${out}/log.json`, JSON.stringify(log));
frames.forEach((f, i) => writeFileSync(`${out}/f_${String(i).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64")));
console.log("screencast frames", frames.length, "over", (frames.at(-1)?.t - frames[0]?.t).toFixed(2), "s");
