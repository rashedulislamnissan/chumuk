// Lite mode bag stage: the same three-bag carousel as the WebGL stage, built from the rendered bag images.
// Used without WebGL, with reduced motion, data saver or a 2G connection. Reuses the stage's dots, chevrons and CTA.
import { byId, ring, wrap, trioAt, type Product } from "../data/products";
import { t, getLang, onLang } from "../lib/i18n";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class LiteStage {
  private el = $("liteStage");
  private stage = $("stage");
  private dots = [...document.querySelectorAll<HTMLButtonElement>(".stage__dots button")];
  private slide = 0;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @param reason why lite mode is on; with a reason (not "no WebGL") we offer the full experience */
  constructor(private scrollTo: (target: string) => void, private reason: "gpu" | "motion" | "data" | "forced" | null) {
    this.el.hidden = false;
    this.stage.style.opacity = "1";
    this.render();

    this.dots.forEach((d) => d.addEventListener("click", () => this.go(+d.dataset.slide!)));
    $("stagePrev").addEventListener("click", () => this.go(this.slide - 1));
    $("stageNext").addEventListener("click", () => this.go(this.slide + 1));
    $("ctaBtn").addEventListener("click", (e) => { e.preventDefault(); this.scrollTo("#range"); });
    this.el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-dir]");
      if (b) this.go(this.slide + +b.dataset.dir!);
    });
    window.addEventListener("keydown", (e) => {
      const r = this.stage.getBoundingClientRect();
      if (r.top > innerHeight * 0.5 || r.bottom < innerHeight * 0.5) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") { this.go(this.slide + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { this.go(this.slide - 1); e.preventDefault(); }
    });
    let x0 = 0, y0 = 0;
    this.stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; });
    this.stage.addEventListener("pointerup", (e) => {
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.go(this.slide + (dx < 0 ? 1 : -1));
    });
    onLang(() => this.render());
  }

  private go(i: number) {
    const next = wrap(i);
    if (next === this.slide) return;
    this.slide = next;
    if (this.reduced) { this.render(); return; }
    this.el.classList.add("is-swap");
    setTimeout(() => { this.render(); this.el.classList.remove("is-swap"); }, 180);
  }

  private render() {
    const bn = getLang() === "bn";
    const name = (p: Product) => (bn ? p.bn : p.name);
    const notes = (p: Product) => (bn ? p.notesBn : p.notes).join(" · ");
    const [l, c, r] = trioAt(this.slide);
    const img = (p: Product, cls: string) => `<img class="${cls}" src="/img/bags/${p.id}.webp" alt="" width="480" height="645" decoding="async" />`;
    this.el.innerHTML = `
      <div class="lite-stage__row">
        <button class="lite-bag lite-bag--side" data-dir="-1" aria-label="${esc(t("stage.prev"))}: ${esc(name(l))}">${img(l, "lite-bag__img")}<span class="lite-bag__cap">${esc(name(l))}</span></button>
        <figure class="lite-bag lite-bag--center">
          ${img(c, "lite-bag__img")}
          <img class="lite-bag__cup" src="/img/cups/cup_clay.webp" alt="" decoding="async" />
        </figure>
        <button class="lite-bag lite-bag--side" data-dir="1" aria-label="${esc(t("stage.next"))}: ${esc(name(r))}">${img(r, "lite-bag__img")}<span class="lite-bag__cap">${esc(name(r))}</span></button>
      </div>
      <p class="lite-stage__label"><b>${esc(name(c))}</b><span>${esc(notes(c))}</span></p>
      ${this.reason ? `<p class="lite-stage__note">${esc(t(`lite.${this.reason}`))} <a href="${location.pathname}?full">${esc(t("lite.full"))}</a></p>` : ""}`;
    $("stageLive").textContent = `${c.name}: ${c.notes.join(", ")}. ${c.roast}.`;
    this.dots.forEach((d, i) => { d.setAttribute("aria-selected", String(i === this.slide)); d.setAttribute("aria-label", name(byId(ring[i]))); });
  }
}
