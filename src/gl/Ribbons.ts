import * as THREE from "three";

const vert = /* glsl */ `
varying vec2 vUv; varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform sampler2D map; uniform float uAlpha, uScroll, uRepeat, uFocus, uFar;
varying vec2 vUv; varying float vDist;
void main() {
  float blur = clamp(abs(vDist - uFocus) * 0.22, 0.0, 2.5);
  vec4 c = texture2D(map, vec2(vUv.x * uRepeat + uScroll, vUv.y), blur);
  // soft ends so a band never shows a hard cut when it doesn't reach the screen edge
  float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float nearFade = smoothstep(2.2, 4.5, vDist);
  gl_FragColor = vec4(c.rgb, c.a * ends * uAlpha * nearFade * uFar);
}`;

type Ribbon = {
  mesh: THREE.Mesh; u: { [k: string]: { value: number } };
  dist0: number; x: number; y: number; speed: number; dir: number;
};

const SPAN = 24;

/** Text bands flying past in 3D during the vortex (SPEC.md 5.4). */
export class Ribbons {
  readonly scene = new THREE.Scene();
  private list: Ribbon[] = [];

  constructor(texts: string[], screenAspect: number) {
    const rnd = mulberry32(11);
    texts.forEach((text, i) => {
      const main = i === 0;
      const tex = bandTexture(text, main);
      const len = main ? 11 : 6 + rnd() * 4;
      const h = main ? 0.4 : 0.19 + rnd() * 0.1;
      const u = {
        uAlpha: { value: 0 }, uScroll: { value: 0 }, uFocus: { value: 9 }, uFar: { value: 1 },
        uRepeat: { value: Math.max(1, Math.round((len / h) / ((tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height))) },
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { map: { value: tex }, ...u },
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
      mesh.rotation.set((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.9, THREE.MathUtils.degToRad(-14 + rnd() * 32));
      // keep most bands in the calm upper half of the vortex frame
      const spreadX = 3.2 * Math.max(0.6, screenAspect);
      this.list.push({
        mesh, u, dist0: (i / texts.length) * SPAN + rnd() * 1.5,
        x: (rnd() * 2 - 1) * spreadX * 0.45, y: main ? 1.2 : -0.6 + rnd() * 2.6,
        speed: 0.05 + rnd() * 0.08, dir: rnd() < 0.5 ? -1 : 1,
      });
      this.scene.add(mesh);
    });
  }

  update(time: number, alpha: number, travel: number, stream: number) {
    this.scene.visible = alpha > 0.002;
    if (!this.scene.visible) return;
    for (const r of this.list) {
      const dist = 1 + ((((r.dist0 - travel - stream * 0.8 - 1) % SPAN) + SPAN) % SPAN);
      r.mesh.position.set(r.x, r.y, -dist);
      r.u.uAlpha.value = alpha;
      r.u.uScroll.value = time * r.speed * r.dir;
      r.u.uFar.value = 1 - THREE.MathUtils.smoothstep(dist, SPAN - 4, SPAN + 1);
    }
  }
}

function bandTexture(text: string, main: boolean) {
  const bn = /[ঀ-৿]/.test(text);
  const c = document.createElement("canvas");
  const H = 128;
  const g = c.getContext("2d")!;
  const font = bn ? `400 ${main ? 76 : 70}px "Tiro Bangla", serif` : `700 ${main ? 70 : 62}px "DM Sans", sans-serif`;
  g.font = font;
  const unit = `${text}   ·   `;
  const spacing = bn ? 0 : 0.14 * 64;
  const w = Math.ceil(measure(g, unit, spacing));
  c.width = Math.min(4096, w); c.height = H;
  g.fillStyle = "#0b0907";
  g.fillRect(0, 0, c.width, H);
  // hairline edges like printed tape
  g.fillStyle = "rgba(244,237,224,0.12)";
  g.fillRect(0, 6, c.width, 2); g.fillRect(0, H - 8, c.width, 2);
  g.font = font;
  g.fillStyle = "#F4EDE0";
  g.textBaseline = "middle";
  drawSpaced(g, unit, 0, H / 2 + (bn ? 6 : 3), spacing);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; // raw shader: pass display colours straight through
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function measure(g: CanvasRenderingContext2D, s: string, spacing: number) {
  return g.measureText(s).width + spacing * s.length;
}
function drawSpaced(g: CanvasRenderingContext2D, s: string, x: number, y: number, spacing: number) {
  if (!spacing) { g.fillText(s, x, y); return; }
  for (const ch of s) { g.fillText(ch, x, y); x += g.measureText(ch).width + spacing; }
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
