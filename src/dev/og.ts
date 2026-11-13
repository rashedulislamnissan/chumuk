// Dev-only: the link-preview card (1200×630) for tools/ogimage.mjs. Never part of the site bundle.
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/tiro-bangla/400.css";
import { logoSVG } from "../lib/logo";

document.body.innerHTML = `
<div class="card">
  <div class="copy">
    <div class="brand">${logoSVG(64)}<div><b>CHUMUK</b><span>চুমুক</span></div></div>
    <h1>One sip.<br>Then another.</h1>
    <p>Coffee roasted in Bangladesh · a concept brand</p>
    <ul><li>WebGL scroll journey</li><li>3D paper bags</li><li>English · বাংলা</li></ul>
  </div>
  <div class="bags">
    <img class="side l" src="/img/bags/roj.webp" alt="">
    <img class="centre" src="/img/bags/kalo.webp" alt="">
    <img class="side r" src="/img/bags/shada.webp" alt="">
    <img class="cup" src="/img/cups/cup_clay.webp" alt="">
  </div>
</div>`;

const css = document.createElement("style");
css.textContent = `
  html, body { margin: 0; background: #16110E; }
  .card { width: 1200px; height: 630px; position: relative; overflow: hidden; color: #F4EDE0; font-family: "DM Sans";
    background: radial-gradient(ellipse 70% 90% at 72% 62%, #4a2c16, #16110E 70%); }
  .card::after { content: ""; position: absolute; inset: 18px; border: 1.5px solid rgb(212 162 76 / .3); border-radius: 18px; }
  .copy { position: absolute; left: 72px; top: 70px; width: 560px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand b { display: block; font-family: "Fraunces"; font-weight: 700; font-size: 26px; letter-spacing: .22em; }
  .brand span { font-family: "Tiro Bangla"; color: #D4A24C; font-size: 22px; }
  h1 { margin: 54px 0 0; font-family: "Fraunces"; font-weight: 800; font-size: 76px; line-height: .98; text-transform: uppercase; letter-spacing: -.01em; }
  p { margin: 26px 0 0; font-size: 22px; color: #BDB19F; }
  ul { list-style: none; padding: 0; margin: 30px 0 0; display: flex; gap: 10px; }
  li { padding: 8px 16px; border: 1px solid rgb(212 162 76 / .5); border-radius: 999px; font-size: 16px; font-weight: 600; color: #F1C979; }
  .bags { position: absolute; right: 40px; bottom: 34px; width: 520px; height: 520px; }
  .bags img { position: absolute; bottom: 0; height: auto; }
  .centre { width: 300px; left: 110px; z-index: 2; }
  .side { width: 210px; opacity: .92; bottom: 18px !important; }
  .side.l { left: -40px; } .side.r { right: -40px; }
  .cup { width: 150px; left: 40px; z-index: 3; bottom: -6px !important; }
`;
document.head.append(css);

await document.fonts.ready;
await Promise.all([
  document.fonts.load('800 76px "Fraunces"'), document.fonts.load('700 26px "Fraunces"'),
  document.fonts.load('400 22px "DM Sans"'), document.fonts.load('600 16px "DM Sans"'),
  document.fonts.load('400 22px "Tiro Bangla"', "চুমুক"),
  ...[...document.images].map((i) => i.decode().catch(() => {})),
]);
(window as unknown as { __ogReady: boolean }).__ogReady = true;
