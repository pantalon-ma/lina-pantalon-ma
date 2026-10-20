import { describe, it, expect } from "vitest";
import { unansweredReport } from "../app/services/faq.server.js";
const M=(r,c,id="a")=>({conversationId:id,role:r,content:r==="assistant"?JSON.stringify([{type:"text",text:c}]):c});
describe("sans réponse", () => {
  it("détecte renvoi équipe et absence de réponse, ignore boutons", () => {
    const r = unansweredReport([M("user","Classique"),M("assistant","Quelle coupe ?"),M("user","Vous faites des tailles 60 et plus ?"),M("assistant","Je n'ai pas cette information, contactez notre équipe sur WhatsApp."),M("user","c'est quoi la composition du tissu milano ?"),M("user","Large",)]);
    expect(r.map(x=>x.question)).toContain("Vous faites des tailles 60 et plus ?");
    expect(r.find(x=>/composition/.test(x.question)).raison).toMatch(/pas de réponse/);
    expect(r.some(x=>x.question==="Classique")).toBe(false);
  });
});
