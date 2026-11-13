import type { Stage } from "../gl/Stage";
import { ring, byId, wrap, type Product } from "../data/products";
import { getLang, onLang } from "../lib/i18n";

const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;

/** DOM layer of the bag stage: curved flavour labels, CTA, dots, chevrons, input. */
export class StageUI {
  private el = $<HTMLElement>("#stage");
  private dots = [...document.querySelectorAll<HTMLButtonElement>(".stage__dots button")];
  private cta = $<HTMLElement>("#stageCta");
  private live = $<HTMLElement>("#stageLive");
  private mobileLabel = $<HTMLElement>("#stageMobileLabel");
  private paths = ["#arcL1", "#arcL2", "#arcR1", "#arcR2"].map((s) => $<SVGPathElement>(s));
  private texts = ["#labL1", "#labL2", "#labR1", "#labR2"].map((s) => $<SVGTextPathElement>(s));
  private labels = [...document.querySelectorAll<SVGTextElement>(".arc-label")];
  private shownSlide = -1;
  private labelFade = 1;
  private settled = false;
  private touch = matchMedia("(pointer: coarse)").matches;

  constructor(private stage: Stage, onCta: () => void) {
    this.dots.forEach((d) => d.addEventListener("click", () => this.goTo(+d.dataset.slide!)));
    $("#stagePrev").addEventListener("click", () => stage.prev());
    $("#stageNext").addEventListener("click", () => stage.next());
    const ctaBtn = $<HTMLAnchorElement>("#ctaBtn");
    ctaBtn.addEventListener("click", (e) => { e.preventDefault(); onCta(); });
    for (const ev of ["pointerenter", "focus"]) ctaBtn.addEventListener(ev, () => stage.setHover(true));
    for (const ev of ["pointerleave", "blur"]) ctaBtn.addEventListener(ev, () => stage.setHover(false));

    window.addEventListener("keydown", (e) => {
      if (!this.settled || !this.inView()) return;
      if (e.key === "ArrowRight") { stage.next(); e.preventDefault(); }
      if (e.key === "ArrowLeft") { stage.prev(); e.preventDefault(); }
    });

    // drag / swipe, and click on a side bag
    let downX = 0, downY = 0, down = false;
    this.el.addEventListener("pointerdown", (e) => { down = true; downX = e.clientX; downY = e.clientY; });
    this.el.addEventListener("pointerup", (e) => {
      if (!down) return; down = false;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? stage.next() : stage.prev(); return; }
      if (Math.hypot(dx, dy) < 8 && !(e.target as Element).closest("button, a")) {
        const hit = stage.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        if (hit === -1) stage.prev();
        if (hit === 1) stage.next();
      }
    });
    this.el.addEventListener("pointermove", (e) => {
      if (!this.settled || this.touch) return;
      const hit = stage.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.el.style.cursor = hit === -1 || hit === 1 ? "pointer" : "";
    });
    onLang(() => { this.shownSlide = -1; });
  }

  private goTo(i: number) {
    const cur = Math.round(this.stage.current);
    let d = i - wrap(cur);
    if (d > ring.length / 2) d -= ring.length; if (d < -ring.length / 2) d += ring.length;   // shortest way round
    this.stage.go(cur + d);
  }

  private inView() {
    const r = this.el.getBoundingClientRect();
    return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5;
  }

  /** settle 0..1 from the scroll; called every frame */
  update(settle: number, W: number, H: number) {
    const vis = Math.min(1, Math.max(0, (settle - 0.55) / 0.4));
    this.el.style.opacity = String(vis);
    this.settled = settle > 0.92;
    this.el.classList.toggle("is-live", this.settled);
    if (this.touch && this.settled) this.stage.setHover(true); // no hover on touch: show the rings once settled

    const s = this.stage;
    const slide = s.slide;
    const moving = s.moving;
    // labels fade out while the bags move, swap text, fade back in
    this.labelFade += ((moving ? 0 : 1) - this.labelFade) * 0.18;
    if (!moving && slide !== this.shownSlide) this.setText(s.trio, slide);
    this.labels.forEach((l) => (l.style.opacity = String(this.labelFade)));

    // curved label paths follow the side bags
    // labels live in the gaps between the side bags and the centre bag
    const fs = Math.min(21, Math.max(14, W * 0.0128));
    const L = s.project(-1, 1, 0.55, W, H), R = s.project(1, -1, 0.5, W, H);
    const cL = s.project(0, -1, 0.5, W, H), cR = s.project(0, 1, 0.5, W, H);
    const drop = fs * 1.35;
    const l0 = L.x + 10, l1 = cL.x - 12, r0 = cR.x + 12, r1 = R.x - 10;
    const ls = Math.max(0, l1 - l0), rs = Math.max(0, r1 - r0);
    // left label rises to the right, right label falls to the right (they follow the orbit)
    this.arc(0, l0, L.y, l0 + ls, L.y - ls * 0.16);
    this.arc(1, l0, L.y + drop, l0 + ls, L.y - ls * 0.16 + drop);
    this.arc(2, r0, R.y - rs * 0.1, r0 + rs, R.y + rs * 0.08);
    this.arc(3, r0, R.y - rs * 0.1 + drop, r0 + rs, R.y + rs * 0.08 + drop);
    const labelPx = Math.min(fs, Math.max(12, Math.min(ls, rs) / 11));
    this.labels.forEach((l) => (l.style.fontSize = `${labelPx}px`));

    // CTA under the centre bag; mobile label above it
    const foot = s.project(0, 0, -1, W, H);
    const ctaY = Math.min(H - (W < 640 ? 150 : 70), foot.y + 18);
    this.cta.style.transform = `translate(-50%, ${ctaY}px)`;
    this.mobileLabel.style.transform = `translateY(${Math.min(H - 96, ctaY + 58)}px)`;
  }

  private arc(i: number, x0: number, y0: number, x1: number, y1: number) {
    const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.08;
    this.paths[i].setAttribute("d", `M${x0.toFixed(1)},${y0.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`);
  }

  private setText(trio: Product[], slide: number) {
    this.shownSlide = slide;
    const bn = getLang() === "bn";
    const name = (p: Product) => (bn ? p.bn : p.name);
    const notes = (p: Product) => (bn ? p.notesBn : p.notes);
    const [l, c, r] = trio;
    this.texts[0].textContent = `${name(l)} · ${notes(l)[0]} /`;
    this.texts[1].textContent = notes(l)[1];
    this.texts[2].textContent = `${name(r)} · ${notes(r)[0]} /`;
    this.texts[3].textContent = notes(r)[1];
    this.labels.forEach((t) => t.setAttribute("lang", bn ? "bn" : "en"));
    this.mobileLabel.innerHTML = `${name(c)}<small>${notes(c).join(" · ")}</small>`;
    this.live.textContent = `${c.name}: ${c.notes.join(", ")}. ${c.roast}.`;
    this.dots.forEach((d, i) => { d.setAttribute("aria-selected", String(i === slide)); d.setAttribute("aria-label", name(byId(ring[i]))); });
  }
}
