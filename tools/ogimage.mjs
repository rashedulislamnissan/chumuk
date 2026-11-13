// Renders the link-preview card (tools/og.html + src/dev/og.ts) to public/og.jpg (1200×630).
// Start the dev server first (port 5179), then: node tools/ogimage.mjs
import { chromium } from "playwright-core";
const URL = process.env.URL || "http://localhost:5179/";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(URL + "tools/og.html");
await page.waitForFunction(() => window.__ogReady === true, null, { timeout: 30000 });
await page.screenshot({ path: "public/og.jpg", type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log("wrote public/og.jpg");
