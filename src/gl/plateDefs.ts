/**
 * Each scene image ("plate") and the motion painted onto it.
 * Coordinates are image UVs, x right / y DOWN, 0..1 (measured on the source images).
 *
 * Flow types:
 *   1 stream  : vertical band from the top edge down to c.y, content flows down. size = (half width, -)
 *   2 swirl   : elliptical whirl around c. size = (rx, ry). k = speed (uv/s at the rim)
 *   3 steam   : soft ellipse, content rises and wavers. size = (rx, ry)
 *   4 bob     : small region bobs up and down (a floating droplet). size = (rx, ry), k = amplitude
 *   5 caustic : live underwater light web + liquid ripple over an ellipse. size = (rx, ry), k = strength
 */
export type Flow = { type: 1 | 2 | 3 | 4 | 5; c: [number, number]; size: [number, number]; k: number };
export type PlateDef = { id: string; url: string; focus: [number, number]; flows: Flow[] };

const base = import.meta.env.BASE_URL + "img/k/";

export const PLATES: Record<string, PlateDef> = {
  K1: {
    id: "K1", url: base + "K1.webp", focus: [0.615, 0.47],
    flows: [
      { type: 1, c: [0.616, 0.43], size: [0.0042, 1], k: 0.2 },
      { type: 3, c: [0.575, 0.2], size: [0.12, 0.2], k: 0.028 },
      { type: 2, c: [0.613, 0.47], size: [0.11, 0.022], k: 0.018 },
    ],
  },
  K2: {
    id: "K2", url: base + "K2.webp", focus: [0.526, 0.47],
    flows: [
      { type: 1, c: [0.526, 0.47], size: [0.0125, 1], k: 0.24 },
      { type: 2, c: [0.526, 0.47], size: [0.3, 0.14], k: 0.03 },
      { type: 3, c: [0.52, 0.06], size: [0.3, 0.12], k: 0.022 },
    ],
  },
  K3: {
    id: "K3", url: base + "K3.webp", focus: [0.514, 0.447],
    flows: [
      { type: 2, c: [0.514, 0.447], size: [0.6, 0.55], k: 0.028 },
      { type: 4, c: [0.5, 0.24], size: [0.05, 0.08], k: 0.006 },
    ],
  },
  K4: {
    id: "K4", url: base + "K4.webp", focus: [0.513, 0.8],
    flows: [{ type: 2, c: [0.513, 0.8], size: [0.55, 0.14], k: 0.055 }],
  },
  K5: {
    id: "K5", url: base + "K5.webp", focus: [0.5, 0.55],
    flows: [{ type: 5, c: [0.5, 0.62], size: [0.75, 0.55], k: 0.75 }],
  },
  K6: {
    id: "K6", url: base + "K6.webp", focus: [0.513, 0.6],
    flows: [
      { type: 1, c: [0.512, 0.6], size: [0.011, 1], k: 0.26 },
      { type: 5, c: [0.5, 0.82], size: [0.75, 0.3], k: 0.55 },
      { type: 3, c: [0.58, 0.35], size: [0.14, 0.22], k: 0.02 },
    ],
  },
};

export const PLATE_ORDER = ["K1", "K2", "K3", "K4", "K5", "K6"] as const;
