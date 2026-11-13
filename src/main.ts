// Page shell: fonts, nav, language, smooth scroll, the sections below the stage.
// Then either the full WebGL experience (lazy-loaded) or lite mode (static hero + static bag stage).
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/tiro-bangla/400.css";
import "@fontsource/hind-siliguri/400.css";
import "@fontsource/hind-siliguri/600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";
import "./styles/lite.css";

import gsap from "gsap";
import Lenis from "lenis";
import { Shop } from "./components/Shop";
import { Menu } from "./components/Menu";
import { LiteStage } from "./components/LiteStage";
import { site } from "./config/site";
import { logoSVG } from "./lib/logo";
import { setLang, type Lang } from "./lib/i18n";

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Mode ----------
// Lite mode skips the journey: no WebGL, reduced motion, data saver or a 2G connection.
// ?lite forces it, ?full forces the WebGL experience, ?nogl simulates a browser without WebGL.
const probeGL = (opts?: WebGLContextAttributes) => {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2", opts) || c.getContext("webgl", opts)) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // free the probe context right away
    return !!gl;
  } catch { return false; }
};
const glOK = !params.has("nogl") && probeGL();
// software rendering (GPU blocklisted, SwiftShader, llvmpipe) can't run the journey smoothly
const glFast = glOK && !params.has("slowgpu") && probeGL({ failIfMajorPerformanceCaveat: true });
const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const lowData = !!conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "");
const liteReason = !glOK ? "nogl" : params.has("lite") ? "forced" : params.has("full") ? null
  : !glFast ? "gpu" : reduced ? "motion" : lowData ? "data" : null;
const lite = liteReason !== null;
document.documentElement.classList.toggle("lite", lite);

// ---------- DOM ----------
$("navMark").innerHTML = logoSVG(34);
$("footMark").innerHTML = logoSVG(44);
$("spec").textContent = site.spec;
const nav = $("nav"), hint = $("scrollHint"), loader = $("loader");
const lines = $("heroCopy").querySelectorAll<HTMLElement>(".line");

document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((b) =>
  b.addEventListener("click", () => {
    const l = b.dataset.langBtn as Lang;
    setLang(l);
    document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.langBtn === l)));
  }),
);
setLang("en");

// ---------- Smooth scroll ----------
gsap.ticker.lagSmoothing(0);
const lenis = new Lenis({ autoRaf: false, lerp: 0.1, wheelMultiplier: 0.9, anchors: { duration: 1.4 } });
gsap.ticker.add((time) => lenis.raf(time * 1000));
lenis.stop();
const scrollTo = (target: string) => lenis.scrollTo(target, { duration: 1.4 });
const shop = new Shop(scrollTo);
new Menu(lenis);

// navbar gets a backdrop once the page content scrolls under it
const range = $("range");
let navSolid = false;
const updateNav = () => {
  const solid = range.getBoundingClientRect().top < innerHeight * 0.25;
  if (solid !== navSolid) { navSolid = solid; nav.classList.toggle("is-solid", solid); }
};
lenis.on("scroll", updateNav);
updateNav();

// nothing to animate while the tab is hidden
document.addEventListener("visibilitychange", () => (document.hidden ? gsap.ticker.sleep() : gsap.ticker.wake()));

// ---------- Intro end (shared) ----------
let introDone = false;
function finishIntro() {
  if (introDone) return;
  introDone = true;
  loader.classList.add("is-done");
  nav.classList.add("is-in");
  if (reduced) gsap.set(lines, { opacity: 1, y: 0 });
  else gsap.to(lines, { opacity: 1, y: 0, duration: 1, ease: "expo.out", stagger: 0.1 });
  hint.classList.add("is-in");
  lenis.start();
  setTimeout(() => shop.warmImages(), 2500);
}

// ---------- Debug hooks (used by screenshot tests) ----------
const dbg = { ready: false, forceP: null as number | null, p: 0, lite };
(window as unknown as { __chumuk: typeof dbg }).__chumuk = dbg;
if (params.has("p")) dbg.forceP = Number(params.get("p"));

if (lite) {
  new LiteStage(scrollTo, liteReason === "nogl" ? null : liteReason);
  finishIntro();
  dbg.ready = true;
} else {
  import("./experience").then(({ start }) => start({ lenis, finishIntro, dbg, skip: params.has("skip") }));
}
