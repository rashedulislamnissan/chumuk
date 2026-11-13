// Scrolls for real to journey progress points and screenshots: node tools/scrollshots.mjs <out> [w] [h]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "sshots";
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const URL = process.env.URL || "http://localhost:5179/";
mkdirSync(out, { recursive: true });
const gpu = !process.env.SOFT;
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: gpu ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(`${URL}?skip`);
await page.waitForFunction(() => window.__chumuk?.ready, null, { timeout: 30000 });
for (const p of (process.env.PS || "0.5,0.6,0.7,0.8,0.86,1").split(",")) {
  await page.evaluate((p) => {
    const j = document.getElementById("journey");
    window.scrollTo(0, j.offsetTop + p * (j.offsetHeight - innerHeight));
  }, +p);
  await page.waitForTimeout(+(process.env.WAIT || 1600));
  await page.screenshot({ path: `${out}/s_${p.padEnd(4, "0")}.png` });
}
if (process.env.CLICK) {
  await page.mouse.move(W / 2, H / 2);
  await page.hover("#ctaBtn"); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/t_hover.png` });
  await page.mouse.move(10, 10); await page.click("#stageNext"); await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/t_mid.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/t_next.png` });
}
console.log(errors.length ? errors.slice(0, 15).join("\n") : "no console errors");
await browser.close();
