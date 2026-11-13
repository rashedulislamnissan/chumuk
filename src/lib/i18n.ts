import en from "../i18n/en.json";
import bn from "../i18n/bn.json";

export type Lang = "en" | "bn";
const dicts: Record<Lang, Record<string, string>> = { en, bn };
let lang: Lang = "en";
const listeners = new Set<(l: Lang) => void>();

export const t = (key: string) => dicts[lang][key] ?? dicts.en[key] ?? key;
export const getLang = () => lang;
export const onLang = (fn: (l: Lang) => void) => (listeners.add(fn), () => listeners.delete(fn));

/** Fills every [data-i18n] / [data-i18n-aria] element and sets lang attributes. */
export function setLang(next: Lang) {
  lang = next;
  document.documentElement.lang = next;
  document.documentElement.dataset.lang = next;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
    el.lang = next;
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria!)));
  document.querySelectorAll<HTMLImageElement>("[data-i18n-alt]").forEach((el) => (el.alt = t(el.dataset.i18nAlt!)));
  document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh!)));
  listeners.forEach((fn) => fn(next));
}
