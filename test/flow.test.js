import { describe, it, expect, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
import { flowHint } from "../app/services/flow.server.js";
const U=(t)=>({role:"user",content:t}), A=(t)=>({role:"assistant",content:[{type:"text",text:t}]});
describe("déroulé", () => {
  it("saison après la couleur", () => expect(flowHint([U("Classique"),A("Quelle coupe ?"),U("Large"),A("Quelle couleur ?"),U("Noir")])).toMatch(/saison/));
  it("pas deux fois", () => expect(flowHint([U("Noir"),A("Pour quelle saison : hiver, demi-saison ou été ?"),U("44")])).toBe(""));
  it("saison déjà dite", () => expect(flowHint([U("pantalon noir pour l'hiver")])).toBe(""));
  it("autres couleurs", () => expect(flowHint([U("Noir"),A("x"),U("Autres couleurs")])).toMatch(/Quelle couleur/));
  it("darija", () => expect(flowHint([U("كحل")],"darija")).toMatch(/موسم/));
});
