import * as THREE from "three";
import { PLATES, type PlateDef } from "./plateDefs";
import { plateFrag, plateVert } from "./plateShader";

export type Cam = { x: number; y: number; z: number; twist: number };
export type PlateState = {
  a: string; b: string; camA: Cam; camB: Cam; mix: number; blur: number;
  wordAlpha: number; wordScale: number; fade: number; flow: number;
  reveal: { x: number; y: number; r: number } | null;
  roll?: number; speed?: number; warp?: number;
  wipe?: number;                                   // >= 0: water-line hand-over position
  hole?: { x: number; y: number; r: number } | null; // portal
};

const packFlows = (def: PlateDef) => {
  const F = Array.from({ length: 4 }, () => new THREE.Vector4());
  const S = Array.from({ length: 4 }, () => new THREE.Vector4());
  def.flows.slice(0, 4).forEach((f, i) => {
    F[i].set(f.type, f.c[0], f.c[1], f.k);
    S[i].set(f.size[0], f.size[1], 0, 0);
  });
  return { F, S };
};

export class Plates {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.ShaderMaterial;
  private textures = new Map<string, THREE.Texture>();
  private flows = new Map<string, ReturnType<typeof packFlows>>();
  private word: THREE.CanvasTexture;
  private wordCanvas = document.createElement("canvas");

  /** Plates the loader waits for at full size; the rest start as 64 px placeholders (see loadLate). */
  static readonly EAGER = ["K1", "K2"];
  private maxAniso: number;

  constructor(manager: THREE.LoadingManager, maxAniso: number) {
    this.maxAniso = maxAniso;
    const loader = new THREE.TextureLoader(manager);
    for (const def of Object.values(PLATES)) {
      const eager = Plates.EAGER.includes(def.id);
      this.textures.set(def.id, this.setup(loader.load(eager ? def.url : def.url.replace(".webp", "_tiny.webp"))));
      this.flows.set(def.id, packFlows(def));
    }
    this.word = new THREE.CanvasTexture(this.wordCanvas);
    const f = this.flows.get("K1")!;
    this.material = new THREE.ShaderMaterial({
      vertexShader: plateVert,
      fragmentShader: plateFrag,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTexA: { value: this.textures.get("K1") }, uTexB: { value: this.textures.get("K2") },
        uWord: { value: this.word },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 }, uImgAspect: { value: 1672 / 941 },
        uCamA: { value: new THREE.Vector4(0.5, 0.5, 1, 0) }, uCamB: { value: new THREE.Vector4(0.5, 0.5, 1, 0) },
        uFocA: { value: new THREE.Vector2(0.5, 0.5) }, uFocB: { value: new THREE.Vector2(0.5, 0.5) },
        uRoll: { value: 0 }, uSpeed: { value: 1 }, uWarp: { value: 0 },
        uWipe: { value: -1 }, uHole: { value: new THREE.Vector3(0, 0, -1) },
        uFlA: { value: f.F }, uFsA: { value: f.S }, uFlB: { value: f.F }, uFsB: { value: f.S },
        uMix: { value: 0 }, uBlur: { value: 0 }, uFlowAmt: { value: 1 }, uFade: { value: 0 }, uGrain: { value: 0.03 },
        uReveal: { value: new THREE.Vector3(0, 0, 1e6) }, uRevealSoft: { value: 3 },
        uWordAlpha: { value: 0 }, uWordScale: { value: 1 }, uWordY: { value: 0.4 }, uWordAspect: { value: 4 },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  /** Renders the outline word to a canvas texture (call after fonts load / on language change). */
  drawWord(text: string, font = '700 300px "DM Sans", sans-serif') {
    const c = this.wordCanvas, g = c.getContext("2d")!;
    g.font = font;
    const m = g.measureText(text);
    const w = Math.ceil(m.width + 40), h = 360;
    c.width = 2048; c.height = Math.round((2048 * h) / w);
    const k = c.width / w;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = font;
    g.textBaseline = "middle";
    g.lineWidth = 2.2 / k * 1.6;
    g.strokeStyle = "#fff";
    g.lineJoin = "round";
    g.strokeText(text, 20, h / 2);
    // canvas size changed: a fresh texture avoids writing into the old (smaller) GPU allocation
    this.word.dispose();
    this.word = new THREE.CanvasTexture(c);
    this.word.colorSpace = THREE.NoColorSpace;
    this.material.uniforms.uWord.value = this.word;
    this.material.uniforms.uWordAspect.value = c.width / c.height;
  }

  resize(w: number, h: number) { this.material.uniforms.uRes.value.set(w, h); }

  private setup(t: THREE.Texture) {
    t.colorSpace = THREE.NoColorSpace; // composite in display space, pass straight through
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = this.maxAniso;
    return t;
  }

  /** Upload every scene image to the GPU up front so none hitches the first time it appears. */
  prewarm(renderer: THREE.WebGLRenderer) { this.textures.forEach((t) => renderer.initTexture(t)); }

  /**
   * After the intro: load K3–K6 at full size in the background and swap each in (uploaded right away,
   * while the visitor is still at the hero). Until then the journey shows the blurred 64 px placeholder.
   */
  loadLate(renderer: THREE.WebGLRenderer) {
    const loader = new THREE.TextureLoader();
    for (const def of Object.values(PLATES)) {
      if (Plates.EAGER.includes(def.id)) continue;
      loader.load(def.url, (t) => {
        renderer.initTexture(this.setup(t));
        const old = this.textures.get(def.id);
        this.textures.set(def.id, t);
        old?.dispose();
      });
    }
  }

  update(st: PlateState, time: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uTexA.value = this.textures.get(st.a);
    u.uTexB.value = this.textures.get(st.b);
    const fa = this.flows.get(st.a)!, fb = this.flows.get(st.b)!;
    u.uFlA.value = fa.F; u.uFsA.value = fa.S; u.uFlB.value = fb.F; u.uFsB.value = fb.S;
    u.uCamA.value.set(st.camA.x, st.camA.y, st.camA.z, st.camA.twist);
    u.uCamB.value.set(st.camB.x, st.camB.y, st.camB.z, st.camB.twist);
    u.uFocA.value.set(...PLATES[st.a].focus); u.uFocB.value.set(...PLATES[st.b].focus);
    u.uRoll.value = st.roll ?? 0; u.uSpeed.value = st.speed ?? 1; u.uWarp.value = st.warp ?? 0;
    u.uWipe.value = st.wipe ?? -1;
    if (st.hole) u.uHole.value.set(st.hole.x, st.hole.y, st.hole.r); else u.uHole.value.set(0, 0, -1);
    u.uMix.value = st.mix;
    u.uBlur.value = st.blur;
    u.uFlowAmt.value = st.flow;
    u.uFade.value = st.fade;
    u.uWordAlpha.value = st.wordAlpha;
    u.uWordScale.value = st.wordScale;
    if (st.reveal) u.uReveal.value.set(st.reveal.x, st.reveal.y, st.reveal.r);
    else u.uReveal.value.set(0, 0, 1e6);
  }
}
