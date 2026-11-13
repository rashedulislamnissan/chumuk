// All nine products (SPEC.md section 4 + the owner's brand blueprint). Copy is owner-editable.
// This is a portfolio demo: prices are realistic Bangladesh-market BDT figures (local 250 g specialty
// bags sell for about ৳700 to ৳900, imported ones ৳1,200 to ৳1,800), but nothing is for sale.
export type Product = {
  id: string; name: string; bn: string; roast: string; roastBn: string; dots: number;
  notes: [string, string]; notesBn: [string, string];
  bag: string; band: string; text: string; edition?: string; editionBn?: string;
  core?: boolean;
  /** BDT for 100 g, 250 g, 500 g */
  price: [number, number, number];
};

const SPECIAL = { bag: "#16110E", text: "#F4EDE0" };

export const SIZES = [100, 250, 500] as const;

export const products: Product[] = [
  // core range
  { id: "kalo", name: "Kalo", bn: "কালো", roast: "Medium-dark", roastBn: "মিডিয়াম-ডার্ক", dots: 4, notes: ["Dark chocolate", "Roasted nuts"], notesBn: ["ডার্ক চকলেট", "ভাজা বাদাম"], bag: "#16110E", band: "#D4A24C", text: "#F4EDE0", core: true, price: [390, 890, 1650] },
  { id: "shada", name: "Shada", bn: "সাদা", roast: "Medium, low acid", roastBn: "মিডিয়াম, কম টক", dots: 3, notes: ["Milk chocolate", "Hazelnut"], notesBn: ["মিল্ক চকলেট", "হ্যাজেলনাট"], bag: "#F4EDE0", band: "#B8862F", text: "#16110E", core: true, price: [390, 890, 1650] },
  { id: "roj", name: "Roj", bn: "রোজ", roast: "Medium, balanced", roastBn: "মিডিয়াম, ভারসাম্যপূর্ণ", dots: 3, notes: ["Cocoa", "Toasted bread"], notesBn: ["কোকো", "টোস্ট করা রুটি"], bag: "#B5553A", band: "#F4D9A0", text: "#F4EDE0", core: true, price: [360, 820, 1520] },
  // specials: one black bag, only the band colour changes
  { id: "nolen-gur", name: "Nolen Gur", bn: "নলেন গুড়", roast: "Dark", roastBn: "ডার্ক", dots: 5, notes: ["Date-palm jaggery", "Sesame"], notesBn: ["খেজুরের গুড়", "তিল"], band: "#9C5A1C", edition: "Winter edition", editionBn: "শীতের সংস্করণ", ...SPECIAL, price: [480, 1090, 2050] },
  { id: "satkora", name: "Satkora Bloom", bn: "সাতকরা", roast: "Light", roastBn: "লাইট", dots: 2, notes: ["Citrus peel", "Jasmine"], notesBn: ["লেবুর খোসা", "জুঁই ফুল"], band: "#A8B83C", ...SPECIAL, price: [480, 1090, 2050] },
  { id: "mishti-doi", name: "Mishti Doi", bn: "মিষ্টি দই", roast: "Medium", roastBn: "মিডিয়াম", dots: 3, notes: ["Clay-pot caramel", "Milk toffee"], notesBn: ["মাটির হাঁড়ির ক্যারামেল", "দুধের টফি"], band: "#D98B73", ...SPECIAL, price: [460, 1050, 1950] },
  { id: "himsagar", name: "Himsagar", bn: "হিমসাগর", roast: "Natural process", roastBn: "ন্যাচারাল প্রসেস", dots: 2, notes: ["Ripe mango", "Apricot"], notesBn: ["পাকা আম", "খুবানি"], band: "#F2B134", edition: "Summer edition", editionBn: "গ্রীষ্মের সংস্করণ", ...SPECIAL, price: [520, 1190, 2250] },
  { id: "tong", name: "Tong", bn: "টং", roast: "Spiced", roastBn: "মসলাদার", dots: 4, notes: ["Cardamom", "Cinnamon"], notesBn: ["এলাচ", "দারুচিনি"], band: "#9E2B25", ...SPECIAL, price: [440, 990, 1850] },
  { id: "jhum", name: "Jhum Reserve", bn: "ঝুম", roast: "Single origin", roastBn: "সিঙ্গেল অরিজিন", dots: 3, notes: ["Plum", "Tamarind"], notesBn: ["বরই", "তেঁতুল"], band: "#2F6B66", ...SPECIAL, price: [620, 1450, 2750] },
];

export const byId = (id: string) => products.find((p) => p.id === id)!;

/**
 * Carousel ring: next/prev moves ONE bag. Index 0 is the centre on arrival, with its neighbours
 * on the sides (so the stage opens on Roj · Kalo · Shada).
 */
export const ring: string[] = ["kalo", "shada", "nolen-gur", "satkora", "mishti-doi", "himsagar", "tong", "jhum", "roj"];
export const wrap = (i: number, n = ring.length) => ((i % n) + n) % n;
/** [left, centre, right] products around ring index i */
export const trioAt = (i: number) => [ring[wrap(i - 1)], ring[wrap(i)], ring[wrap(i + 1)]].map(byId) as [Product, Product, Product];

/** Delivery fees in BDT (typical courier rates). */
export const DELIVERY = { dhaka: 70, outside: 130 };
/** Subscription discount. */
export const SUB_DISCOUNT = 0.1;
