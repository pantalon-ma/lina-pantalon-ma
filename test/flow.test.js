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
  it("phrase libre -> IA", () => expect(fastReply([U("je veux un pantalon pour le bureau")])).toBe(null));
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
