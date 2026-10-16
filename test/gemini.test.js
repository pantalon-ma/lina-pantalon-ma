import { describe, it, expect, vi } from "vitest";
const sent = [];
const replies = [
  [{ candidates: [{ content: { parts: [{ functionCall: { name: "search_shop_catalog", args: { query: "pantalon large noir" } }, thoughtSignature: "SIG" }] } }] }],
  [{ candidates: [{ content: { parts: [{ text: "Voici " }] } }] }, { candidates: [{ content: { parts: [{ text: "2 modèles." }] } }] }],
];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { constructor() { this.models = { generateContentStream: async (req) => { sent.push(JSON.parse(JSON.stringify(req))); const r = replies.shift(); return (async function* () { for (const c of r) yield c; })(); } }; } },
}));
import { createGeminiService } from "../app/services/gemini.server";

describe("gemini service", () => {
  it("fait un tour avec outil puis répond", async () => {
    const svc = createGeminiService("k");
    const history = [{ role: "user", content: "Je cherche un pantalon large noir taille 38" }];
    const texts = [];
    const tools = [{ name: "search_shop_catalog", description: "search", input_schema: { type: "object", properties: { query: { type: "string" } } } }];
    const h = {
      onText: (t) => texts.push(t),
      onMessage: (m) => history.push(m),
      onToolUse: async (tu) => history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: tu.id, content: [{ type: "text", text: '{"products":[]}' }] }] }),
    };
    const m1 = await svc.streamConversation({ messages: history, tools, promptType: "pantalonMa" }, h);
    expect(m1.stop_reason).toBe("tool_use");
    const m2 = await svc.streamConversation({ messages: history, tools, promptType: "pantalonMa" }, h);
    expect(m2.stop_reason).toBe("end_turn");
    expect(texts.join("")).toBe("Voici 2 modèles.");
    const c = sent[1].contents;
    expect(c.map((x) => x.role)).toEqual(["user", "model", "user"]);
    expect(c[1].parts[0].thoughtSignature).toBe("SIG");
    expect(c[2].parts[0].functionResponse.name).toBe("search_shop_catalog");
    expect(sent[0].config.systemInstruction).toContain("Lina");
  });
});
