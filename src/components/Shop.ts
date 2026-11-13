// Sections below the stage: range grid, cart, order form, subscribe, brew cards, demo notice.
// This is a portfolio demo: every buy action ends in the demo dialog; nothing is sent or charged.
import { products, byId, SIZES, DELIVERY, SUB_DISCOUNT, type Product } from "../data/products";
import { brews } from "../data/brew";
import { t, getLang, onLang } from "../lib/i18n";

type Line = { id: string; size: number; qty: number };
type DemoKind = "add" | "order" | "sub" | "social";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const bn = () => getLang() === "bn";
const num = (n: number) => n.toLocaleString(bn() ? "bn-BD" : "en-IN");
export const taka = (n: number) => "৳" + num(n);
/** The Latin fonts have no ৳ glyph; render it in the Bangla font so it isn't a tiny fallback. */
const tk = (n: number) => `<span class="tk">৳</span>${num(n)}`;
const grams = (g: number) => (bn() ? `${num(g)} গ্রাম` : `${g} g`);
const sizeIdx = (g: number) => SIZES.indexOf(g as (typeof SIZES)[number]);
const priceOf = (p: Product, g: number) => p.price[sizeIdx(g)];

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export class Shop {
  private cart: Line[] = store.get<Line[]>("chumuk.cart", []).filter((l) => byId(l.id) && sizeIdx(l.size) >= 0);
  private picked: Record<string, number> = {}; // chosen size per card
  private filter = "all";
  private query = "";
  private demoShown = false;
  private toastTimer = 0;

  constructor(private scrollTo: (target: string) => void) {
    this.renderGrid();
    this.renderBrew();
    this.initSub();
    this.renderCart();
    this.wire();
    this.reveal();
    this.scrollSpy();
    onLang(() => { this.renderGrid(); this.renderBrew(); this.renderSub(); this.renderCart(); });
  }

  // ---------- Range ----------
  private renderGrid() {
    const grid = $("rangeGrid");
    grid.innerHTML = products.map((p) => {
      const g = this.picked[p.id] ?? 250;
      const notes = bn() ? p.notesBn : p.notes;
      const edition = bn() ? p.editionBn : p.edition;
      return `<li class="card" style="--band:${p.band}" data-id="${p.id}" ${this.matches(p) ? "" : "hidden"}>
        <div class="card__media"><img src="/img/bags/${p.id}.webp" alt="${esc(p.name)} coffee bag" width="480" height="645" loading="lazy" decoding="async" /></div>
        <div class="card__body">
          <div class="card__top">
            <h3><span class="card__name">${esc(bn() ? p.bn : p.name)}</span><span class="card__alt" ${bn() ? "" : 'lang="bn"'}>${esc(bn() ? p.name : p.bn)}</span></h3>
            ${edition ? `<span class="badge">${esc(edition)}</span>` : ""}
          </div>
          <p class="card__roast"><span class="dots" role="img" aria-label="${t("range.roast")} ${p.dots}/5">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < p.dots ? "on" : ""}"></i>`).join("")}</span>${esc(bn() ? p.roastBn : p.roast)}</p>
          <p class="card__notes">${esc(notes.join(" · "))}</p>
          <div class="card__buy">
            <fieldset class="sizes"><legend class="sr-only">${t("range.size")}</legend>
              ${SIZES.map((s) => `<label><input type="radio" name="size-${p.id}" value="${s}" ${s === g ? "checked" : ""} /><span>${grams(s)}</span></label>`).join("")}
            </fieldset>
            <div class="card__row">
              <span class="price" data-price>${tk(priceOf(p, g))}</span>
              <button class="btn btn--add" data-add="${p.id}" aria-label="${t("range.add")} ${esc(p.name)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${t("range.add")}
              </button>
            </div>
          </div>
        </div>
      </li>`;
    }).join("");
    this.updateNone();
  }

  /** chip filter + search text (EN and BN names, notes, roast) */
  private matches(p: Product) {
    if (this.filter !== "all" && (this.filter === "core") !== !!p.core) return false;
    const q = this.query.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.bn, p.roast, p.roastBn, ...p.notes, ...p.notesBn, p.edition ?? "", p.editionBn ?? ""].join(" ").toLowerCase().includes(q);
  }
  private applyFilter() {
    $("rangeGrid").querySelectorAll<HTMLElement>(".card").forEach((c) => (c.hidden = !this.matches(byId(c.dataset.id!))));
    this.updateNone();
  }
  private updateNone() {
    $("rangeNone").hidden = !!$("rangeGrid").querySelector(".card:not([hidden])");
  }

  private add(id: string) {
    const size = this.picked[id] ?? 250;
    const line = this.cart.find((l) => l.id === id && l.size === size);
    if (line) line.qty = Math.min(20, line.qty + 1); else this.cart.push({ id, size, qty: 1 });
    this.saveCart();
    this.renderCart();
    const btn = document.getElementById("cartBtn");
    btn?.classList.remove("bump"); void btn?.offsetWidth; btn?.classList.add("bump");
    if (!this.demoShown) { this.demoShown = true; this.demo("add"); }
    else this.toast(`${bn() ? byId(id).bn : byId(id).name} · ${grams(size)} ${t("range.added")}`);
  }

  // ---------- Cart + order ----------
  private saveCart() { store.set("chumuk.cart", this.cart); }
  private area() { return (document.querySelector<HTMLInputElement>('#orderForm input[name="area"]:checked')?.value ?? "dhaka") as keyof typeof DELIVERY; }
  private totals() {
    const sub = this.cart.reduce((s, l) => s + priceOf(byId(l.id), l.size) * l.qty, 0);
    const del = this.cart.length ? DELIVERY[this.area()] : 0;
    return { sub, del, total: sub + del };
  }

  private renderCart() {
    const list = $("cartList");
    list.innerHTML = this.cart.map((l, i) => {
      const p = byId(l.id);
      return `<li class="cart-line" style="--band:${p.band}">
        <img src="/img/bags/${p.id}.webp" alt="" width="48" height="64" loading="lazy" />
        <div class="cart-line__txt"><b>${esc(bn() ? p.bn : p.name)}</b><small>${grams(l.size)} · ${tk(priceOf(p, l.size))}</small></div>
        <div class="qty">
          <button type="button" data-qty="${i}" data-d="-1" aria-label="${t("order.less")}">−</button>
          <span aria-live="polite">${num(l.qty)}</span>
          <button type="button" data-qty="${i}" data-d="1" aria-label="${t("order.more")}">+</button>
        </div>
        <span class="cart-line__sum">${tk(priceOf(p, l.size) * l.qty)}</span>
        <button type="button" class="cart-line__x" data-rm="${i}" aria-label="${t("order.remove")} ${esc(p.name)}">×</button>
      </li>`;
    }).join("");
    const empty = !this.cart.length;
    $("cartEmpty").hidden = !empty;
    $("cartSum").hidden = empty;
    const { sub, del, total } = this.totals();
    $("sumSub").innerHTML = tk(sub);
    $("sumDel").innerHTML = tk(del);
    $("sumTotal").innerHTML = tk(total);
    const n = this.cart.reduce((s, l) => s + l.qty, 0);
    const count = $("cartCount");
    count.textContent = num(n);
    count.hidden = n === 0;
    $("cartBtn").setAttribute("aria-label", n ? `${t("nav.cart")}, ${num(n)} ${t("nav.items")}` : t("nav.cart"));
  }

  private orderMessage(f: FormData) {
    const { sub, del, total } = this.totals();
    const area = this.area() === "dhaka" ? t("order.dhaka") : t("order.outside");
    const pay = { bkash: "bKash", nagad: "Nagad", cod: t("order.cod") }[f.get("pay") as string];
    return [
      t("msg.hi"),
      ...this.cart.map((l) => { const p = byId(l.id); return `• ${bn() ? p.bn : p.name} ${grams(l.size)} × ${num(l.qty)} = ${taka(priceOf(p, l.size) * l.qty)}`; }),
      "",
      `${t("order.subtotal")}: ${taka(sub)}`,
      `${t("order.delivery")} (${area}): ${taka(del)}`,
      `${t("order.total")}: ${taka(total)}`,
      `${t("order.pay")}: ${pay}`,
      "",
      `${t("order.name")}: ${f.get("name")}`,
      `${t("order.phone")}: ${f.get("phone")}`,
      `${t("order.address")}: ${f.get("address")}`,
    ].join("\n");
  }

  private submitOrder(form: HTMLFormElement) {
    const err = $("orderErr");
    const f = new FormData(form);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    const phone = val("phone").replace(/[\s-]/g, "");
    let msg = "";
    if (!this.cart.length) msg = t("order.errEmpty");
    else if (!val("name") || !phone || !val("address")) msg = t("order.errFields");
    else if (!/^(\+?88)?01[3-9]\d{8}$/.test(phone)) msg = t("order.errPhone");
    err.textContent = msg;
    if (msg) {
      const bad = !this.cart.length ? null : form.querySelector<HTMLInputElement>(!val("name") ? '[name="name"]' : !phone || msg === t("order.errPhone") ? '[name="phone"]' : '[name="address"]');
      bad?.focus();
      if (!this.cart.length) this.scrollTo("#range");
      return;
    }
    this.demo("order", this.orderMessage(f));
  }

  // ---------- Subscribe ----------
  private initSub() {
    const sel = $<HTMLSelectElement>("subFlavour");
    sel.addEventListener("change", () => this.renderSubPrice());
    $("subSize").addEventListener("change", () => this.renderSubPrice());
    this.renderSub();
  }
  private renderSub() {
    const sel = $<HTMLSelectElement>("subFlavour");
    const keep = sel.value || "kalo";
    sel.innerHTML = products.map((p) => `<option value="${p.id}">${esc(bn() ? `${p.bn} (${p.name})` : `${p.name} (${p.bn})`)}</option>`).join("");
    sel.value = keep;
    const box = $("subSize");
    const g = Number(box.querySelector<HTMLInputElement>("input:checked")?.value ?? 250);
    box.querySelectorAll("label").forEach((l) => l.remove());
    box.insertAdjacentHTML("beforeend", SIZES.map((s) => `<label><input type="radio" name="subsize" value="${s}" ${s === g ? "checked" : ""} /><span>${grams(s)}</span></label>`).join(""));
    this.renderSubPrice();
  }
  private renderSubPrice() {
    const p = byId($<HTMLSelectElement>("subFlavour").value || "kalo");
    const g = Number($("subSize").querySelector<HTMLInputElement>("input:checked")?.value ?? 250);
    const full = priceOf(p, g);
    $("subWas").innerHTML = tk(full);
    $("subPrice").innerHTML = tk(Math.round((full * (1 - SUB_DISCOUNT)) / 10) * 10);
  }

  // ---------- Brew ----------
  private renderBrew() {
    const L = (x: { en: string; bn: string }) => esc(bn() ? x.bn : x.en);
    $("brewCards").innerHTML = brews.map((b) => {
      const p = byId(b.id);
      return `<article class="brew-card" style="--band:${p.band}">
        <div class="brew-card__head">
          <img src="/img/bags/${p.id}.webp" alt="" width="72" height="97" loading="lazy" />
          <div><p class="eyebrow">${L(b.for)}</p><h3>${esc(bn() ? p.bn : p.name)} <span>· ${L(b.method)}</span></h3></div>
        </div>
        <dl class="brew-card__stats">
          <div><dt>${t("brew.coffee")}</dt><dd>${L(b.coffee)}</dd></div>
          <div><dt>${t("brew.water")}</dt><dd>${L(b.water)}</dd></div>
          <div><dt>${t("brew.temp")}</dt><dd>${L(b.temp)}</dd></div>
          <div><dt>${t("brew.time")}</dt><dd>${L(b.time)}</dd></div>
        </dl>
        <div class="grind">
          <div class="grind__top"><span>${t("brew.grind")}</span><b>${L(b.grindName)}</b></div>
          <div class="grind__bar" role="img" aria-label="${t("brew.grind")}: ${L(b.grindName)}"><b></b><b></b><b></b><b></b><b></b><i style="left:${(b.grind * 100).toFixed(0)}%"></i></div>
          <div class="grind__ends"><span>${t("brew.coarse")}</span><span>${t("brew.fine")}</span></div>
        </div>
        <ol class="brew-card__steps">${b.steps.map((s) => `<li>${L(s)}</li>`).join("")}</ol>
      </article>`;
    }).join("");
  }

  // ---------- Demo dialog + toast ----------
  demo(kind: DemoKind, message?: string) {
    const dlg = $<HTMLDialogElement>("demoDialog");
    $("demoBody").textContent = t(`demo.${kind}`);
    $("demoPreview").hidden = !message;
    $("demoMsg").textContent = message ?? "";
    if (!dlg.open) dlg.showModal();
  }

  private toast(text: string) {
    const el = $("toast");
    el.innerHTML = `<span>${esc(text)}</span><a href="#order" data-goto="#order">${t("range.view")}</a>`;
    el.classList.add("is-in");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove("is-in"), 3200);
  }

  // ---------- Events ----------
  private wire() {
    const grid = $("rangeGrid");
    grid.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const card = input.closest<HTMLElement>(".card");
      if (!card || !input.name.startsWith("size-")) return;
      const p = byId(card.dataset.id!);
      this.picked[p.id] = Number(input.value);
      card.querySelector("[data-price]")!.innerHTML = tk(priceOf(p, this.picked[p.id]));
    });
    grid.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-add]");
      if (b) this.add(b.dataset.add!);
    });

    document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((chip, _, all) =>
      chip.addEventListener("click", () => {
        this.filter = chip.dataset.filter!;
        all.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
        this.applyFilter();
      }),
    );

    $("cartList").addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("button");
      if (!el) return;
      if (el.dataset.rm) this.cart.splice(+el.dataset.rm, 1);
      else if (el.dataset.qty) {
        const l = this.cart[+el.dataset.qty];
        l.qty = Math.min(20, l.qty + +el.dataset.d!);
        if (l.qty < 1) this.cart.splice(+el.dataset.qty, 1);
      } else return;
      this.saveCart();
      this.renderCart();
    });
    $("orderArea").addEventListener("change", () => this.renderCart());
    const form = $<HTMLFormElement>("orderForm");
    form.addEventListener("submit", (e) => { e.preventDefault(); this.submitOrder(form); });
    form.addEventListener("input", () => ($("orderErr").textContent = ""));

    $<HTMLFormElement>("subForm").addEventListener("submit", (e) => { e.preventDefault(); this.demo("sub"); });
    document.querySelectorAll<HTMLElement>('[data-demo="social"]').forEach((b) => b.addEventListener("click", () => this.demo("social")));
    $("cartBtn").addEventListener("click", () => this.scrollTo("#order"));
    const search = $<HTMLInputElement>("rangeSearch");
    search.addEventListener("input", () => { this.query = search.value; this.applyFilter(); });
    $("searchBtn").addEventListener("click", () => { this.scrollTo("#range"); search.focus({ preventScroll: true }); });
    $("toast").addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-goto]");
      if (a) { e.preventDefault(); $("toast").classList.remove("is-in"); this.scrollTo(a.dataset.goto!); }
    });
    // click on the dimmed backdrop closes the dialog
    const dlg = $<HTMLDialogElement>("demoDialog");
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }

  /**
   * Load + decode the section images while the visitor is still in the journey, so the first
   * paint of the Range grid doesn't decode a dozen images in one frame.
   */
  warmImages() {
    const run = () => document.querySelectorAll<HTMLImageElement>(".sections img").forEach((img) => {
      img.loading = "eager";
      img.decode().catch(() => { /* decoded on paint instead */ });
    });
    "requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500);
  }

  /** Highlights the nav link of the section in the middle of the screen. */
  private scrollSpy() {
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".nav__links a")];
    const map: Record<string, string> = { journey: "#top", stage: "#top", range: "#range", process: "#process", brew: "#brew", subscribe: "#brew", order: "", about: "#about" };
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const href = map[en.target.id];
      links.forEach((a) => (a.getAttribute("href") === href ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    }), { rootMargin: "-50% 0px -50% 0px" });
    Object.keys(map).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /** Fade/slide in [data-reveal] blocks once they enter the viewport. */
  private io?: IntersectionObserver;
  private reveal() {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    this.io ??= new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); this.io!.unobserve(en.target); }
    }), { rootMargin: "0px 0px -12% 0px" });
    els.forEach((el) => this.io!.observe(el));
  }
}
