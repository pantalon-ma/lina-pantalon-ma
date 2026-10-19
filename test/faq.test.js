import { describe, it, expect } from "vitest";
import { faqReport } from "../app/services/faq.server.js";
describe("faq", () => {
  it("classe les questions", () => {
    const r = faqReport([{content:"Classique"},{content:"44"},{content:"La livraison prend combien de temps ?"},{content:"واش نقدر نحل الكولي قبل ما نخلص؟"},{content:"Je peux payer à la livraison ?"},{content:"Livraison à Agadir ?"}]);
    expect(r.themes[0].theme).toMatch(/Livraison/); expect(r.themes[0].count).toBe(2);
    expect(r.themes.map(t=>t.theme).join()).not.toMatch(/undefined/);
  });
});
