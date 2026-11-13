// Brew guide (spec section 10): Kalo for black, Shada for milk, Roj for every day.
type L = { en: string; bn: string };
export type Brew = {
  id: string; method: L; for: L;
  coffee: L; water: L; temp: L; time: L;
  grind: number; // 0 coarse .. 1 fine
  grindName: L;
  steps: L[];
};

export const brews: Brew[] = [
  {
    id: "kalo", method: { en: "Pour-over", bn: "পোর-ওভার" }, for: { en: "For black coffee", bn: "কালো কফির জন্য" },
    coffee: { en: "15 g", bn: "১৫ গ্রাম" }, water: { en: "250 ml", bn: "২৫০ মিলি" }, temp: { en: "93°C", bn: "৯৩°সে" }, time: { en: "3:00", bn: "৩:০০" },
    grind: 0.6, grindName: { en: "Medium-fine, like table salt", bn: "মাঝারি-মিহি, লবণের মতো" },
    steps: [
      { en: "Rinse the paper filter with hot water and pour that water away.", bn: "গরম পানি দিয়ে পেপার ফিল্টার ধুয়ে সেই পানি ফেলে দিন।" },
      { en: "Pour 40 ml to wet all the coffee and wait 30 seconds.", bn: "৪০ মিলি পানি ঢেলে সব কফি ভিজিয়ে ৩০ সেকেন্ড অপেক্ষা করুন।" },
      { en: "Pour the rest in slow circles. It should finish dripping by 3 minutes.", bn: "বাকি পানি ধীরে ধীরে গোল করে ঢালুন। ৩ মিনিটের মধ্যে ঝরা শেষ হবে।" },
    ],
  },
  {
    id: "shada", method: { en: "Moka pot + milk", bn: "মোকা পট + দুধ" }, for: { en: "For milk coffee", bn: "দুধ কফির জন্য" },
    coffee: { en: "18 g", bn: "১৮ গ্রাম" }, water: { en: "180 ml", bn: "১৮০ মিলি" }, temp: { en: "90°C", bn: "৯০°সে" }, time: { en: "4:00", bn: "৪:০০" },
    grind: 0.82, grindName: { en: "Fine, but not powder", bn: "মিহি, তবে পাউডার নয়" },
    steps: [
      { en: "Fill the base with hot water up to the valve and the basket with coffee, level, not pressed.", bn: "নিচের অংশে ভাল্ভ পর্যন্ত গরম পানি, ঝুড়িতে কফি সমান করে দিন, চেপে নয়।" },
      { en: "Heat on a low flame with the lid open. Take it off when it starts to gurgle.", bn: "ঢাকনা খোলা রেখে কম আঁচে দিন। গড়গড় শব্দ শুরু হলেই নামিয়ে নিন।" },
      { en: "Pour into 150 ml of hot, frothed milk. Sweeten to taste.", bn: "১৫০ মিলি গরম ফেনা-তোলা দুধে ঢালুন। স্বাদমতো চিনি দিন।" },
    ],
  },
  {
    id: "roj", method: { en: "French press", bn: "ফ্রেঞ্চ প্রেস" }, for: { en: "For every day", bn: "রোজকার জন্য" },
    coffee: { en: "30 g", bn: "৩০ গ্রাম" }, water: { en: "500 ml", bn: "৫০০ মিলি" }, temp: { en: "94°C", bn: "৯৪°সে" }, time: { en: "4:00", bn: "৪:০০" },
    grind: 0.18, grindName: { en: "Coarse, like rough sugar", bn: "মোটা, দানাদার চিনির মতো" },
    steps: [
      { en: "Add the coffee, pour all the water and give it one stir.", bn: "কফি দিন, সব পানি ঢালুন, একবার নেড়ে দিন।" },
      { en: "Put the lid on and wait 4 minutes.", bn: "ঢাকনা দিয়ে ৪ মিনিট অপেক্ষা করুন।" },
      { en: "Press slowly and pour it all out, so it doesn't keep brewing.", bn: "ধীরে চাপ দিন আর পুরোটা ঢেলে নিন, যাতে আর ভিজতে না থাকে।" },
    ],
  },
];
