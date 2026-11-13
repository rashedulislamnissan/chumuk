import * as THREE from "three";
import type { Product } from "../data/products";

/**
 * Stand-up paper coffee pouch.
 * Geometry: a subdivided box deformed into a pouch (pillowed faces, side gussets folded inward in a V,
 * pinched flat into a crimped heat seal at the top, a slightly flared stand-up base, faint wrinkles).
 * Surface: one shared procedural paper (fibres + crumple + creases) gives a normal map and an albedo
 * modulation that every label is printed "onto"; only the gold foil is metal (ORM map), the rest is matte paper.
 */
export const BAG_W = 1.24, BAG_H = 2.0, BAG_D = 0.5; // local units (height 2)

// ---------- geometry ----------
export function bagGeometry() {
  const g = new THREE.BoxGeometry(BAG_W, BAG_H, BAG_D, 24, 56, 12);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const wob = (x: number, y: number) => Math.sin(x * 9.1 + Math.sin(y * 3.7) * 1.3) * Math.sin(y * 6.3 + x * 2.1) * 0.6 + Math.sin(x * 17.0 - y * 11.0) * 0.4;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + BAG_H / 2) / BAG_H;           // 0 bottom .. 1 top
    const u = v.x / (BAG_W / 2);                    // -1 .. 1
    const zf = v.z / (BAG_D / 2);                   // -1 .. 1 (front/back faces at ±1)
    const seal = sm(0.68, 0.92, t);
    // depth: full at the base, pinches to a flat seal at the top
    const depth = 1 - 0.95 * seal;
    // pillow bulge on front/back, none at the seal or the side edges
    const pillow = 0.07 * (1 - u * u) * Math.sin(Math.PI * Math.min(1, t / 0.92)) * (1 - sm(0.8, 0.92, t));
    // faint paper wrinkles on the faces (silhouette realism), fading out at the seal
    const wr = 0.006 * wob(u, t * 2) * (1 - seal) * Math.abs(zf);
    v.z = v.z * depth + Math.sign(zf) * (Math.abs(zf) * pillow + wr);
    // side gusset folds inward in a V (only the side faces: |u| = 1, |zf| < 1)
    if (Math.abs(u) > 0.999) v.x -= Math.sign(u) * 0.085 * (1 - Math.abs(zf)) * (1 - seal) * (0.6 + 0.4 * sm(0, 0.15, t));
    // stand-up base flares a touch; seal is a touch wider than the body
    v.x *= 1 + 0.025 * (1 - sm(0, 0.12, t)) + 0.012 * sm(0.9, 0.96, t);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- shared paper ----------
const LW = 1024, LH = Math.round((1024 * BAG_H) / BAG_W); // label canvas keeps the bag's proportions
const PW = 512, PH = Math.round((PW * BAG_H) / BAG_W);    // paper height/normal resolution

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Paper = { normal: THREE.Texture; mod: HTMLCanvasElement };
let paper: Paper | undefined;

/** Height field → normal map + an albedo modulation canvas (128 grey = neutral, for soft-light). */
function getPaper(): Paper {
  if (paper) return paper;
  const rnd = mulberry(20261113);
  const h = new Float32Array(PW * PH);

  // 1. crumple: three octaves of smooth value noise
  for (const [cell, amp] of [[110, 1.0], [46, 0.45], [16, 0.16]] as const) {
    const gw = Math.ceil(PW / cell) + 2, gh = Math.ceil(PH / cell) + 2;
    const grid = Float32Array.from({ length: gw * gh }, () => rnd() * 2 - 1);
    for (let y = 0; y < PH; y++) {
      const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < PW; x++) {
        const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
        h[y * PW + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  }

  // 2. creases: soft ridges/valleys with a sharp fold line, plus the two real folds of a pouch
  type Crease = { ax: number; ay: number; bx: number; by: number; amp: number; w: number };
  const creases: Crease[] = [];
  for (let i = 0; i < 10; i++) {
    const cx = rnd() * PW, cy = PH * (0.14 + rnd() * 0.7), len = 90 + rnd() * 300;
    const ang = (rnd() < 0.7 ? (rnd() - 0.5) * 0.9 : (rnd() - 0.5) * 2.6);
    creases.push({ ax: cx - Math.cos(ang) * len / 2, ay: cy - Math.sin(ang) * len / 2, bx: cx + Math.cos(ang) * len / 2, by: cy + Math.sin(ang) * len / 2, amp: (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.9), w: 5 + rnd() * 12 });
  }
  creases.push({ ax: -10, ay: PH * 0.9, bx: PW + 10, by: PH * 0.905, amp: -1.6, w: 7 });   // stand-up base fold
  creases.push({ ax: -10, ay: PH * 0.115, bx: PW + 10, by: PH * 0.112, amp: -1.0, w: 5 }); // under the seal
  for (const c of creases) {
    const dx = c.bx - c.ax, dy = c.by - c.ay, l2 = dx * dx + dy * dy, reach = c.w * 3;
    const x0 = Math.max(0, Math.floor(Math.min(c.ax, c.bx) - reach)), x1 = Math.min(PW - 1, Math.ceil(Math.max(c.ax, c.bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(c.ay, c.by) - reach)), y1 = Math.min(PH - 1, Math.ceil(Math.max(c.ay, c.by) + reach));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - c.ax) * dx + (y - c.ay) * dy) / l2));
      const ex = x - (c.ax + t * dx), ey = y - (c.ay + t * dy), d = Math.sqrt(ex * ex + ey * ey);
      if (d > reach) continue;
      const fade = Math.sin(Math.PI * t) ** 0.4; // creases die out at their ends
      h[y * PW + x] += c.amp * fade * (0.35 * Math.exp(-((d / c.w) ** 2)) + 0.5 * Math.exp(-((d / 1.3) ** 2)));
    }
  }

  // 3. fibres: short random strokes, read back as fine height
  const fc = document.createElement("canvas");
  fc.width = PW; fc.height = PH;
  const fg = fc.getContext("2d", { willReadFrequently: true })!;
  fg.fillStyle = "rgb(128,128,128)"; fg.fillRect(0, 0, PW, PH);
  fg.lineCap = "round";
  for (let i = 0; i < 7000; i++) {
    const x = rnd() * PW, y = rnd() * PH, a = rnd() * Math.PI, l = 2 + rnd() * 9;
    fg.strokeStyle = rnd() < 0.5 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
    fg.lineWidth = 0.5 + rnd() * 0.8;
    fg.beginPath(); fg.moveTo(x, y); fg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); fg.stroke();
  }
  const fib = fg.getImageData(0, 0, PW, PH).data;
  for (let i = 0; i < PW * PH; i++) h[i] += ((fib[i * 4] - 128) / 128) * 0.22;

  // 4. normal map (OpenGL convention, canvas rows run down = -v) + albedo modulation (baked emboss + AO)
  const nc = document.createElement("canvas"), mc = document.createElement("canvas");
  nc.width = mc.width = PW; nc.height = mc.height = PH;
  const nImg = nc.getContext("2d")!.createImageData(PW, PH), mImg = mc.getContext("2d")!.createImageData(PW, PH);
  const S = 3.2;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x;
    const dx = h[y * PW + Math.min(PW - 1, x + 1)] - h[y * PW + Math.max(0, x - 1)];
    const dy = h[Math.min(PH - 1, y + 1) * PW + x] - h[Math.max(0, y - 1) * PW + x];
    let nx = -dx * S, ny = dy * S, nz = 1;
    const k = 1 / Math.hypot(nx, ny, nz); nx *= k; ny *= k; nz *= k;
    nImg.data[i * 4] = (nx * 0.5 + 0.5) * 255; nImg.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nImg.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nImg.data[i * 4 + 3] = 255;
    // lit from top-left + a little height AO, so creases read even under flat light
    const m = 128 + (-dx + -dy) * 70 + h[i] * 9 + ((fib[i * 4] - 128) * 0.35);
    const c = Math.max(0, Math.min(255, m));
    mImg.data[i * 4] = mImg.data[i * 4 + 1] = mImg.data[i * 4 + 2] = c; mImg.data[i * 4 + 3] = 255;
  }
  nc.getContext("2d")!.putImageData(nImg, 0, 0);
  mc.getContext("2d")!.putImageData(mImg, 0, 0);
  const normal = new THREE.CanvasTexture(nc);
  normal.colorSpace = THREE.NoColorSpace;
  normal.anisotropy = 8;
  paper = { normal, mod: mc };
  return paper;
}

/** Print-on-paper pass: soft-light the paper over everything drawn so far (+ a lift on dark stock). */
function paperPass(g: CanvasRenderingContext2D, w: number, h: number, dark: boolean, sx = 0, sw = PW) {
  const { mod } = getPaper();
  g.save();
  g.globalCompositeOperation = "soft-light"; g.globalAlpha = dark ? 1 : 0.85;
  g.drawImage(mod, sx, 0, sw, PH, 0, 0, w, h);
  if (dark) { g.globalCompositeOperation = "screen"; g.globalAlpha = 0.055; g.drawImage(mod, sx, 0, sw, PH, 0, 0, w, h); }
  g.restore();
}

// ---------- label art helpers ----------
function spiralPath(g: CanvasRenderingContext2D, cx: number, cy: number, rMax: number) {
  const turns = 3.2, rMin = rMax * 0.08, steps = 300;
  const k = (rMax - rMin) / (turns * 2 * Math.PI);
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI, r = rMin + k * t;
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
}

function spaced(g: CanvasRenderingContext2D, s: string, cx: number, y: number, track: number) {
  // untracked text in one call: drawing Bangla per code point breaks its vowel signs (চুমুক → চ ু ম ু ক)
  if (!track) { g.save(); g.textAlign = "center"; g.fillText(s, cx, y); g.restore(); return; }
  const chars = [...s];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => { g.fillText(c, x, y); x += widths[i] + track; });
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  return `rgb(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)})`;
};
const isLight = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
const isDark = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.2;
const bandInk = (p: Product) => (new THREE.Color(p.band).getHSL({ h: 0, s: 0, l: 0 }).l < 0.45 ? "#F4EDE0" : "#16110E");
const goldOf = (p: Product) => (isLight(p.bag) ? "#B8862F" : "#D4A24C");

const USE: Record<string, string> = {
  kalo: "Black coffee · pour-over · moka pot", shada: "Latte · cold coffee · milk coffee", roj: "Any brew · any time",
};
const SEAL = 0.085, BAND = 0.875;

/** heat seal with crimp lines + tear notch line (shared by front/back/side) */
function seal(g: CanvasRenderingContext2D, p: Product, w: number, h: number) {
  const sH = h * SEAL, light = isLight(p.bag);
  g.fillStyle = shade(p.bag, light ? 0.9 : 0.78); g.fillRect(0, 0, w, sH);
  g.fillStyle = light ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.07)";
  for (let x = 0; x < w; x += 9) g.fillRect(x, 6, 3, sH - 12);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, sH * 1.55, w, 4);
}

function band(g: CanvasRenderingContext2D, p: Product, w: number, h: number) {
  const by = h * BAND;
  g.fillStyle = p.band; g.fillRect(0, by, w, h - by);
  g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, by, w, 3);
}

// ---------- front ----------
/** Front label (colour) + ORM map at half resolution (G = roughness, B = metalness). */
export function bagTextures(p: Product) {
  const col = document.createElement("canvas"), orm = document.createElement("canvas");
  col.width = LW; col.height = LH; orm.width = LW / 2; orm.height = Math.round(LH / 2);
  const g = col.getContext("2d")!, o = orm.getContext("2d")!;
  o.setTransform(0.5, 0, 0, 0.5, 0, 0);
  const light = isLight(p.bag), dark = isDark(p.bag), gold = goldOf(p);

  // stock + soft edge shading
  g.fillStyle = p.bag; g.fillRect(0, 0, LW, LH);
  const sh = g.createLinearGradient(0, 0, LW, 0);
  sh.addColorStop(0, "rgba(0,0,0,0.2)"); sh.addColorStop(0.16, "rgba(0,0,0,0)"); sh.addColorStop(0.84, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.22)");
  g.fillStyle = sh; g.fillRect(0, 0, LW, LH);
  o.fillStyle = "rgb(255,222,0)"; o.fillRect(0, 0, LW, LH); // matte paper: roughness ~0.87, no metal

  seal(g, p, LW, LH);
  o.fillStyle = "rgb(255,190,0)"; o.fillRect(0, 0, LW, LH * SEAL);

  // one-way valve (plastic, a little glossy)
  const vy = LH * 0.165;
  g.fillStyle = shade(p.bag, light ? 0.8 : 0.55);
  g.beginPath(); g.arc(LW / 2, vy, 30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = light ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.14)"; g.lineWidth = 3; g.stroke();
  g.fillStyle = light ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)";
  for (const [dx, dy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { g.beginPath(); g.arc(LW / 2 + dx, vy + dy, 3, 0, Math.PI * 2); g.fill(); }
  o.fillStyle = "rgb(255,105,0)"; o.beginPath(); o.arc(LW / 2, vy, 30, 0, Math.PI * 2); o.fill();

  // thin printed frame
  g.strokeStyle = light ? "rgba(22,17,14,0.3)" : "rgba(244,237,224,0.22)"; g.lineWidth = 2;
  g.strokeRect(LW * 0.07, LH * 0.115, LW * 0.86, LH * (BAND - 0.135));

  // wordmark + flavour
  g.fillStyle = p.text; g.textBaseline = "alphabetic";
  g.font = `700 ${LW * 0.118}px "Fraunces", Georgia, serif`;
  spaced(g, "CHUMUK", LW / 2, LH * 0.525, LW * 0.024);
  // Bangla wordmark in gold ink (as foil it mirrored the room and became unreadable on mid-tone stock)
  g.fillStyle = gold; g.font = `400 ${LW * 0.075}px "Tiro Bangla", serif`;
  spaced(g, "চুমুক", LW / 2, LH * 0.585, 0);
  g.fillStyle = p.text;
  g.font = `700 ${LW * (p.name.length > 10 ? 0.074 : 0.092)}px "DM Sans", sans-serif`;
  spaced(g, p.name.toUpperCase(), LW / 2, LH * 0.675, LW * 0.008);

  // roast dots
  const dy = LH * 0.718, dr = LW * 0.016, gap = LW * 0.05;
  for (let i = 0; i < 5; i++) {
    const x = LW / 2 + (i - 2) * gap;
    g.beginPath(); g.arc(x, dy, dr, 0, Math.PI * 2);
    if (i < p.dots) { g.fillStyle = p.text; g.fill(); } else { g.strokeStyle = p.text; g.lineWidth = 3; g.stroke(); }
  }

  // notes panel
  const py = LH * 0.75, ph = LH * 0.075, px = LW * 0.2;
  g.strokeStyle = light ? "rgba(22,17,14,0.4)" : "rgba(244,237,224,0.34)"; g.lineWidth = 3;
  g.strokeRect(px, py, LW - 2 * px, ph);
  g.fillStyle = p.text; g.font = `600 ${LW * 0.03}px "DM Sans", sans-serif`;
  spaced(g, `${p.notes[0]} · ${p.notes[1]}`.toUpperCase(), LW / 2, py + ph * 0.44, 2);
  g.globalAlpha = 0.75; g.font = `400 ${LW * 0.027}px "DM Sans", sans-serif`;
  spaced(g, p.roast.toUpperCase() + (p.edition ? ` · ${p.edition.toUpperCase()}` : ""), LW / 2, py + ph * 0.8, 2);
  g.globalAlpha = 1;

  // colour band + net weight
  band(g, p, LW, LH);
  const by = LH * BAND;
  g.fillStyle = bandInk(p); g.font = `700 ${LW * 0.028}px "DM Sans", sans-serif`;
  spaced(g, "ROASTED IN BANGLADESH", LW / 2, by + (LH - by) * 0.45, LW * 0.006);
  g.globalAlpha = 0.8; g.font = `600 ${LW * 0.022}px "DM Sans", sans-serif`;
  spaced(g, "WHOLE BEAN · NET WT 250 G", LW / 2, by + (LH - by) * 0.75, LW * 0.004);
  g.globalAlpha = 1;
  o.fillStyle = "rgb(255,212,0)"; o.fillRect(0, by, LW, LH - by);

  // everything above is printed ink on paper
  paperPass(g, LW, LH, dark);

  // gold foil on top of the paper: spiral + Bangla wordmark (real metal in the ORM map)
  const sy = LH * 0.34, sr = LW * 0.15;
  for (const [ctx, stroke] of [[g, gold], [o, "rgb(255,72,255)"]] as const) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = sr * 0.12; ctx.strokeStyle = stroke;
    spiralPath(ctx, LW / 2, sy, sr); ctx.stroke();
    ctx.fillStyle = stroke; ctx.beginPath(); ctx.arc(LW / 2, sy, sr * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const ormT = new THREE.CanvasTexture(orm); ormT.colorSpace = THREE.NoColorSpace;
  return { map, orm: ormT };
}

// ---------- back ----------
export function bagBackTexture(p: Product) {
  const w = 768, h = Math.round((w * BAG_H) / BAG_W), s = w / 1024;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const light = isLight(p.bag), gold = goldOf(p);
  const ink = p.text, soft = light ? "rgba(22,17,14,0.55)" : "rgba(244,237,224,0.6)", rule = light ? "rgba(22,17,14,0.25)" : "rgba(244,237,224,0.22)";
  g.fillStyle = p.bag; g.fillRect(0, 0, w, h);
  seal(g, p, w, h);
  g.textBaseline = "alphabetic";

  // small mark + wordmark
  g.save(); g.lineCap = "round"; g.lineWidth = 7 * s; g.strokeStyle = gold; spiralPath(g, w / 2, h * 0.17, 44 * s); g.stroke(); g.restore();
  g.fillStyle = ink; g.font = `700 ${56 * s}px "Fraunces", serif`; spaced(g, "CHUMUK", w / 2, h * 0.255, 12 * s);
  g.fillStyle = gold; g.font = `400 ${40 * s}px "Tiro Bangla", serif`; spaced(g, "এক চুমুক, আরেকটা।", w / 2, h * 0.3, 0);
  g.fillStyle = soft; g.font = `400 ${28 * s}px "DM Sans", sans-serif`; spaced(g, "One sip. Then another.", w / 2, h * 0.335, 0);

  // info table
  const x0 = w * 0.12, x1 = w * 0.88, lab = w * 0.12, val = w * 0.4;
  let y = h * 0.39;
  const row = (k: string, v: string) => {
    g.strokeStyle = rule; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.fillStyle = gold; g.font = `700 ${21 * s}px "DM Sans", sans-serif`; g.textAlign = "left"; g.fillText(k, lab, y + 40 * s);
    g.fillStyle = ink; g.font = `600 ${26 * s}px "DM Sans", sans-serif`; g.fillText(v, val, y + 40 * s);
    y += 62 * s;
  };
  row("FLAVOUR", `${p.name}`);
  row("ROAST", `${p.roast}${p.edition ? " · " + p.edition : ""}`);
  row("NOTES", `${p.notes[0]}, ${p.notes[1]}`);
  row("BEST FOR", USE[p.id] ?? "Pour-over · French press");
  row("BREW", "15 g · 250 ml · 93°C · 3 min");
  g.strokeStyle = rule; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  g.textAlign = "start";

  // Bangla line
  g.fillStyle = soft; g.font = `400 ${30 * s}px "Hind Siliguri", sans-serif`;
  spaced(g, `${p.bn} · ${p.notesBn[0]}, ${p.notesBn[1]}`, w / 2, y + 60 * s, 0);

  // roasted-on stamp + decorative barcode
  const sy = h * 0.74;
  g.strokeStyle = soft; g.lineWidth = 2; g.strokeRect(x0, sy, w * 0.34, 92 * s);
  g.fillStyle = soft; g.font = `700 ${17 * s}px "DM Sans", sans-serif`; g.fillText("ROASTED ON", x0 + 16 * s, sy + 30 * s);
  g.save(); g.translate(x0 + 18 * s, sy + 74 * s); g.rotate(-0.04);
  g.fillStyle = light ? "#9E2B25" : "#E07A5F"; g.globalAlpha = 0.85; g.font = `700 ${34 * s}px "Courier New", monospace`; g.fillText("13·11·26", 0, 0);
  g.restore();
  const bx = w * 0.56, bw = w * 0.32;
  g.fillStyle = light ? "#fff" : "#F4EDE0"; g.fillRect(bx, sy, bw, 92 * s);
  g.fillStyle = "#16110E";
  const rnd = mulberry(p.id.length * 97 + p.dots);
  for (let x = bx + 10 * s; x < bx + bw - 10 * s;) { const bw2 = (1 + Math.floor(rnd() * 3)) * 2.2 * s; if (rnd() > 0.35) g.fillRect(x, sy + 10 * s, bw2, 62 * s); x += bw2 + 2 * s; }

  band(g, p, w, h);
  const by = h * BAND;
  g.fillStyle = bandInk(p); g.font = `700 ${24 * s}px "DM Sans", sans-serif`;
  spaced(g, "ROASTED IN BANGLADESH · চুমুক", w / 2, by + (h - by) * 0.58, 0);

  paperPass(g, w, h, isDark(p.bag));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- side gusset ----------
export function bagSideTexture(p: Product) {
  const w = 256, h = 1024;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = shade(p.bag, 0.92); g.fillRect(0, 0, w, h);
  // fold shading down the middle of the gusset
  const f = g.createLinearGradient(0, 0, w, 0);
  f.addColorStop(0, "rgba(0,0,0,0.1)"); f.addColorStop(0.5, "rgba(0,0,0,0.28)"); f.addColorStop(0.52, "rgba(255,255,255,0.06)"); f.addColorStop(1, "rgba(0,0,0,0.1)");
  g.fillStyle = f; g.fillRect(0, 0, w, h);
  seal(g, p, w, h);
  g.save(); g.translate(w / 2, h * 0.5); g.rotate(-Math.PI / 2);
  g.fillStyle = p.text; g.globalAlpha = 0.85; g.textBaseline = "middle";
  g.font = `700 54px "Fraunces", serif`; spaced(g, "CHUMUK", -40, 0, 12);
  g.fillStyle = goldOf(p); g.font = `400 46px "Tiro Bangla", serif`; spaced(g, "চুমুক", 210, 4, 0);
  g.restore();
  band(g, p, w, h);
  paperPass(g, w, h, isDark(p.bag), PW * 0.4, PW * 0.2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- mesh ----------
let sharedGeo: THREE.BufferGeometry | undefined;

export function makeBag(p: Product) {
  const { map, orm } = bagTextures(p);
  const normalMap = getPaper().normal;
  const paperProps = {
    normalMap, normalScale: new THREE.Vector2(0.85, 0.85),
    sheen: 0.35, sheenRoughness: 0.85, sheenColor: new THREE.Color(0xc9a27a), transparent: true,
  };
  const front = new THREE.MeshPhysicalMaterial({ map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, ...paperProps });
  const back = new THREE.MeshPhysicalMaterial({ map: bagBackTexture(p), roughness: 0.86, metalness: 0, ...paperProps });
  const side = new THREE.MeshPhysicalMaterial({ map: bagSideTexture(p), roughness: 0.88, metalness: 0, ...paperProps, normalScale: new THREE.Vector2(0.6, 0.6) });
  // BoxGeometry groups: +x, -x, +y, -y, +z (front), -z (back)
  sharedGeo ??= bagGeometry();
  const mesh = new THREE.Mesh(sharedGeo, [side, side, side, side, front, back]);
  return { mesh, materials: [front, back, side] };
}
