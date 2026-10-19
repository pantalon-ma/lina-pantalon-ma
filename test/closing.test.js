import { describe, it, expect, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
import { closingText } from "../app/services/closing.server.js";
import { canSearchDirectly } from "../app/services/flow.server.js";
const U=(t)=>({role:"user",content:t}), A=(t)=>({role:"assistant",content:[{type:"text",text:t}]});
describe("textes du code", () => {
  it("produits + promo 1re fois", () => expect(closingText({products:[{}]},{})).toMatch(/Lequel[\s\S]*Réductions/));
  it("pas de promo 2e fois", () => expect(closingText({products:[{}]},{promoDeja:true})).not.toMatch(/Réductions/));
  it("rupture avec couleurs", () => expect(closingText({rupture:true,demande:{couleur:"Marron",taille:"48"},autres_couleurs_meme_modele:["Noir","Camel"],products:[]},{})).toMatch(/marron.*48.*noir, camel/));
  it("recherche directe", () => expect(canSearchDirectly([U("Classique"),A("x"),U("Large"),A("x"),U("Marron"),A("Pour quelle saison ?"),U("Demi-saison"),A("Votre taille ?"),U("48")])).toEqual({style:"classique",type:"large",couleur:"Marron",saison:"demi-saison",taille:"48"}));
  it("texte libre -> IA", () => expect(canSearchDirectly([U("je veux un pantalon noir taille 44 pour un mariage")])).toBe(null));
});
