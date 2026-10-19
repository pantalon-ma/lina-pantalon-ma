import { describe, it, expect, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: { session: { findFirst: async () => null } } }));
vi.mock("../app/services/shop-origin.server", () => ({ shopDomainFor: (h) => h }));
import { searchCatalog } from "../app/services/catalog.server";
const v=(id,c,t,a,img)=>({id:`gid://shopify/ProductVariant/${id}`,availableForSale:a,price:{amount:"229.0"},selectedOptions:[{name:"Couleur",value:c},{name:"Taille",value:t}],image:{url:img||"i"+id}});
const prods=[
 {id:"p1",title:"Pantalon Femme - Casual Large - Crêpe Prada",handle:"large-prada",productType:"Casual",tags:[],availableForSale:true,featuredImage:{url:"f1"},variants:{nodes:[v(1,"noir","44-XL",false),v(2,"noir","42-L",true),v(3,"beige","44-XL",true)]}},
 {id:"p2",title:"Pantalon Femme - Classique Droit - Gabardine",handle:"droit",productType:"classique",tags:[],availableForSale:true,featuredImage:{url:"f2"},variants:{nodes:[v(4,"noir","44",true)]}},
 {id:"p3",title:"Pantalon Femme - Palazzo à Plis",handle:"palazzo",productType:"classique",tags:[],availableForSale:false,variants:{nodes:[v(5,"noir","44",false)]}},
];
global.fetch=vi.fn(async()=>({status:200,text:async()=>JSON.stringify({data:{products:{pageInfo:{hasNextPage:false},nodes:prods}}}),json:async()=>({})}));
describe("catalogue",()=>{
 it("exact en stock",async()=>{const r=await searchCatalog("https://x.ma",{couleur:"noir",type:"large",taille:"42"});expect(r.similaires).toBe(false);expect(r.products[0].url).toBe("https://x.ma/products/large-prada?variant=2");});
 it("rupture -> aucun modèle, choix proposés",async()=>{const r=await searchCatalog("https://y.ma",{couleur:"noir",type:"large",taille:"XL"});expect(r.rupture).toBe(true);expect(r.products.length).toBe(0);expect(r.autres_modeles_meme_couleur).toBeGreaterThan(0);});
 it("sans taille -> demander la taille",async()=>{const r=await searchCatalog("https://v.ma",{couleur:"noir",type:"large"});expect(r.besoin_taille).toBe(true);expect(r.products.length).toBe(0);});
 it("palazzo en rupture jamais proposé",async()=>{const r=await searchCatalog("https://z.ma",{type:"palazzo",taille:"42"});expect(r.products.map(p=>p.title).join()).not.toContain("Palazzo");});
});
describe("taille stricte",()=>{
 it("ne propose jamais une autre taille",async()=>{const r=await searchCatalog("https://w.ma",{couleur:"noir",type:"large",taille:"50"});expect(r.products.length).toBe(0);});
});
describe("saison",()=>{
 it("hiver met la flanelle avant le lin",async()=>{
  const v2=(id,a)=>({id:`gid://shopify/ProductVariant/${id}`,availableForSale:a,price:{amount:"200"},selectedOptions:[{name:"Couleur",value:"noir"},{name:"Taille",value:"44"}],image:{url:"x"}});
  prods.push({id:"p4",title:"Pantalon Femme - Classique Large - Lin",handle:"lin",productType:"",tags:[],availableForSale:true,variants:{nodes:[v2(10,true)]}});
  prods.push({id:"p5",title:"Pantalon Femme - Classique Large Chaud - Flanelle Drapée",handle:"flan",productType:"",tags:[],availableForSale:true,variants:{nodes:[v2(11,true)]}});
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16"));
  const r=await searchCatalog("https://season.ma",{couleur:"noir",type:"classique large",taille:"44"});
  vi.useRealTimers();
  const t=r.products.map(p=>p.handle||p.title); expect(t.findIndex(x=>/Flanelle/.test(x))).toBeLessThan(t.findIndex(x=>/Lin$/.test(x)));
 });
});
describe("rapprochements",()=>{
 it("couleurs proches",async()=>{const {colorMatches:m}=await import("../app/services/catalog.server.js");expect(m("Grenat","bordeaux")).toBe(true);expect(m("Bordeaux","grenat")).toBe(true);expect(m("Noir","كحل")).toBe(true);expect(m("Bleu Marine","bleu")).toBe(true);expect(m("Bleu Ciel","bleu marine")).toBe(false);expect(m("Noir","bordeaux")).toBe(false);});
 it("coupes proches",async()=>{const {keywordScore:k}=await import("../app/services/catalog.server.js");const P=(t)=>({title:t,productType:"",tags:[]});expect(k(P("Pantalon Femme - Palazzo à Plis"),"large")).toBe(1);expect(k(P("Pantalon Femme - Classique à Fentes"),"étroit")).toBe(1);expect(k(P("Pantalon Femme - Jupe Longue"),"large")).toBe(0);});
});
describe("taille selon mesures",()=>{
 it("hanches 119 -> 48 sur Fentes CE Chaud (pas 52)",async()=>{const {recommendSize:r}=await import("../app/services/catalog.server.js");expect(r("Pantalon Femme - Classique à Fentes CE Chaud - Flanelle Drapée",{tour_hanches:119})).toBe("48");});
 it("chaque modèle sa taille",async()=>{const {recommendSize:r}=await import("../app/services/catalog.server.js");expect(r("Pantalon Femme - Palazzo à Plis - Crêpe Corée",{tour_hanches:119})).toBe("40");expect(r("Pantalon Femme - Classique à Fentes - Flanelle",{tour_hanches:119})).toBe("50");});
 it("taille fixe : le tour de taille compte",async()=>{const {recommendSize:r}=await import("../app/services/catalog.server.js");expect(r("Pantalon Femme - Classique à Fentes CE Chaud - Flanelle Drapée",{tour_hanches:100,tour_taille:108})).toBe("50");});
});
