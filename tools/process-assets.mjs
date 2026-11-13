// Converts owner-supplied images in assets-src/ into web-ready files in public/img/.
// Needs ffmpeg on PATH. Run: npm run assets
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = "assets-src";
const OUT = "public/img";
const ff = (args, opts = {}) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 1 << 30, ...opts });
const probe = (f) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).toString().trim().split(",").map(Number);

// ---------- 1. Scene keyframes -> WebP ----------
mkdirSync(`${OUT}/k`, { recursive: true });
for (const k of ["K1_hero", "K2_closeup", "K3_macro", "K4_vortex", "K5_under", "K6_beans"]) {
  const id = k.slice(0, 2);
  ff(["-i", `${SRC}/1-keyframes/${k}.png`, "-c:v", "libwebp", "-quality", "88", "-compression_level", "6", `${OUT}/k/${id}.webp`]);
  // small blurred placeholder for instant first paint
  ff(["-i", `${SRC}/1-keyframes/${k}.png`, "-vf", "scale=64:-2", "-c:v", "libwebp", "-quality", "60", `${OUT}/k/${id}_tiny.webp`]);
  console.log("keyframe", id);
}
// Story illustrations are drawn by tools/storyart.mjs (public/img/story/{bean,roast,sip}.webp)

// ---------- 2. Cut objects off a white background ----------
// alpha from the darkest channel (brown/black objects vs. white bg), with edge colour decontamination.
function cutWhite(file, { lo = 0.42, hi = 0.8, minArea = 400, pad = 10 } = {}) {
  const [W, H] = probe(file);
  const raw = ff(["-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const A = new Float32Array(W * H);
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const r = raw[i * 3] / 255, g = raw[i * 3 + 1] / 255, b = raw[i * 3 + 2] / 255;
    const m = Math.min(r, g, b);
    let t = Math.min(1, Math.max(0, (m - lo) / (hi - lo)));
    const a = 1 - t * t * (3 - 2 * t);
    A[i] = a;
    // un-mix white: obs = a*c + (1-a)*1
    const un = (v) => (a > 0.02 ? Math.min(1, Math.max(0, (v - (1 - a)) / a)) : 0);
    rgba[i * 4] = un(r) * 255; rgba[i * 4 + 1] = un(g) * 255; rgba[i * 4 + 2] = un(b) * 255;
    rgba[i * 4 + 3] = a * 255;
  }
  // connected components on alpha > .5
  const lab = new Int32Array(W * H).fill(-1);
  const boxes = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (A[s] < 0.5 || lab[s] !== -1) continue;
    const id = boxes.length;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    stack.push(s); lab[s] = id;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H) continue;
        if (Math.abs((q % W) - x) > 1) continue;
        if (A[q] >= 0.5 && lab[q] === -1) { lab[q] = id; stack.push(q); }
      }
    }
    boxes.push({ x0, y0, x1, y1, n });
  }
  return { W, H, rgba, boxes: boxes.filter((b) => b.n >= minArea), pad };
}

function writeCrop({ W, H, rgba }, b, pad, outFile, maxSide) {
  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
  const x1 = Math.min(W - 1, b.x1 + pad), y1 = Math.min(H - 1, b.y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const crop = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) rgba.copy(crop, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4);
  const tmp = join(tmpdir(), `chumuk_crop_${Date.now()}.raw`);
  writeFileSync(tmp, crop);
  const scale = Math.max(w, h) > maxSide ? (w >= h ? `scale=${maxSide}:-2` : `scale=-2:${maxSide}`) : "null";
  ff(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", tmp, "-vf", scale, "-c:v", "libwebp", "-quality", "90", "-pix_fmt", "yuva420p", outFile]);
  rmSync(tmp);
  return { w, h };
}

// beans: 12 separate sprites
mkdirSync(`${OUT}/beans`, { recursive: true });
const beans = cutWhite(`${SRC}/4-beans/beans_sheet.png`);
beans.boxes.sort((a, b) => (Math.abs(a.y0 - b.y0) > 60 ? a.y0 - b.y0 : a.x0 - b.x0));
const beanMeta = beans.boxes.map((b, i) => {
  const name = `bean_${String(i + 1).padStart(2, "0")}.webp`;
  const { w, h } = writeCrop(beans, b, 14, `${OUT}/beans/${name}`, 320);
  return { file: `beans/${name}`, aspect: +(w / h).toFixed(3) };
});
writeFileSync(`${OUT}/beans/beans.json`, JSON.stringify(beanMeta, null, 2));
console.log("beans", beanMeta.length);

// cups: flood-fill the white background in from the edges. Everything enclosed by the clay
// outline (including cream paint) stays opaque; the soft grey shadow outside becomes a dark shadow.
function cutObject(file, coreMax = 0.6) {
  const [W, H] = probe(file);
  const raw = ff(['-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const core = new Uint8Array(W * H), outside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = raw[i * 3] / 255, g = raw[i * 3 + 1] / 255, b = raw[i * 3 + 2] / 255;
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    // object = coloured clay/crema, or very dark coffee; grey shadow is neither
    core[i] = (mn < coreMax && mx - mn > 0.14) || mx < 0.3 ? 1 : 0;
  }
  const st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) {
    const p = st.pop();
    if (outside[p] || core[p]) continue;
    outside[p] = 1;
    const x = p % W;
    if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1);
    if (p >= W) st.push(p - W); if (p < W * (H - 1)) st.push(p + W);
  }
  const rgba = Buffer.alloc(W * H * 4);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) {
    if (!outside[i]) {
      rgba[i * 4] = raw[i * 3]; rgba[i * 4 + 1] = raw[i * 3 + 1]; rgba[i * 4 + 2] = raw[i * 3 + 2]; rgba[i * 4 + 3] = 255;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    } else {
      const lum = (0.3 * raw[i * 3] + 0.59 * raw[i * 3 + 1] + 0.11 * raw[i * 3 + 2]) / 255;
      const t = Math.min(1, Math.max(0, (1 - lum - 0.03) / 0.3));
      rgba[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 0.8 * 255); // black shadow
    }
  }
  return { W, H, rgba, box: { x0, y0, x1, y1 } };
}

mkdirSync(OUT + "/cups", { recursive: true });
const cupMeta = {};
for (const name of ["cup_pair", "cup_clay"]) {
  const cut = cutObject(`${SRC}/3-cups/${name}.png`);
  const { w, h } = writeCrop(cut, cut.box, 40, `${OUT}/cups/${name}.webp`, 900);
  cupMeta[name] = { file: `cups/${name}.webp`, aspect: +(w / h).toFixed(3) };
}
writeFileSync(`${OUT}/cups/cups.json`, JSON.stringify(cupMeta, null, 2));
console.log('cups', Object.keys(cupMeta).length);
