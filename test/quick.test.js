import { describe, it, expect } from "vitest";
import { quickRepliesFor as q } from "../app/services/quick-replies.server.js";
describe("boutons", () => {
  it("type", () => expect(q("Quel type de pantalon : classique, casual ou sport ?", {})[0]).toBe("Classique"));
  it("coupe", () => expect(q("Quelle coupe : droite ou large ?", {})).toContain("Étroite"));
  it("couleur", () => expect(q("Quelle couleur ?", {})[0]).toBe("Noir"));
  it("taille", () => expect(q("Votre taille ?", {})).toContain("44"));
  it("mesures -> rien", () => expect(q("Quel est votre tour de hanches et votre tour de taille en cm ?", {})).toEqual([]));
  it("darija coupe", () => expect(q("شمن قصة: واسع، ديريكت ولا ضيق؟", { langue: "darija" })[0]).toBe("واسع"));
  it("après cartes", () => expect(q("Lequel vous plaît ? 😊", { produitsAffiches: true })).toContain("Modèles d'été"));
});
