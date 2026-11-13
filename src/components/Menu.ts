// Full-screen mobile menu (spec 5.8: on mobile, logo + hamburger + full-screen menu).
import type Lenis from "lenis";
import { t, onLang } from "../lib/i18n";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Menu {
  private menu = $("menu");
  private btn = $<HTMLButtonElement>("menuBtn");
  private open = false;

  constructor(private lenis: Lenis) {
    this.btn.addEventListener("click", () => this.toggle(!this.open));
    this.menu.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#']");
      if (!a) return;
      e.preventDefault();
      e.stopPropagation(); // Lenis' own anchor handler would scroll while it's stopped
      this.toggle(false);
      lenis.scrollTo(a.getAttribute("href")!, { duration: 1.4 });
    });
    document.addEventListener("keydown", (e) => {
      if (!this.open) return;
      if (e.key === "Escape") { this.toggle(false); return; }
      if (e.key !== "Tab") return;
      // keep focus inside the menu (and the close button)
      const items = [this.btn, ...this.menu.querySelectorAll<HTMLElement>("a, button")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { items[items.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && i === items.length - 1) { items[0].focus(); e.preventDefault(); }
    });
    matchMedia("(min-width: 1024px)").addEventListener("change", (m) => { if (m.matches) this.toggle(false); });
    onLang(() => this.label());
    this.label();
  }

  private label() { this.btn.setAttribute("aria-label", t(this.open ? "nav.close" : "nav.menu")); }

  toggle(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    this.btn.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("menu-open", open);
    this.label();
    if (open) {
      this.menu.hidden = false;
      requestAnimationFrame(() => this.menu.classList.add("is-open"));
      this.lenis.stop();
      this.menu.querySelector<HTMLElement>("a")?.focus();
    } else {
      this.menu.classList.remove("is-open");
      setTimeout(() => { if (!this.open) this.menu.hidden = true; }, 300);
      this.lenis.start();
      this.btn.focus();
    }
  }
}
