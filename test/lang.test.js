import { describe, it, expect, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
import { detectLanguage } from "../app/services/gemini.server";
const u=(t)=>[{role:"user",content:t}];
describe("langue",()=>{
 it("fr",()=>expect(detectLanguage(u("Vous avez des promos ?"))).toBe("français"));
 it("arabizi",()=>expect(detectLanguage(u("salam bghit sarwal k7el"))).toBe("darija"));
 it("arabe",()=>expect(detectLanguage(u("بغيت سروال"))).toBe("darija"));
 it("fr pantalon noir",()=>expect(detectLanguage(u("pantalon noir large taille 44"))).toBe("français"));
 it("suit le dernier",()=>expect(detectLanguage([{role:"user",content:"bghit sarwal"},{role:"assistant",content:"x"},{role:"user",content:"Je préfère le beige"}])).toBe("français"));
 it("ignore tool_result",()=>expect(detectLanguage([{role:"user",content:"Je veux un jean"},{role:"assistant",content:[]},{role:"user",content:[{type:"tool_result",content:"x"}]}])).toBe("français"));
});
