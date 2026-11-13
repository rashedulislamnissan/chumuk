// Screenshots of the sections below the stage + the demo flows: node tools/sectionshots.mjs <out> [w] [h]
// Start the dev server first (npx vite --port 5179 --strictPort). Real GPU.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "secshots";
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const URL = process.env.URL || "http://localhost:5179/";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(`${URL}?skip`);
await page.evaluate(() => localStorage.removeItem("chumuk.cart"));
await page.waitForFunction(() => window.__chumuk?.ready, null, { timeout: 30000 });

const go = async (sel, dy = 0) => {
  await page.evaluate(([s, d]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY + d), [sel, dy]);
  await page.waitForTimeout(1300);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

await go("#stage", 0.5 * H); await shot("01_seam");
await go("#range"); await shot("02_range");
await go("#rangeGrid", -80); await shot("03_grid");
await page.$eval('.card[data-id="kalo"] [data-add]', (b) => b.click()); await page.waitForTimeout(600); await shot("04_add_dialog");
await page.click("#demoDialog .btn"); await page.waitForTimeout(300);
await page.$eval('.card[data-id="nolen-gur"] input[value="500"]', (b) => b.click());
await page.$eval('.card[data-id="nolen-gur"] [data-add]', (b) => b.click()); await page.waitForTimeout(500); await shot("05_toast");
await go("#process"); await shot("06_story");
await go(".step:nth-child(2)", -100); await shot("07_story2");
await go("#brew"); await shot("08_brew");
await go("#subscribe", -40); await shot("09_sub");
await go("#order"); await shot("10_order");
await page.fill('#orderForm [name="name"]', "Test User");
await page.fill('#orderForm [name="phone"]', "01712345678");
await page.fill('#orderForm [name="address"]', "House 1, Road 2, Dhanmondi");
await page.$eval("#orderForm button[type=submit]", (b) => b.click()); await page.waitForTimeout(600); await shot("11_order_dialog");
await page.click("#demoDialog .btn"); await page.waitForTimeout(300);
await go("#about"); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(800); await shot("12_footer");
await page.$eval('.foot [data-lang-btn="bn"]', (b) => b.click()); await page.waitForTimeout(400);
await go("#rangeGrid", -80); await shot("13_bn_grid");
await go("#brew"); await shot("14_bn_brew");
await go("#order"); await shot("15_bn_order");
console.log(errors.length ? errors.slice(0, 15).join("\n") : "no console errors");
await browser.close();
