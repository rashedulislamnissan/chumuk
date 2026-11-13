// Draws the three "How it's made" illustrations (bean → roast → sip) as SVG, then renders them to
// public/img/story/{bean,roast,sip}.webp (1200×900) in Chrome so the brand fonts are used.
// Sources are kept in assets-src/story/*.svg. Start the dev server first (port 5179), then:
//   node tools/storyart.mjs
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL || "http://localhost:5179/";
const W = 1200, H = 900;

// ---------- helpers ----------
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + (b - a) * rnd();
const f = (n) => +n.toFixed(1);
const C = {
  bg: "#16110E", bg2: "#211813", gold: "#D4A24C", goldHi: "#F1C979", cream: "#F4EDE0", clay: "#B5553A", clayDk: "#7E3522",
  steel: "#2A2320", steelHi: "#4A3D35", jute: "#8C6A44", juteDk: "#5E4529", raw: ["#A9AE80", "#B9BC8F", "#9CA474", "#C2C29A"],
  mid: ["#9A6234", "#A86F3D", "#8B5328"], dark: ["#4A2A17", "#5A321B", "#3E2312", "#61391F"],
};

const defs = `
  <defs>
    <radialGradient id="beanHi" cx="34%" cy="30%" r="80%">
      <stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/>
    </radialGradient>
    <radialGradient id="pool" cx="50%" cy="46%" r="60%">
      <stop offset="0" stop-color="#5A3518" stop-opacity=".9"/><stop offset=".55" stop-color="#2B1B10" stop-opacity=".6"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A1D14"/><stop offset="1" stop-color="#120D0A"/>
    </linearGradient>
    <linearGradient id="vshade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".35" stop-color="#000" stop-opacity="0"/>
      <stop offset=".7" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
    </linearGradient>
    <pattern id="jute" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
      <rect width="10" height="10" fill="${C.jute}"/>
      <path d="M0 2.5h10M0 7.5h10" stroke="${C.juteDk}" stroke-width="1.6" opacity=".55"/>
      <path d="M2.5 0v10M7.5 0v10" stroke="#B08A5A" stroke-width="1.4" opacity=".5"/>
    </pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .42  0 0 0 0 .33  0 0 0 .55 -.18"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

/** one coffee bean: body, shading, centre crease, thin outline */
function bean(x, y, rx, ry, rot, fill, crease = "#2a1a10", hi = 1) {
  const k = ry * 0.82;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">
    <ellipse rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"/>
    <ellipse rx="${f(rx)}" ry="${f(ry)}" fill="url(#beanHi)" opacity="${hi}"/>
    <path d="M${f(-rx * 0.82)} 0 C${f(-rx * 0.3)} ${f(-k * 0.55)} ${f(rx * 0.3)} ${f(k * 0.55)} ${f(rx * 0.82)} 0" fill="none" stroke="${crease}" stroke-width="${f(Math.max(1.2, ry * 0.16))}" stroke-linecap="round" opacity=".85"/>
    <ellipse rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>
  </g>`;
}

/** a mound of beans: centre (cx, base), half-width w, height h; drawn back to front */
function heap(cx, base, w, h, n, palette, size = 15, crease) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = rr(-1, 1) * Math.sqrt(rnd());
    const top = h * Math.pow(1 - u * u, 1.15);
    pts.push({ x: cx + u * w, y: base - rnd() * top, s: size * rr(0.85, 1.15) });
  }
  pts.sort((a, b) => a.y - b.y);
  return pts.map((p) => bean(p.x, p.y, p.s, p.s * 0.7, rr(0, 180), palette[Math.floor(rnd() * palette.length)], crease)).join("");
}

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <ellipse cx="${W / 2}" cy="${H * 0.46}" rx="${W * 0.62}" ry="${H * 0.62}" fill="url(#pool)"/>
  ${inner}
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".55"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="18" fill="none" stroke="${C.gold}" stroke-opacity=".28" stroke-width="1.5"/>
</svg>`;

/** alpona border: dots and petals along a line */
function alponaRow(x0, x1, y, color, step = 26) {
  let s = "";
  for (let x = x0; x <= x1; x += step) {
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="3.2" ry="7" fill="${color}"/>`;
    s += `<circle cx="${f(x + step / 2)}" cy="${f(y)}" r="2.2" fill="${color}" opacity=".8"/>`;
  }
  return s;
}

// ---------- 1. The bean: a jute sack of raw beans ----------
function sceneBean() {
  seed = 11;
  const floorY = 700;
  let s = `<rect x="0" y="${floorY}" width="${W}" height="${H - floorY}" fill="url(#floor)"/>
    <path d="M0 ${floorY} H${W}" stroke="${C.gold}" stroke-opacity=".18" stroke-width="1.5"/>`;
  // sack shadow + body
  s += `<ellipse cx="520" cy="${floorY + 8}" rx="260" ry="34" fill="#000" opacity=".55" filter="url(#soft)"/>`;
  const sack = `M300 ${floorY} C285 600 300 470 330 360 C345 300 360 270 372 250 L668 250 C684 272 700 305 712 360 C742 470 756 600 740 ${floorY} C640 ${floorY + 22} 400 ${floorY + 22} 300 ${floorY} Z`;
  s += `<path d="${sack}" fill="url(#jute)"/><path d="${sack}" fill="url(#vshade)"/>`;
  // folded-down rim
  s += `<path d="M352 268 C420 238 620 238 690 268 C700 300 694 318 690 324 C620 300 420 300 352 324 C346 312 344 290 352 268 Z" fill="url(#jute)"/>
        <path d="M352 268 C420 238 620 238 690 268 C700 300 694 318 690 324 C620 300 420 300 352 324 C346 312 344 290 352 268 Z" fill="#fff" opacity=".08"/>
        <path d="M352 324 C420 300 620 300 690 324" fill="none" stroke="${C.juteDk}" stroke-width="3" opacity=".8"/>`;
  // beans filling the open top
  s += `<ellipse cx="521" cy="266" rx="160" ry="30" fill="#5d5a3c"/>`;
  s += heap(521, 282, 150, 46, 120, C.raw, 13, "#5b5a3a");
  // stamp on the sack
  s += `<g transform="translate(520 500) rotate(-4)" opacity=".82">
      <rect x="-118" y="-84" width="236" height="168" rx="10" fill="none" stroke="${C.clayDk}" stroke-width="5"/>
      <rect x="-106" y="-72" width="212" height="144" rx="6" fill="none" stroke="${C.clayDk}" stroke-width="2"/>
      <text x="0" y="-10" text-anchor="middle" font-family="Tiro Bangla" font-size="64" fill="${C.clayDk}">চুমুক</text>
      <text x="0" y="34" text-anchor="middle" font-family="DM Sans" font-weight="700" font-size="20" letter-spacing="6" fill="${C.clayDk}">RAW · GREEN</text>
      <text x="0" y="60" text-anchor="middle" font-family="DM Sans" font-weight="600" font-size="13" letter-spacing="4" fill="${C.clayDk}">LOT 07 · 60 KG</text>
    </g>`;
  // spilled beans + wooden scoop
  s += heap(860, floorY + 30, 210, 70, 150, C.raw, 15, "#5b5a3a");
  s += `<g transform="translate(880 640) rotate(-14)">
      <ellipse cx="0" cy="40" rx="120" ry="20" fill="#000" opacity=".5" filter="url(#soft)"/>
      <path d="M-110 -10 C-110 40 -60 62 0 62 C60 62 110 40 110 -10 Z" fill="#7A4E2C"/>
      <path d="M-110 -10 C-110 40 -60 62 0 62 C60 62 110 40 110 -10 Z" fill="url(#vshade)"/>
      <ellipse cx="0" cy="-10" rx="110" ry="24" fill="#4A2E19"/>
      ${heap(0, 2, 96, 30, 60, C.raw, 12, "#5b5a3a")}
      <rect x="104" y="-22" width="150" height="20" rx="10" fill="#8A5A33" transform="rotate(-8 104 -12)"/>
      <path d="M-110 -10 C-110 40 -60 62 0 62 C60 62 110 40 110 -10" fill="none" stroke="${C.gold}" stroke-opacity=".35" stroke-width="2"/>
    </g>`;
  s += heap(250, floorY + 40, 120, 26, 40, C.raw, 14, "#5b5a3a");
  // gold label line
  s += `<text x="72" y="104" font-family="DM Sans" font-weight="700" font-size="17" letter-spacing="5" fill="${C.gold}" opacity=".85">01 · GREEN COFFEE</text>`;
  return frame(s);
}

// ---------- 2. The roast: drum roaster → cooling tray ----------
function sceneRoast() {
  seed = 23;
  const floorY = 760;
  let s = `<rect x="0" y="${floorY}" width="${W}" height="${H - floorY}" fill="url(#floor)"/>
    <path d="M0 ${floorY} H${W}" stroke="${C.gold}" stroke-opacity=".18" stroke-width="1.5"/>`;
  // chimney + heat shimmer
  s += `<rect x="640" y="0" width="56" height="300" fill="${C.steel}"/><rect x="640" y="0" width="56" height="300" fill="url(#vshade)"/>
        <rect x="632" y="60" width="72" height="12" rx="3" fill="${C.steelHi}"/><rect x="632" y="180" width="72" height="12" rx="3" fill="${C.steelHi}"/>`;
  for (let i = 0; i < 5; i++) {
    const x = 720 + i * 26;
    s += `<path d="M${x} 280 c-14 -30 14 -50 0 -80 c-14 -30 14 -50 0 -80" fill="none" stroke="${C.goldHi}" stroke-width="2" stroke-linecap="round" opacity="${0.12 + 0.05 * i}"/>`;
  }
  // body
  s += `<ellipse cx="520" cy="${floorY + 6}" rx="300" ry="30" fill="#000" opacity=".6" filter="url(#soft)"/>
        <rect x="300" y="610" width="18" height="${floorY - 610}" fill="${C.steel}"/><rect x="722" y="610" width="18" height="${floorY - 610}" fill="${C.steel}"/>
        <rect x="250" y="300" width="540" height="330" rx="34" fill="${C.steel}"/>
        <rect x="250" y="300" width="540" height="330" rx="34" fill="url(#vshade)"/>
        <rect x="250" y="300" width="540" height="330" rx="34" fill="none" stroke="${C.gold}" stroke-opacity=".5" stroke-width="2"/>
        <path d="M270 340 H770 M270 590 H770" stroke="${C.gold}" stroke-opacity=".25" stroke-width="1.5"/>`;
  // burner window with flames
  s += `<rect x="360" y="636" width="320" height="70" rx="12" fill="#0d0907" stroke="${C.gold}" stroke-opacity=".4" stroke-width="2"/>`;
  for (let i = 0; i < 9; i++) {
    const x = 384 + i * 34, hgt = rr(30, 52);
    s += `<path d="M${x - 11} 700 C${x - 12} ${700 - hgt * 0.5} ${x - 2} ${700 - hgt * 0.7} ${x} ${700 - hgt} C${x + 4} ${700 - hgt * 0.6} ${x + 12} ${700 - hgt * 0.5} ${x + 11} 700 Z" fill="#E8792A" filter="url(#glow)" opacity=".9"/>
          <path d="M${x - 5} 700 C${x - 5} ${700 - hgt * 0.35} ${x} ${700 - hgt * 0.5} ${x} ${700 - hgt * 0.6} C${x + 2} ${700 - hgt * 0.4} ${x + 5} ${700 - hgt * 0.3} ${x + 5} 700 Z" fill="#7FB0FF" opacity=".75"/>`;
  }
  // hopper with raw beans
  s += `<path d="M410 300 L360 170 H600 L550 300 Z" fill="${C.steelHi}"/><path d="M410 300 L360 170 H600 L550 300 Z" fill="url(#vshade)"/>
        <path d="M410 300 L360 170 H600 L550 300" fill="none" stroke="${C.gold}" stroke-opacity=".5" stroke-width="2"/>
        <ellipse cx="480" cy="170" rx="120" ry="18" fill="#3b382a"/>`;
  s += heap(480, 178, 112, 34, 70, C.raw, 11, "#5b5a3a");
  // faceplate + window with tumbling beans
  s += `<circle cx="470" cy="465" r="132" fill="#1B1512" stroke="${C.gold}" stroke-width="5"/>
        <circle cx="470" cy="465" r="118" fill="none" stroke="${C.gold}" stroke-opacity=".35" stroke-width="2"/>
        <circle cx="470" cy="465" r="96" fill="#2E1A0E"/>
        <circle cx="470" cy="465" r="96" fill="url(#pool)" opacity=".9"/>`;
  for (let i = 0; i < 48; i++) {
    const a = rr(0.15, 0.85) * Math.PI, r = rr(30, 86);
    s += bean(470 + Math.cos(a) * r * 1.0, 465 + Math.sin(a) * r * 0.95, 11, 7.6, rr(0, 180), C.mid[i % 3], "#2a1408");
  }
  for (let i = 0; i < 10; i++) s += bean(470 + rr(-60, 60), 465 + rr(-80, -10), 9, 6.3, rr(0, 180), C.mid[i % 3], "#2a1408");
  s += `<path d="M395 400 A96 96 0 0 1 520 372" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="7" stroke-linecap="round"/>
        <circle cx="470" cy="465" r="96" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="4"/>`;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s += `<circle cx="${f(470 + Math.cos(a) * 125)}" cy="${f(465 + Math.sin(a) * 125)}" r="4" fill="${C.goldHi}"/>`; }
  // controls
  s += `<circle cx="680" cy="380" r="22" fill="#1B1512" stroke="${C.gold}" stroke-width="2.5"/><path d="M680 380 L692 366" stroke="${C.goldHi}" stroke-width="3" stroke-linecap="round"/>
        <text x="680" y="424" text-anchor="middle" font-family="DM Sans" font-weight="700" font-size="12" letter-spacing="2" fill="${C.gold}" opacity=".8">205°C</text>
        <rect x="652" y="470" width="56" height="90" rx="8" fill="#1B1512" stroke="${C.gold}" stroke-opacity=".5" stroke-width="2"/>
        <rect x="664" y="486" width="32" height="10" rx="3" fill="${C.clay}"/><rect x="664" y="504" width="32" height="10" rx="3" fill="${C.gold}" opacity=".7"/><rect x="664" y="522" width="32" height="10" rx="3" fill="${C.gold}" opacity=".35"/>`;
  // chute to the cooling tray, dark beans pouring
  s += `<path d="M560 560 L760 640 L748 664 L548 586 Z" fill="${C.steelHi}" stroke="${C.gold}" stroke-opacity=".4" stroke-width="2"/>`;
  for (let i = 0; i < 14; i++) { const t = i / 13; s += bean(600 + t * 175 + rr(-6, 6), 590 + t * 70 + rr(-10, 4) + (t > 0.85 ? (t - 0.85) * 200 : 0), 10, 7, rr(0, 180), C.dark[i % 4], "#120804"); }
  // cooling tray with roasted beans + stirring arm + steam
  s += `<ellipse cx="930" cy="${floorY + 4}" rx="210" ry="26" fill="#000" opacity=".6" filter="url(#soft)"/>
        <path d="M730 690 L750 ${floorY - 6} H1110 L1130 690 Z" fill="${C.steel}"/><path d="M730 690 L750 ${floorY - 6} H1110 L1130 690 Z" fill="url(#vshade)"/>
        <ellipse cx="930" cy="690" rx="200" ry="44" fill="#2a1a10" stroke="${C.gold}" stroke-opacity=".55" stroke-width="3"/>`;
  s += heap(930, 712, 186, 40, 170, C.dark, 12, "#120804");
  s += `<path d="M930 600 V690" stroke="${C.steelHi}" stroke-width="10"/><path d="M930 690 L1060 700" stroke="${C.goldHi}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`;
  for (let i = 0; i < 4; i++) { const x = 840 + i * 60; s += `<path d="M${x} 650 c-16 -26 16 -46 0 -72 c-16 -26 16 -46 0 -70" fill="none" stroke="${C.cream}" stroke-width="3" stroke-linecap="round" opacity=".16"/>`; }
  s += `<text x="72" y="104" font-family="DM Sans" font-weight="700" font-size="17" letter-spacing="5" fill="${C.gold}" opacity=".85">02 · DRUM ROAST</text>`;
  return frame(s);
}

// ---------- 3. The sip: clay cup, spiral steam ----------
function sceneSip() {
  seed = 41;
  const floorY = 640;
  let s = `<rect x="0" y="${floorY}" width="${W}" height="${H - floorY}" fill="url(#floor)"/>`;
  for (let i = 0; i < 9; i++) { const y = floorY + 20 + i * 28 + rr(-4, 4); s += `<path d="M0 ${f(y)} C300 ${f(y + rr(-8, 8))} 800 ${f(y + rr(-8, 8))} ${W} ${f(y)}" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/>`; }
  s += `<path d="M0 ${floorY} H${W}" stroke="${C.gold}" stroke-opacity=".18" stroke-width="1.5"/>`;
  // a Chumuk bag in the background (left)
  s += `<g transform="translate(150 300)" opacity=".92">
      <path d="M0 40 L6 0 H190 L196 40 L204 ${floorY - 300 + 6} H-8 Z" fill="#1d1612"/>
      <path d="M0 40 L6 0 H190 L196 40 L204 ${floorY - 300 + 6} H-8 Z" fill="url(#vshade)"/>
      <rect x="6" y="0" width="184" height="26" fill="#2a211b"/>
      <path d="M${98 - 26} 120 m0 0" />
      <g transform="translate(98 130)" fill="none" stroke="${C.gold}" stroke-width="4.5" stroke-linecap="round">${spiralPath(34)}</g>
      <text x="98" y="210" text-anchor="middle" font-family="Fraunces" font-weight="700" font-size="26" letter-spacing="5" fill="${C.cream}">CHUMUK</text>
      <text x="98" y="240" text-anchor="middle" font-family="Tiro Bangla" font-size="20" fill="${C.gold}">চুমুক</text>
      <rect x="-8" y="${floorY - 300 - 44}" width="212" height="50" fill="${C.gold}"/>
    </g>`;
  // clay plate + cup
  s += `<ellipse cx="640" cy="${floorY + 34}" rx="240" ry="40" fill="#000" opacity=".55" filter="url(#soft)"/>
        <ellipse cx="640" cy="${floorY + 22}" rx="210" ry="40" fill="${C.clayDk}"/>
        <ellipse cx="640" cy="${floorY + 14}" rx="196" ry="34" fill="${C.clay}"/>
        <ellipse cx="640" cy="${floorY + 14}" rx="150" ry="22" fill="#000" opacity=".18"/>`;
  // clay bhar: rim, rounded belly, narrow foot
  const cup = `M520 420 C512 505 540 590 588 ${floorY + 4} C620 ${floorY + 16} 660 ${floorY + 16} 692 ${floorY + 4} C740 590 768 505 760 420 Z`;
  s += `<path d="${cup}" fill="${C.clay}"/><path d="${cup}" fill="url(#vshade)"/>
        <g opacity=".9">${alponaRow(548, 735, 500, C.cream, 24)}</g>
        <path d="M537 470 C600 482 680 482 744 470" stroke="${C.cream}" stroke-width="2.5" fill="none" opacity=".85"/>
        <path d="M540 532 C600 544 680 544 742 532" stroke="${C.cream}" stroke-width="2.5" fill="none" opacity=".85"/>
        <ellipse cx="640" cy="420" rx="120" ry="28" fill="${C.clayDk}"/>
        <ellipse cx="640" cy="424" rx="108" ry="22" fill="#3A1F10"/>
        <ellipse cx="640" cy="424" rx="108" ry="22" fill="none" stroke="#C88A4E" stroke-width="7" opacity=".85"/>
        <ellipse cx="626" cy="420" rx="40" ry="7" fill="#E2B27A" opacity=".35"/>`;
  // spiral steam (the brand mark rising from the cup)
  s += `<g transform="translate(640 250)" fill="none" stroke="${C.goldHi}" stroke-width="5" stroke-linecap="round" opacity=".85" filter="url(#glow)">${spiralPath(78)}</g>
        <path d="M640 400 C610 360 680 340 640 300" fill="none" stroke="${C.cream}" stroke-width="4" stroke-linecap="round" opacity=".25"/>
        <path d="M600 404 C575 370 625 350 600 318" fill="none" stroke="${C.cream}" stroke-width="3" stroke-linecap="round" opacity=".16"/>
        <path d="M684 404 C709 370 659 350 684 318" fill="none" stroke="${C.cream}" stroke-width="3" stroke-linecap="round" opacity=".16"/>`;
  // roasted beans on the table
  s += heap(960, floorY + 70, 140, 34, 46, C.dark, 15, "#120804");
  for (let i = 0; i < 9; i++) s += bean(rr(380, 1120), rr(floorY + 90, H - 40), 15, 10.5, rr(0, 180), C.dark[i % 4], "#120804");
  s += `<text x="72" y="104" font-family="DM Sans" font-weight="700" font-size="17" letter-spacing="5" fill="${C.gold}" opacity=".85">03 · ONE SIP</text>`;
  return frame(s);
}

/** brand spiral (3.2 turns) as a path centred on 0,0 */
function spiralPath(rMax) {
  const turns = 3.2, rMin = rMax * 0.08, steps = 220, k = (rMax - rMin) / (turns * 2 * Math.PI);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI, r = rMin + k * t;
    d += (i ? "L" : "M") + f(r * Math.cos(t)) + "," + f(r * Math.sin(t));
  }
  return `<path d="${d}"/>`;
}

// ---------- render ----------
const scenes = { bean: sceneBean(), roast: sceneRoast(), sip: sceneSip() };
mkdirSync("assets-src/story", { recursive: true });
mkdirSync("public/img/story", { recursive: true });
for (const [k, svg] of Object.entries(scenes)) writeFileSync(`assets-src/story/${k}.svg`, svg);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(URL + "tools/storyart.html");
await page.waitForFunction(() => window.__fontsReady === true, null, { timeout: 30000 });
const tmp = join(tmpdir(), "chumuk-story");
mkdirSync(tmp, { recursive: true });
for (const [k, svg] of Object.entries(scenes)) {
  await page.evaluate((s) => { document.body.innerHTML = s; }, svg);
  await page.waitForTimeout(150);
  const png = join(tmp, k + ".png");
  await page.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: H } });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-c:v", "libwebp", "-quality", "86", `public/img/story/${k}.webp`]);
  console.log("wrote", `public/img/story/${k}.webp`);
}
rmSync(tmp, { recursive: true, force: true });
await browser.close();
