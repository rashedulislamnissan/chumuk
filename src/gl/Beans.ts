import * as THREE from "three";

type Bean = {
  mesh: THREE.Mesh; base: THREE.Vector3; size: number;
  spin: number; flip: number; phase: number; drift: number;
};

const vert = /* glsl */ `
varying vec2 vUv; varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform sampler2D map; uniform float uOpacity, uFocus, uShade, uFar;
varying vec2 vUv; varying float vDist;
void main() {
  float blur = clamp(abs(vDist - uFocus) * 0.32, 0.0, 3.0);
  vec4 c = texture2D(map, vUv, blur);
  // soft quad edge so blurred (low-mip) sprites never show their square
  vec2 e = smoothstep(vec2(0.0), vec2(0.16), vUv) * smoothstep(vec2(1.0), vec2(0.84), vUv);
  c.a *= e.x * e.y;
  float depthDim = mix(1.0, 0.45, smoothstep(8.0, 24.0, vDist));   // far beans sink into the dark
  vec3 col = c.rgb * vec3(0.95, 0.86, 0.78) * depthDim * uShade;
  float nearFade = smoothstep(0.6, 2.2, vDist);                        // don't pop when passing the lens
  gl_FragColor = vec4(col, c.a * uOpacity * nearFade * uFar);
}`;

export class Beans {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private beans: Bean[] = [];
  private uniforms: { uOpacity: { value: number }; uFocus: { value: number }; uShade: { value: number } }[] = [];

  constructor(manager: THREE.LoadingManager, meta: { file: string; aspect: number }[], screenAspect: number, count = 30) {
    const narrow = screenAspect < 1;
    const loader = new THREE.TextureLoader(manager);
    const base = import.meta.env.BASE_URL + "img/";
    const texs = meta.map((m) => {
      const t = loader.load(base + m.file);
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return { t, aspect: m.aspect };
    });
    const rnd = mulberry32(7);
    for (let i = 0; i < count; i++) {
      const { t, aspect } = texs[i % texs.length];
      const u = { uOpacity: { value: 0 }, uFocus: { value: 9 }, uShade: { value: 1 } };
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
        uniforms: { map: { value: t }, uFar: { value: 1 }, ...u },
      });
      this.uniforms.push(u);
      const size = 0.32 + rnd() * 0.32;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect, size), mat);
      // spread in screen space at a reference distance; beans then stream toward the lens
      const dist0 = 2 + rnd() * SPAN;
      const ref = 12, halfH = ref * Math.tan((17.5 * Math.PI) / 180), halfW = halfH * screenAspect;
      let sx = rnd() * 2 - 1, sy = rnd() * 2 - 1;
      if (narrow) {
        if (Math.abs(sx) < 0.5 && Math.abs(sy) < 0.35) sy = Math.sign(sy || 1) * (0.4 + rnd() * 0.55);
      } else if (sx > -0.22 && sx < 0.62) {
        // desktop: keep the cup + stream column (screen x ≈ 0.6) clear
        sx = rnd() < 0.55 ? -0.28 - rnd() * 0.72 : 0.68 + rnd() * 0.32;
      }
      this.beans.push({
        mesh, base: new THREE.Vector3(sx * halfW, sy * halfH, dist0), size,
        spin: (rnd() - 0.5) * 0.8, flip: 0.5 + rnd() * 1.1, phase: rnd() * 6.28, drift: 0.05 + rnd() * 0.12,
      });
      this.scene.add(mesh);
    }
  }

  resize(w: number, h: number) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  /** travel: camera flight (world units, from scroll); stream: idle forward drift (world units). */
  /** sink: accumulated sinking (world units), grows only while under water. */
  update(time: number, opacity: number, travel: number, stream: number, sink = 0, shade = 1) {
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);
    for (const b of this.beans) {
      const t = time + b.phase;
      // distance ahead of the lens, wrapping from near back to far so beans never run out
      const dist = 1 + ((((b.base.z - travel - stream - 1) % SPAN) + SPAN) % SPAN);
      // under water the beans sink: drift down and wrap from the bottom back to the top
      const yy = b.base.y - sink * (0.7 + b.drift * 3);
      const range = 4.6; // > largest base.y, so the wrap is a no-op until beans actually sink
      const y = ((((yy + range) % (2 * range)) + 2 * range) % (2 * range)) - range;
      b.mesh.position.set(
        b.base.x + Math.sin(t * 0.31) * b.drift * 2,
        y + Math.sin(t * 0.43) * b.drift * 3,
        -dist,
      );
      b.mesh.rotation.z = b.phase + t * b.spin;
      b.mesh.scale.set(0.55 + 0.45 * Math.abs(Math.cos(t * b.flip)), 1, 1);
      (b.mesh.material as THREE.ShaderMaterial).uniforms.uFar.value = 1 - THREE.MathUtils.smoothstep(dist, SPAN - 5, SPAN + 1);
    }
    this.uniforms.forEach((u) => { u.uOpacity.value = opacity; u.uFocus.value = 9; u.uShade.value = shade; });
  }
}

const SPAN = 24;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
