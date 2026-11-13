import { PLATES } from "../gl/plateDefs";
import type { Cam, PlateState } from "../gl/Plates";

/**
 * ONE continuous camera flying into the cup.
 *
 * `d` is the camera depth in log-zoom units: plate K1 is shown at zoom e^d. Each next plate is a
 * closer view of the previous one, scaled by R (measured on the images), so plate i is at zoom
 * e^(d - off_i). A plate grows out of the centre of the previous one (scale-matched, feathered
 * edges) and takes over when it covers the screen. Log-linear zoom = constant perceived speed.
 */
const ORDER = ["K1", "K2", "K3", "K4", "K5", "K6"] as const;
const R = [2.3, 2.0, 2.1];                 // K2 = 2.3× K1, K3 = 2× K2, K4 = 2.1× K3 (zoom-throughs)
// K4 → K5 is a plunge through the surface (wipe), so K5's offset is a chosen dwell, not a scale
const OFF: number[] = [0, Math.log(R[0]), Math.log(R[0] * R[1]), Math.log(R[0] * R[1] * R[2])];
OFF[4] = OFF[3] + 0.4;
OFF[5] = OFF[4] + 0.833;                   // K6 grows out of K5 (zoom-through, ~2.3×)
const HAND: ("zoom" | "wipe")[] = ["zoom", "zoom", "zoom", "zoom", "wipe", "zoom"];
const Z_IN = 0.8, Z_FULL = 1.08;            // next plate starts appearing / fully covers
const IMG_ASPECT = 1672 / 941;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Monotone cubic (Fritsch–Carlson): smooth speed changes between pacing keyframes, never overshoots. */
function monotone(xs: number[], ys: number[]) {
  const n = xs.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = dx[i], u = (x - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * t[i + 1];
  };
}

// depth where each plate starts to appear / fully covers
const dIn = (i: number) => (HAND[i] === "wipe" ? OFF[i] + 0.08 : OFF[i] + Math.log(Z_IN));
const dFull = (i: number) => (HAND[i] === "wipe" ? OFF[i] + 0.33 : OFF[i] + Math.log(Z_FULL));
const D_END = OFF[5] + Math.log(1.2);
const D_PORTAL = OFF[5] + Math.log(1.5);
/** Scroll progress where the portal opens / the stage has settled. */
export const P_PORTAL: [number, number] = [0.765, 0.9];
export const P_SETTLE: [number, number] = [0.79, 0.97];

let cache: { key: string; pace: (p: number) => number; d0: number; heroAnchor: [number, number] } | null = null;
function rig(aspect: number) {
  const narrow = aspect < 1;
  const key = `${narrow}:${aspect.toFixed(3)}`;
  if (cache?.key === key) return cache;
  // phones start zoomed OUT on K1 (whole cup, black above/below) and push in to full-bleed
  const zb = narrow ? Math.min(1, aspect / IMG_ASPECT / 0.66) : 1;
  const d0 = Math.log(zb);
  // pacing: slower "dwell" on each plate, quicker through the hand-overs (speed changes are smoothed)
  const P = [0, 0.12, 0.18, 0.26, 0.31, 0.39, 0.445, 0.54, 0.585, 0.65, 0.69, P_PORTAL[0], P_PORTAL[1]];
  const D = [d0, dIn(1) - 0.05, dFull(1) + 0.04, dIn(2) - 0.05, dFull(2) + 0.05, dIn(3) - 0.05, dFull(3) + 0.03,
    dIn(4) - 0.03, dFull(4) + 0.03, dIn(5) - 0.05, dFull(5) + 0.03, D_END, D_PORTAL];
  // where the K1 focus (the cup) sits on screen at the start: unchanged framing of the hero
  const sc = aspect > IMG_ASPECT ? [1, IMG_ASPECT / aspect] : [aspect / IMG_ASPECT, 1];
  const f = PLATES.K1.focus;
  const c0 = narrow ? [f[0], 0.55] : [0.5, 0.5];
  const heroAnchor: [number, number] = [0.5 + ((f[0] - c0[0]) * zb) / sc[0], 0.5 + ((f[1] - c0[1]) * zb) / sc[1]];
  cache = { key, pace: monotone(P, D), d0, heroAnchor };
  return cache;
}

export type JourneyState = {
  plate: PlateState;
  depth: number;          // camera depth d (for motion blur from its rate of change)
  travel: number;         // bean camera travel
  beanOpacity: number;
  fall: number;           // 0 = beans fly at the lens, 1 = beans sink (under water)
  ribbons: { alpha: number; travel: number };
  portal: number;         // 0..1 hole opening
  settle: number;         // 0..1 stage settling
  heroCopy: { opacity: number; x: number };
  hint: number;
};

export function journey(p: number, aspect: number): JourneyState {
  const { pace, d0, heroAnchor } = rig(aspect);
  const d = pace(p);

  const zoom = (i: number) => Math.exp(d - OFF[i]);
  const mixOf = (i: number) => smooth(seg(d, dIn(i), dFull(i)));

  // anchor = where the plate's focus point sits on screen (0..1)
  const anchor = (i: number): [number, number] => {
    if (i === 0) {
      const t = smooth(seg(d, d0, dIn(1) - 0.05));      // the cup glides to centre during the push-in
      return [lerp(heroAnchor[0], 0.5, t), lerp(heroAnchor[1], 0.5, t)];
    }
    if (i === 2) return [0.5, lerp(0.5, 0.78, smooth(seg(d, dIn(3) - 0.3, dFull(3))))]; // tilt up to the horizon
    if (i === 3) return [0.5, 0.78];                      // K4's vortex sits low, horizon above
    if (i === 5) return [0.5, 0.55];
    return [0.5, 0.5];
  };
  const twist = (i: number) => {
    // the crema swirl winds up into the vortex
    if (i === 2) return 3.2 * smooth(seg(d, dIn(3) - 0.25, dFull(3)));
    if (i === 3) return -3.2 * (1 - mixOf(3));
    return 0;
  };
  const cam = (i: number): Cam => { const a = anchor(i); return { x: a[0], y: a[1], z: zoom(i), twist: twist(i) }; };

  // which two plates are on screen
  let top = 0;
  for (let i = 1; i < ORDER.length; i++) if (d >= dIn(i)) top = i;
  const m = top > 0 ? mixOf(top) : 0;
  const a = m < 1 && top > 0 ? top - 1 : top;
  const b = m < 1 && top > 0 ? top : Math.min(top + 1, ORDER.length - 1);

  const plate: PlateState = {
    a: ORDER[a], b: ORDER[b], camA: cam(a), camB: cam(b), mix: a === top ? 0 : m,
    blur: 0, wordAlpha: 0, wordScale: 1, fade: 1, flow: 1, reveal: null,
  };
  // the camera turns with the swirl over the top-down macro, then unwinds into the vortex
  const turnIn = smooth(seg(d, dIn(2), dFull(2) + 0.2)), turnOut = 1 - smooth(seg(d, dIn(3) - 0.2, dFull(3)));
  plate.roll = 0.8 * Math.max(0, d - dIn(2)) * turnIn * turnOut;
  if (HAND[b] === "wipe" && a !== b) { plate.wipe = 1.15 - 1.3 * smooth(seg(d, dIn(b), dFull(b))); plate.mix = 1; }

  // giant outline word + headline belong to the hero push-in
  const k1 = seg(d, d0, dIn(1));
  plate.wordAlpha = smooth(seg(k1, 0.06, 0.3)) * (1 - smooth(seg(k1, 0.72, 1)));
  plate.wordScale = lerp(0.92, 1.25, k1);
  const copyOut = smooth(seg(k1, 0.02, 0.28));

  return {
    plate,
    depth: d,
    travel: (d - d0) * 9,
    beanOpacity: (1 - 0.55 * smooth(seg(d, dIn(2), dFull(2))) * (1 - smooth(seg(d, dIn(3), dFull(3))))) *
      (1 - smooth(seg(p, P_PORTAL[0], P_PORTAL[0] + 0.08))),
    fall: smooth(seg(d, dIn(4), dFull(4))),
    ribbons: {
      alpha: smooth(seg(d, dIn(3), dFull(3))) * (1 - smooth(seg(d, dIn(4) - 0.04, dIn(4) + 0.12))),
      travel: (d - dIn(3)) * 26,
    },
    portal: seg(p, P_PORTAL[0], P_PORTAL[1]),
    settle: seg(p, P_SETTLE[0], P_SETTLE[1]),
    heroCopy: { opacity: 1 - copyOut, x: -copyOut * 60 },
    hint: 1 - smooth(seg(p, 0, 0.02)),
  };
}
