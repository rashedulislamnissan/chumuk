// Lite mode, fallbacks and a11y checks: node tools/liteshots.mjs <out>
// Lite (?lite), no WebGL (?nogl), reduced motion (emulated), phone menu, Range search, skip link.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "liteshots";
const URL = process.env.URL || "http://localhost:5179/";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors = [];
async function open(query, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp ?? { width: 1440, height: 900 }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${query}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${query}: pageerror ${e.message}`));
  const jsReqs = [];
  page.on("request", (r) => { if (r.resourceType() === "script") jsReqs.push(r.url()); });
  await page.goto(URL + query);
  await page.waitForFunction(() => window.__chumuk?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  return { page, ctx, jsReqs };
}
const to = async (page, sel) => {
  await page.evaluate((s) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY), sel);
  await page.waitForTimeout(900);
};

// 1. forced lite, desktop
{
  const { page, ctx, jsReqs } = await open("?lite");
  console.log("lite: three.js/experience requested?", jsReqs.some((u) => /experience|three/.test(u)));
  await page.screenshot({ path: `${out}/01_lite_hero.png` });
  await to(page, "#stage"); await page.screenshot({ path: `${out}/02_lite_stage.png` });
  await page.click("#stageNext"); await page.waitForTimeout(500); await page.screenshot({ path: `${out}/03_lite_stage_next.png` });
  await ctx.close();
}
// 2. no WebGL, phone
{
  const { page, ctx } = await open("?nogl", { vp: { width: 390, height: 844 } });
  await page.screenshot({ path: `${out}/04_nogl_phone_hero.png` });
  await to(page, "#stage"); await page.screenshot({ path: `${out}/05_nogl_phone_stage.png` });
  await ctx.close();
}
// 3. reduced motion (no params) → lite with note
{
  const { page, ctx } = await open("", { reduced: true });
  const lite = await page.evaluate(() => window.__chumuk.lite);
  const note = await page.$eval(".lite-stage__note", (e) => e.textContent).catch(() => null);
  console.log("reduced motion → lite:", lite, "| note:", note);
  await ctx.close();
}
// 4. phone menu (full mode), search, skip link
{
  const { page, ctx } = await open("?skip", { vp: { width: 390, height: 844 } });
  await page.click("#menuBtn"); await page.waitForTimeout(600);
  console.log("menu focus:", await page.evaluate(() => document.activeElement?.textContent));
  await page.screenshot({ path: `${out}/06_menu.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  console.log("menu hidden after Esc:", await page.$eval("#menu", (m) => m.hidden));
  await ctx.close();
}
{
  const { page, ctx } = await open("?skip");
  await page.keyboard.press("Tab"); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/07_skip.png`, clip: { x: 0, y: 0, width: 600, height: 120 } });
  await to(page, "#range");
  await page.fill("#rangeSearch", "mango"); await page.waitForTimeout(300);
  console.log("search 'mango' visible cards:", await page.$$eval(".card", (c) => c.filter((x) => x.offsetParent !== null).map((x) => x.dataset.id)));
  await page.fill("#rangeSearch", "zzz"); await page.waitForTimeout(200);
  console.log("search 'zzz' none message shown:", await page.$eval("#rangeNone", (e) => !e.hidden));
  await page.fill("#rangeSearch", "চকলেট"); await page.waitForTimeout(200);
  console.log("search 'চকলেট':", await page.$$eval(".card", (c) => c.filter((x) => x.offsetParent !== null).map((x) => x.dataset.id)));
  await page.fill("#rangeSearch", "");
  await page.click('[data-filter="core"]'); await page.waitForTimeout(200);
  console.log("chip Everyday visible:", await page.$$eval(".card", (c) => c.filter((x) => x.offsetParent !== null).map((x) => x.dataset.id)));
  await page.click('[data-filter="special"]'); await page.waitForTimeout(200);
  console.log("chip Specials visible:", await page.$$eval(".card", (c) => c.filter((x) => x.offsetParent !== null).map((x) => x.dataset.id)));
  await page.click('[data-filter="all"]'); await page.waitForTimeout(200);
  await page.fill("#rangeSearch", "choc"); await page.waitForTimeout(400);
  console.log("search 'choc' visible:", await page.$$eval(".card", (c) => c.filter((x) => x.offsetParent !== null).map((x) => x.dataset.id)));
  await page.screenshot({ path: `${out}/08_search.png` });
  await ctx.close();
}
console.log(errors.length ? errors.slice(0, 15).join("\n") : "no console errors");
await browser.close();
