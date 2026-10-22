import { describe, it, expect, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
import { quickRepliesFor } from "../app/services/quick-replies.server.js";
import { canSearchDirectly } from "../app/services/flow.server.js";
describe("browse", () => {
  it("boutons taille après les modèles", () => {
    const q = quickRepliesFor("Voici les modèles disponibles 😊 Votre taille, pour vérifier la disponibilité ?", { langue: "fr", produitsAffiches: true });
    expect(JSON.stringify(q)).toContain("44");
  });
  it("texte libre", () => {
    const p = canSearchDirectly([{ role: "user", content: "montrez-moi les pantalons larges noirs classiques" }]);
    expect(p.parcourir).toBe(true); expect(p.couleur).toBe("noir");
    console.log(p, canSearchDirectly([{ role: "user", content: "وريني السراول الواسعين الكحلين" }]));
  });
});
