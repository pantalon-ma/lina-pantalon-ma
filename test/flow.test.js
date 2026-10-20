import { describe, it, expect, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
import { flowHint } from "../app/services/flow.server.js";
const U=(t)=>({role:"user",content:t}), A=(t)=>({role:"assistant",content:[{type:"text",text:t}]});
describe("déroulé", () => {
  it("saison après la couleur", () => expect(flowHint([U("Classique"),A("Quelle coupe ?"),U("Large"),A("Quelle couleur ?"),U("Noir")])).toMatch(/saison/));
  it("pas deux fois", () => expect(flowHint([U("Noir"),A("Pour quelle saison : hiver, demi-saison ou été ?"),U("44")])).toBe(""));
  it("saison déjà dite -> on demande le type, pas la saison", () => expect(flowHint([U("pantalon noir pour l'hiver")])).toMatch(/classique, casual ou sport/));
  it("question boutique -> pas d'étape imposée", () => expect(flowHint([U("La livraison à Agadir prend combien de temps ?")])).toBe(""));
  it("autres couleurs", () => expect(flowHint([U("Noir"),A("x"),U("Autres couleurs")])).toMatch(/Quelle couleur/));
  it("darija", () => expect(flowHint([U("كلاسيك"),U("واسع"),U("كحل")],"darija")).toMatch(/موسم/));
});
import { fastReply } from "../app/services/flow.server.js";
describe("réponse rapide", () => {
  it("Classique -> coupe", () => expect(fastReply([U("Classique")])).toMatch(/coupe/));
  it("Large -> couleur", () => expect(fastReply([U("Classique"),A("Quelle coupe ?"),U("Large")])).toBe("Quelle couleur ?"));
  it("Noir -> saison", () => expect(fastReply([U("Classique"),U("Large"),U("Noir")])).toMatch(/saison/));
  it("Hiver -> taille", () => expect(fastReply([U("Classique"),U("Large"),U("Noir"),A("Pour quelle saison ?"),U("Hiver")])).toBe("Votre taille ?"));
  it("44 -> IA", () => expect(fastReply([U("Classique"),U("Large"),U("Noir"),U("Hiver"),U("44")])).toBe(null));
  it("phrase libre pantalon -> question suivante (bureau = classique)", () => expect(fastReply([U("je veux un pantalon pour le bureau")])).toMatch(/coupe/));
  it("darija", () => expect(fastReply([U("كلاسيك")],"darija")).toMatch(/قصة/));
});
describe("rapide autres", () => { it("autres couleurs", () => expect(fastReply([U("Noir"),A("x"),U("Autres couleurs")])).toBe("Quelle couleur ?")); });
describe("instantané : mesures et taille lettre", () => {
  it("je ne connais pas ma taille -> mesures", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("Classique"),A("x"),U("Large"),A("x"),U("Noir"),A("saison ?"),U("Hiver"),A("Votre taille ?"),U("Je ne connais pas ma taille")])).toMatch(/hanches/); });
  it("« l'hiver » n'est pas une taille L", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("noir pour l'hiver"),A("x"),U("Classique"),A("x"),U("Large")])).toMatch(/taille/); });
});
describe("conseillère", () => {
  it("bouton -> lien WhatsApp immédiat", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("Parler à une conseillère")])).toMatch(/wa\.me\/212703200695/); });
});
describe("texte libre", () => {
  it("pantalon gris classique -> coupe (sans IA)", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("Pantalon gris classique")])).toMatch(/coupe/); });
  it("question livraison -> IA", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("Vous livrez à Agadir en combien de jours ?")])).toBe(null); });
  it("recherche directe garde le gris", async () => { const { canSearchDirectly } = await import("../app/services/flow.server.js"); expect(canSearchDirectly([U("Pantalon gris classique"),A("Quelle coupe ?"),U("Large"),A("Pour quelle saison ?"),U("Hiver"),A("Votre taille ?"),U("40")]).couleur).toBe("gris"); });
});
describe("mesures sans IA", () => {
  const base=[U("Classique"),A("x"),U("Large"),A("x"),U("Noir"),A("Pour quelle saison ?"),U("Hiver"),A("Votre taille ?"),U("Je ne connais pas ma taille"),A("Votre tour de hanches et votre tour de taille en cm ?")];
  it("deux nombres", async () => { const { canSearchDirectly: c } = await import("../app/services/flow.server.js"); expect(c([...base,U("119 100")])).toMatchObject({tour_hanches:119,tour_taille:100}); });
  it("avec mots", async () => { const { canSearchDirectly: c } = await import("../app/services/flow.server.js"); expect(c([...base,U("hanches 123 et taille 104")])).toMatchObject({tour_hanches:123,tour_taille:104}); });
  it("hanches puis taille", async () => { const { canSearchDirectly: c } = await import("../app/services/flow.server.js"); expect(c([...base,U("Tour hanche 123"),A("Et votre tour de taille en cm ?"),U("104")])).toMatchObject({tour_hanches:123,tour_taille:104}); });
  it("une seule -> recherche (l'outil demandera l'autre)", async () => { const { canSearchDirectly: c } = await import("../app/services/flow.server.js"); const r=c([...base,U("Tour hanche 123")]); expect(r.tour_hanches).toBe(123); expect(r.tour_taille).toBeUndefined(); });
});
describe("fautes et darija latine", () => {
  it("bghit serwal k7el wase3 classik -> saison (sans IA)", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("salam bghit serwal k7el wase3 classik")])).toMatch(/saison/); });
  it("phrase complète avec taille -> recherche directe", async () => { const { canSearchDirectly } = await import("../app/services/flow.server.js"); expect(canSearchDirectly([U("je veux un pantalan noire larg classik pour l'hiver taille 46")])).toMatchObject({ style: "classique", type: "large", taille: "46", saison: "hiver" }); });
});
describe("phrases courtes libres", () => {
  it("droit classe 44 -> couleur (sans IA)", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("droit classe 44")])).toBe("Quelle couleur ?"); });
});
describe("jupes", () => {
  it("bghit saya -> taille", async () => { const { fastReply } = await import("../app/services/flow.server.js"); expect(fastReply([U("salam bghit saya")])).toBe("Votre taille ?"); });
  it("falda + 42 -> recherche jupe", async () => { const { canSearchDirectly } = await import("../app/services/flow.server.js"); expect(canSearchDirectly([U("je cherche une falda"),A("Votre taille ?"),U("42")])).toMatchObject({ type: "jupe", taille: "42" }); });
  it("pantalon jupe reste un pantalon", async () => { const { flowState } = await import("../app/services/flow.server.js"); expect(flowState([U("pantalon jupe noir")]).jupe).toBe(false); });
});
