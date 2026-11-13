import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { byId, ring, wrap, trioAt, type Product } from "../data/products";
import { makeBag, BAG_H, BAG_W } from "./Bag";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DEG = Math.PI / 180;

type CupDef = { file: string; aspect: number };
type BagObj = {
  product: Product; idx: number; // position in the carousel ring
  group: THREE.Group; mesh: THREE.Mesh; mats: THREE.MeshPhysicalMaterial[];
};
const N = ring.length;

// glowing line material (additive, soft halo by view angle, travelling light pulse along the path)
function glowMaterial(color: number, strength: number, pulse = 0) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uTime: { value: 0 }, uPulse: { value: pulse }, uFrontDim: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength, uTime, uPulse, uFrontDim;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW;
      void main() {
        float core = pow(abs(dot(vN, vV)), 3.0);
        float p = uPulse > 0.0 ? 0.55 + 0.45 * pow(0.5 + 0.5 * sin((vUv.x * 6.2831 * 2.0) - uTime * 1.6), 6.0) : 1.0;
        float front = mix(1.0, 0.3, uFrontDim * smoothstep(-0.2, 1.4, vW.z));
        gl_FragColor = vec4(uColor * core * uStrength * p * front, 1.0);
      }`,
  });
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private bags: BagObj[] = [];
  /** cups belong to the three stage positions (left, centre, right), not to the bags */
  private cups: THREE.Mesh[] = [];
  private orbit: THREE.Group;
  private rings: THREE.Group;
  private warm: THREE.Mesh;
  private ringMats: THREE.ShaderMaterial[] = [];
  private orbitMats: THREE.ShaderMaterial[] = [];
  private cupTex: Record<string, { tex: THREE.Texture; aspect: number }> = {};
  private aspect = 1.6;
  private raycaster = new THREE.Raycaster();

  /** carousel position (float while animating) and its velocity */
  current = 0;
  private target = 0;
  private vel = 0;
  private hover = 0;
  private hoverTarget = 0;
  onSlide?: (slide: number) => void;

  constructor(renderer: THREE.WebGLRenderer, cups: Record<string, CupDef>) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.38;
    // warm key from front-left, strong golden rim from behind so dark bags separate from the dark stage
    const key = new THREE.DirectionalLight(0xffe2bf, 1.6); key.position.set(-3, 3, 6);
    const rimR = new THREE.DirectionalLight(0xffb45a, 3.2); rimR.position.set(5, 2, -4);
    const rimL = new THREE.DirectionalLight(0xffc98a, 1.6); rimL.position.set(-5, 1, -3);
    this.scene.add(key, rimR, rimL, new THREE.AmbientLight(0x3a2414, 0.6));
    this.camera.position.set(0, 0.15, 12);
    this.camera.lookAt(0, 0, 0);

    const loader = new THREE.TextureLoader();
    for (const [k, c] of Object.entries(cups)) {
      const t = loader.load(import.meta.env.BASE_URL + "img/" + c.file);
      t.colorSpace = THREE.SRGBColorSpace;
      this.cupTex[k] = { tex: t, aspect: c.aspect };
    }

    // warm radial glow behind the stage (fades up on CTA hover)
    this.warm = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 24),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uA; varying vec2 vUv;
          void main(){ vec2 q = (vUv - vec2(0.5, 0.47)) * vec2(1.6, 1.0); float g = exp(-dot(q,q) * 9.0);
            gl_FragColor = vec4(vec3(0.23, 0.14, 0.078) * g * uA * 1.6, 1.0); }`,
      }),
    );
    this.warm.position.z = -8;
    this.scene.add(this.warm);

    // bags: the whole ring; each spins slowly inside its group (front, side, back, side)
    ring.forEach((id, idx) => {
      const product = byId(id);
      const { mesh, materials } = makeBag(product);
      const group = new THREE.Group();
      group.add(mesh);
      this.scene.add(group);
      this.bags.push({ product, idx, group, mesh, mats: materials });
    });
    for (let k = 0; k < 3; k++) { const cup = this.makeCup(k === 0 ? "cup_pair" : "cup_clay", k); this.cups.push(cup); this.scene.add(cup); }

    // orbit line: a tilted ellipse sweeping behind the bags, dimmer where it passes in front
    this.orbit = new THREE.Group();
    const path = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2, false, 0);
    const pts = path.getPoints(200).map((v) => new THREE.Vector3(v.x, 0, v.y));
    const curve = new THREE.CatmullRomCurve3(pts, true);
    for (const [r, c, s] of [[0.012, 0xffe0a8, 2.2], [0.05, 0xd48a2a, 0.55]] as const) {
      const m = glowMaterial(c, s, 1);
      m.uniforms.uFrontDim.value = 1;
      this.orbitMats.push(m);
      this.orbit.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 400, r, 10, true), m));
    }
    this.scene.add(this.orbit);

    // two rings around the centre bag (appear on CTA hover)
    this.rings = new THREE.Group();
    for (const y of [0.0, -0.78]) {
      for (const [r, c, s] of [[0.014, 0xffe6b5, 2.4], [0.06, 0xd98f30, 0.6]] as const) {
        const m = glowMaterial(c, s, 1);
        this.ringMats.push(m);
        const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 260, r, 10, true), m);
        ring.position.y = y;
        ring.userData.y = y;
        this.rings.add(ring);
      }
    }
    this.scene.add(this.rings);
  }

  /** k: position in the slide (0 left, 1 centre, 2 right) */
  private makeCup(key: string, slot: number) {
    const c = this.cupTex[key] ?? Object.values(this.cupTex)[0];
    const h = slot === 2 ? 0.62 : slot === 0 ? 0.5 : 0.44;
    // placed every frame in update(): left slot → pair on its right, centre → left foot, right → bottom-right
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(h * (c?.aspect ?? 1), h),
      new THREE.MeshBasicMaterial({ map: c?.tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    m.renderOrder = 2;
    return m;
  }

  resize(w: number, h: number) { this.aspect = w / h; this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix(); }

  private get vis() {
    const visH = 2 * this.camera.position.z * Math.tan((this.camera.fov / 2) * DEG);
    return { visH, visW: visH * this.aspect, narrow: this.aspect < 1 };
  }

  /** layout for a continuous slot value v (0 centre, ±1 sides, beyond = off stage) */
  private slotPose(v: number) {
    const { visH, visW, narrow } = this.vis;
    const hC = narrow ? Math.min(0.5 * visH, (0.62 * visW) / (BAG_W / BAG_H)) : Math.min(0.5 * visH, (0.17 * visW) / (BAG_W / BAG_H));
    const sx = narrow ? 0.62 * visW : 0.32 * visW;
    const side = narrow ? 0.6 : 0.78;
    const av = Math.abs(v), sg = Math.sign(v);
    const x = sg * (av <= 1 ? av * sx : sx + (av - 1) * sx * 1.3);
    const scale = (hC / BAG_H) * (av <= 1 ? lerp(1, side, av) : side * (1 - 0.12 * Math.min(1, av - 1)));
    const y = 0.03 * visH - Math.min(av, 1) * 0.04 * visH;
    const rotY = -sg * (av <= 1 ? av * 18 : 18 + (av - 1) * 52) * DEG;
    const opacity = 1 - smooth(seg(av, 1.3, 1.95));
    const dim = lerp(1, 0.72, Math.min(1, av));
    return { x, y, z: -av * 0.9, scale, rotY, opacity, dim, hC };
  }

  go(i: number) {
    this.target = i;
  }
  next() { this.go(Math.round(this.target) + 1); }
  prev() { this.go(Math.round(this.target) - 1); }
  /** ring index of the centre bag (where the carousel is heading) */
  get slide() { return wrap(Math.round(this.target)); }
  /** true from the click until the bags have arrived (labels fade out for the whole move) */
  get moving() { return Math.abs(this.target - this.current) > 0.01 || Math.abs(this.vel) > 0.02; }
  setHover(on: boolean) { this.hoverTarget = on ? 1 : 0; }

  /** The bag under a screen point: -1 left, 0 centre, 1 right, null nothing. */
  pick(ndcX: number, ndcY: number): number | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.bags.map((b) => b.mesh), false);
    if (!hits.length) return null;
    const b = this.bags.find((x) => x.mesh === hits[0].object)!;
    return Math.round(this.relSlot(b));
  }

  /** slot of a bag relative to the centre: 0 centre, ±1 sides, beyond = off stage (wrapped round the ring) */
  private relSlot(b: BagObj) {
    return ((((b.idx - this.current) + N / 2) % N) + N) % N - N / 2;
  }

  /** Screen position (px, y down) of a point on the bag in slot v. fy: -1 bottom .. 1 top of bag, fx: -1 left .. 1 right. */
  project(v: number, fx: number, fy: number, W: number, H: number) {
    const ps = this.slotPose(v);
    const p = new THREE.Vector3(ps.x + fx * (BAG_W / 2) * ps.scale, ps.y + fy * (BAG_H / 2) * ps.scale, ps.z).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
  }

  /** settle: 0..1 bags flying in from the depth (scroll), time for idle motion. */
  update(time: number, dt: number, settle: number) {
    // spring the carousel toward its target (critically damped)
    const k = 42, c = 2 * Math.sqrt(k);
    this.vel += (k * (this.target - this.current) - c * this.vel) * dt;
    this.current += this.vel * dt;
    if (Math.abs(this.target - this.current) < 0.0005 && Math.abs(this.vel) < 0.001) { this.current = this.target; this.vel = 0; }
    this.hover += (this.hoverTarget - this.hover) * (1 - Math.exp(-dt * 7));

    const centre = this.slotPose(0);
    const entrance = (v: number) => { const d = Math.min(1, Math.round(Math.abs(v))) * 0.22; return smooth(seg(settle, d, d + 0.62)); };
    for (const b of this.bags) {
      const v = this.relSlot(b);
      const ps = this.slotPose(v);
      // entrance from the depth: centre first, then the sides
      const e = Math.abs(v) < 1.5 ? entrance(v) : settle >= 1 ? 1 : 0;
      const bob = Math.sin(time * 0.9 + b.idx * 1.7) * 0.035;
      b.group.position.set(lerp(0, ps.x, e), lerp(ps.y + 0.3, ps.y, e) + bob * ps.hC / 3, lerp(-14, ps.z, e));
      b.group.scale.setScalar(ps.scale * lerp(0.5, 1, e));
      // slot angle + swing while the carousel moves (the "skewed turn" mid-transition) + entrance turn
      b.group.rotation.y = ps.rotY - this.vel * 0.22 + (1 - e) * (Math.sign(v) || 1) * -0.9;
      b.group.rotation.z = Math.sin(time * 0.7 + b.idx) * 0.012;
      // slow turntable spin in place: front, side, back, side (~26 s a turn; still with reduced motion)
      b.mesh.rotation.y = time * 0.24 + b.idx * 0.7;
      const op = ps.opacity * e;
      b.group.visible = op > 0.01;
      for (const m of b.mats) { m.opacity = op; m.color.setScalar(ps.dim); }
    }
    // cups stay at the three stage positions, tucked at the foot of each slot
    const offs = [[0.62, 0.5], [-0.66, 0.44], [0.66, 0.62]] as const;
    this.cups.forEach((cup, k) => {
      const v = k - 1, ps = this.slotPose(v), [ox, hgt] = offs[k], e = entrance(v);
      // fly in with that slot's bag (same path and scale as the bag's entrance)
      const sc = ps.scale * lerp(0.5, 1, e);
      cup.position.set(lerp(0, ps.x, e) + ox * sc, lerp(ps.y + 0.3, ps.y, e) + (-BAG_H / 2 + hgt * 0.42 - 0.04) * sc, lerp(-14, ps.z, e) + 0.75 * sc);
      cup.scale.set((k === 2 ? -1 : 1) * sc, sc, 1);
      (cup.material as THREE.MeshBasicMaterial).opacity = smooth(seg(e, 0.6, 1));
      cup.visible = e > 0.01;
    });

    // orbit: tilted ellipse around the stage, a little below the bags' middle
    const { visW, narrow } = this.vis;
    const o = smooth(seg(settle, 0.35, 0.9));
    this.orbit.position.set(0, centre.y - centre.hC * 0.08, -0.6);
    this.orbit.scale.set(narrow ? visW * 0.75 : visW * 0.36, 1, narrow ? 1.6 : 2.4);
    this.orbit.rotation.set(0.22, 0, -0.06);
    this.orbitMats.forEach((m) => { m.uniforms.uTime.value = time; m.uniforms.uStrength.value = (m === this.orbitMats[0] ? 2.2 : 0.55) * o; });

    // hover rings around the centre bag
    const h = smooth(this.hover);
    const rw = centre.hC * (BAG_W / BAG_H) * 0.95;
    this.rings.position.set(0, centre.y, 0.1);
    this.rings.children.forEach((r, i) => {
      const base = (r.userData.y as number) * centre.hC * 0.5;
      r.position.y = base;
      r.scale.set(rw * (0.8 + 0.2 * h) * (i >= 2 ? 1.12 : 1), 1, rw * 0.45 * (0.8 + 0.2 * h));
      r.rotation.set(0.12, time * 0.3 * (i >= 2 ? -1 : 1), 0);
    });
    this.ringMats.forEach((m, i) => { m.uniforms.uTime.value = time + i; m.uniforms.uStrength.value = (i % 2 ? 0.6 : 2.4) * h; });
    this.rings.visible = h > 0.01;
    (this.warm.material as THREE.ShaderMaterial).uniforms.uA.value = 0.35 * smooth(settle) + 0.65 * h;
  }

  /** current front trio: [left, centre, right] products (for labels) */
  get trio(): Product[] {
    return trioAt(this.slide);
  }
}
