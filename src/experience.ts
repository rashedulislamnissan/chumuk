// The WebGL experience: loader spiral → ring burst → scroll journey → bag stage.
// Loaded with a dynamic import from main.ts, so lite mode (no WebGL / reduced motion / data saver)
// never downloads three.js.
import * as THREE from "three";
import gsap from "gsap";
import type Lenis from "lenis";
import { Plates } from "./gl/Plates";
import { Ring } from "./gl/Ring";
import { Beans } from "./gl/Beans";
import { Ribbons } from "./gl/Ribbons";
import { Stage } from "./gl/Stage";
import { StageUI } from "./components/StageUI";
import { journey } from "./journey/timeline";
import { site } from "./config/site";
import beanMeta from "../public/img/beans/beans.json";
import cupMeta from "../public/img/cups/cups.json";

export type ExperienceCtx = {
  lenis: Lenis;
  finishIntro: () => void;
  dbg: { ready: boolean; forceP: number | null; p: number };
  skip: boolean;
};

export function start({ lenis, finishIntro, dbg, skip }: ExperienceCtx) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; // only reaches here with ?full
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const heroCopy = $("heroCopy"), hint = $("scrollHint"), disc = $("loaderDisc");
  let introDone = false;
  const done = () => { if (!introDone) { introDone = true; finishIntro(); } };

  // ---------- Renderer ----------
  const canvas = $<HTMLCanvasElement>("gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  let loadProgress = 0, loaded = false;
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, n, total) => (loadProgress = n / total);
  const fontsReady = document.fonts.ready.then(() =>
    Promise.all([
      ...['700 300px "DM Sans"', '600 40px "DM Sans"', '800 80px "Fraunces"', '700 80px "Fraunces"'].map((f) => document.fonts.load(f)),
      // Bangla glyphs live in a separate subset file: ask for Bangla text so that subset is fetched
      document.fonts.load('400 70px "Tiro Bangla"', 'চুমুক নলেন গুড়'),
      document.fonts.load('400 20px "Hind Siliguri"', 'চুমুক'),
    ]),
  );
  // shader programs compile in parallel (KHR_parallel_shader_compile); the loader waits for all of them
  const warm: Promise<unknown>[] = [];
  manager.onLoad = () => fontsReady.then(async () => {
    plates.prewarm(renderer);
    warm.push(prewarm(beans.scene, beans.camera));
    await Promise.all(warm);
    loaded = true;
    plates.loadLate(renderer);
  });

  const plates = new Plates(manager, renderer.capabilities.getMaxAnisotropy());
  const ring = new Ring(renderer);
  const beans = new Beans(manager, beanMeta, window.innerWidth / window.innerHeight);
  // things drawn with web fonts (outline word, ribbons, bag labels) are built once fonts are in
  let ribbons: Ribbons | null = null, stage: Stage | null = null, stageUI: StageUI | null = null;
  const stageBeans = new Beans(manager, beanMeta, window.innerWidth / window.innerHeight, 9);
  fontsReady.then(() => {
    plates.drawWord(site.outlineWord);
    ribbons = new Ribbons(site.ribbons, window.innerWidth / window.innerHeight);
    stage = new Stage(renderer, cupMeta);
    stage.resize(W, H);
    stageUI = new StageUI(stage, () => lenis.scrollTo("#range", { duration: 1.4 }));
    // compile shaders and upload textures now (behind the loader), not when the portal first opens
    warm.push(prewarm(stage.scene, stage.camera), prewarm(ribbons.scene, beans.camera));
  });

  function prewarm(scene: THREE.Scene, camera: THREE.Camera): Promise<unknown> {
    const vis: [THREE.Object3D, boolean][] = [];
    scene.traverse((o) => {
      vis.push([o, o.visible]); o.visible = true;
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) renderer.initTexture(v);
        for (const u of Object.values((m as THREE.ShaderMaterial).uniforms ?? {})) if (u.value instanceof THREE.Texture) renderer.initTexture(u.value);
      }
    });
    // compileAsync collects the programs synchronously, so visibility can be restored right after the call
    const done = renderer.compileAsync(scene, camera);
    vis.forEach(([o, v]) => (o.visible = v));
    return done;
  }

  // Resolution: the scene images are ~1700 px wide, so rendering much above that adds GPU cost
  // without detail. Start at a sensible cap and step down if frames run slow.
  const touch = matchMedia("(pointer: coarse)").matches;
  let prCap = touch ? 1.75 : 1.5;
  let W = 0, H = 0, journeyTop = 0, journeyLen = 1;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, prCap));
    renderer.setSize(W, H, false);
    plates.resize(W, H); ring.resize(W, H); beans.resize(W, H); stageBeans.resize(W, H); stage?.resize(W, H);
    const j = document.getElementById("journey")!;
    journeyTop = j.offsetTop; journeyLen = Math.max(1, j.offsetHeight - H);
  }
  resize();
  window.addEventListener("resize", resize);

  let slowFrames = 0;
  function adaptQuality(dtMs: number) {
    slowFrames = dtMs > 21 ? slowFrames + 1 : Math.max(0, slowFrames - 0.5);
    if (slowFrames > 40 && prCap > 0.8) { prCap = Math.max(0.8, prCap - 0.2); slowFrames = 0; resize(); }
  }

  // ---------- Scroll ----------
  // Lenis smooths the wheel; the journey reads the scroll position directly with one light,
  // frame-rate independent damping (no second scrub layer, so it never feels mushy).
  const prog = { p: 0 };
  const rawProgress = () => Math.min(1, Math.max(0, (window.scrollY - journeyTop) / journeyLen));

  // ---------- Intro: loader → burst ----------
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeIn3 = (t: number) => t * t * t;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const t0 = performance.now() / 1000;
  let drawn = 0;                                    // loader spiral progress shown
  let burstAt = skip || reduced ? -100 : -1;        // time the burst started (-1 = not yet)

  type Intro = {
    ringScale: number; ringThick: number; ringRot: number; ringVisible: boolean; draw: number;
    plateFade: number; plateZoom: number; reveal: number | null; beans: number;
  };

  function intro(now: number): Intro {
    const k = Math.min(W, H) / 1080;
    if (burstAt === -1) {
      // loader: the spiral draws with real loading progress, but never faster than 1.4 s
      const target = Math.min(loadProgress, (now - t0) / 1.4);
      drawn += (target - drawn) * 0.12;
      if (loaded && drawn > 0.995 && now - t0 > 1.4) { burstAt = now; ring.splash(now + 0.45, 1.25); }
      return { ringScale: 1, ringThick: 1, ringRot: 0, ringVisible: true, draw: drawn, plateFade: 0, plateZoom: 1.25, reveal: 0, beans: 0 };
    }
    const bt = now - burstAt;
    if (bt > 1.6) return { ringScale: 1, ringThick: 1, ringRot: 0, ringVisible: false, draw: 1, plateFade: 1, plateZoom: 1, reveal: null, beans: 1 };

    // swell, then fly outward past the screen edges
    const s1 = easeOut(seg(bt, 0, 0.42)), s2 = easeIn3(seg(bt, 0.42, 1.42));
    const scale = lerp(1, 1.25, s1) * lerp(1, 9, s2);
    const thick = lerp(1, 2.2, s1) + 0.6 * s2;
    const inner = Math.max(0, 145 - 20 * thick) * k * scale * 0.96;
    const reveal = bt > 1.42 ? null : lerp(60 * k, inner, easeOut(seg(bt, 0.02, 0.42)));
    disc.style.opacity = String(1 - seg(bt, 0.04, 0.3));
    disc.style.transform = `scale(${lerp(1, 0.72, seg(bt, 0, 0.3))})`;
    if (bt > 0.95) done();
    return {
      ringScale: scale, ringThick: thick, ringRot: lerp(0, 0.35, s1) + 0.9 * s2, ringVisible: bt < 1.45, draw: 1,
      plateFade: seg(bt, 0.03, 0.3), plateZoom: lerp(1.22, 1, easeOut(seg(bt, 0, 1.5))), reveal, beans: seg(bt, 0.6, 1.3),
    };
  }

  if (skip) disc.style.opacity = "0";

  // ---------- Frame ----------
  let lastNow = performance.now() / 1000, lastDepth = 0, vDepth = 0, stream = 0, sink = 0, lastPin = -1;
  const stageEl = $("stage");
  gsap.ticker.add(() => {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0.001, now - lastNow));
    lastNow = now;
    adaptQuality(dt * 1000);
    const anim = reduced ? 0 : now;

    let it = intro(now);
    if ((skip || reduced) && loaded) { it = intro(burstAt + 10); done(); }
    if ((skip || reduced) && !loaded) it = { ...it, ringVisible: false };
    dbg.ready = introDone && loaded;

    // one light damping layer on top of Lenis (touch scroll is native, so it gets a bit more)
    prog.p += (rawProgress() - prog.p) * (1 - Math.exp(-dt * (touch ? 9 : 16)));
    const p = dbg.forceP ?? prog.p;
    dbg.p = p;
    const js = journey(p, W / H);

    // camera speed (log-zoom units / s), smoothed: drives motion blur, liquid speed, bean rush
    const rawV = (js.depth - lastDepth) / dt;
    lastDepth = js.depth;
    vDepth += (rawV - vDepth) * (1 - Math.exp(-dt * 8));
    const speed = Math.min(1, Math.abs(vDepth) / 1.2);

    // the camera is never frozen: slow handheld sway, roll and breathing zoom
    const m = reduced ? 0 : 1;
    const sx = m * (Math.sin(now * 0.29) * 0.006 + Math.sin(now * 0.71) * 0.002);
    const sy = m * (Math.cos(now * 0.31) * 0.005 + Math.sin(now * 0.53) * 0.002);
    const breathe = 1 + m * 0.012 * Math.sin(now * 0.45);
    for (const c of [js.plate.camA, js.plate.camB]) { c.x += sx; c.y += sy; c.z *= breathe; }
    js.plate.roll = (js.plate.roll ?? 0) + m * (Math.sin(now * 0.23) * 0.006 + Math.sin(now * 0.41) * 0.003);
    js.plate.speed = 1 + 1.6 * speed;
    js.plate.blur = reduced ? 0 : 0.075 * speed * speed;
    js.plate.warp = Math.sin(Math.PI * js.plate.mix) * (0.6 + 0.8 * speed);
    stream += dt * (reduced ? 0 : 0.7);
    sink += dt * js.fall * (reduced ? 0 : 0.55 + speed);

    // intro overrides on top of the journey's first frame
    js.plate.fade *= it.plateFade;
    js.plate.camA.z *= it.plateZoom;
    js.plate.flow = reduced ? 0 : 1;
    js.plate.reveal = it.reveal === null ? null : { x: W / 2, y: H / 2, r: it.reveal };

    // portal: a hole opens in the liquid around the centre bag
    const diag = Math.hypot(W, H);
    if (js.portal > 0) js.plate.hole = { x: W * 0.5, y: H * 0.55, r: js.portal * js.portal * diag * 0.62 };
    const platesOn = js.portal < 1;

    // after the journey the stage scrolls away with the page: move the fixed canvas with it
    const over = Math.max(0, window.scrollY - (journeyTop + journeyLen));
    canvas.style.transform = over > 0 ? `translate3d(0, ${-over}px, 0)` : "";
    // until then the stage's HTML (labels, CTA, dots) is pinned to the screen like the canvas,
    // so it holds still while the bags fly in instead of scrolling up into place
    const pin = Math.round(Math.max(0, journeyTop + journeyLen - window.scrollY));
    if (pin !== lastPin) { lastPin = pin; stageEl.style.transform = pin > 0 ? `translate3d(0, ${-pin}px, 0)` : ""; }

    plates.update(js.plate, anim);
    beans.update(anim, js.beanOpacity * it.beans, js.travel, stream, sink);
    ribbons?.update(anim, js.ribbons.alpha, js.ribbons.travel, stream);
    if (stage) { stage.update(anim, dt, js.settle); stageUI!.update(js.settle, W, H); }
    stageBeans.update(anim * 0.6, Math.min(1, js.settle * 1.5) * 0.85, 0, stream * 0.25);
    ring.setTransform(it.ringScale, it.ringThick, it.ringRot, it.ringVisible);
    ring.setDraw(it.draw);
    ring.update(now);

    heroCopy.style.opacity = String(js.heroCopy.opacity);
    heroCopy.style.translate = `${js.heroCopy.x}px 0`;
    if (introDone) hint.style.opacity = String(js.hint);

    if (over > H + 4) return; // stage fully scrolled away: nothing to draw
    renderer.clear();
    if (stage && js.portal > 0) {
      renderer.render(stage.scene, stage.camera);
      renderer.clearDepth();
      renderer.render(stageBeans.scene, stageBeans.camera);
    }
    if (platesOn) renderer.render(plates.scene, plates.camera);
    renderer.clearDepth();
    if (platesOn) {
      renderer.render(beans.scene, beans.camera);
      if (ribbons) renderer.render(ribbons.scene, beans.camera);
    }
    if (it.ringVisible) renderer.render(ring.scene, ring.camera);
  });
}
