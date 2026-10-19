/**
 * Gemini Service — remplace le service Claude, même interface.
 * Les messages restent stockés au format "Anthropic" (blocs text / tool_use / tool_result)
 * et sont convertis vers le format Gemini à chaque appel.
 */
import { GoogleGenAI } from "@google/genai";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";
import { flowHint } from "./flow.server";
import { BUTTONS } from "./quick-replies.server";

// Les clics sur les boutons français ne changent pas la langue de la cliente
const FR_BUTTONS = new Set(Object.values(BUTTONS.FR).flat().map((l) => l.toLowerCase()));

const noThinkingModels = new Set(); // modèles qui refusent thinkingBudget: 0
const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-flash-lite-latest"];

/** Détecte la langue du dernier message de la cliente (français / darija / anglais) */
export function detectLanguage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = typeof m.content === "string" ? m.content
      : Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text).join(" ") : "";
    if (!/[a-zA-Z\u00C0-\u017F\u0600-\u06FF]/.test(text)) continue;
    if (FR_BUTTONS.has(text.trim().toLowerCase())) continue; // bouton cliqué : on garde la langue des messages écrits // résultat d'outil ou juste « 44 » : on regarde le message précédent
    if (/[\u0600-\u06FF]/.test(text)) return "darija";
    const t = " " + text.toLowerCase() + " ";
    const darija = /\b(salam|bghit|bghiti|wach|chhal|shhal|kayn|kayna|wa?ss?e3|l9ed|k7el|khder|zre9|byed|3afak|3endk|3ndk|smiya|sarwal|serwal|dyal|dial|ana|nta|nti|labas|mzyan|zwin|zwina|hadi|hada|fin|ach|chno|wakha|safi|bzaf|chi|daba|ghadi|baghya|bghina)\b/.test(t) || /[a-z][379][a-z]/.test(t);
    if (darija) return "darija";
    if (/\b(hello|hi|please|want|pants|size|black|do you|have)\b/.test(t) && !/\b(je|vous|tu|est|une|des|pour|avez)\b/.test(t)) return "anglais";
    return "français";
  }
  return null;
}

export function createGeminiService(apiKey = process.env.GEMINI_API_KEY) {
  const ai = new GoogleGenAI({ apiKey });

  const getSystemPrompt = (promptType) => {
    const raw = systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;
    // Numéro WhatsApp de l'équipe (fichier .env : WHATSAPP_NUMBER=2126XXXXXXXX)
    const num = (process.env.WHATSAPP_NUMBER || "212703200695").replace(/[^0-9]/g, "");
    return raw
      .replace(/\{\{WHATSAPP_URL\}\}/g, num ? `https://wa.me/${num}` : "https://pantalon.ma/pages/contactez-nous")
      .replace(/\{\{WHATSAPP_NUMBER\}\}/g, num ? `+${num}` : "(voir l'icône WhatsApp du site)");
  };

  /** Convertit le contenu d'un tool_result (MCP) en objet pour Gemini */
  const toolResultToResponse = (content) => {
    if (typeof content === "string") return { result: content };
    if (Array.isArray(content)) {
      const text = content.map((c) => (typeof c === "string" ? c : c.text ?? JSON.stringify(c))).join("\n");
      return { result: text };
    }
    return { result: JSON.stringify(content ?? "") };
  };

  /** Historique format Anthropic → contents Gemini */
  const toGeminiContents = (messages) => {
    const toolNames = {}; // tool_use_id → nom de l'outil
    const contents = [];
    for (const msg of messages) {
      const role = msg.role === "assistant" ? "model" : "user";
      const parts = [];
      if (typeof msg.content === "string") {
        if (msg.content) parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            parts.push({ text: block.text });
          } else if (block.type === "tool_use") {
            toolNames[block.id] = block.name;
            const part = { functionCall: { id: block.id, name: block.name, args: block.input || {} } };
            if (block.thought_signature) part.thoughtSignature = block.thought_signature;
            parts.push(part);
          } else if (block.type === "tool_result") {
            parts.push({
              functionResponse: {
                id: block.tool_use_id,
                name: toolNames[block.tool_use_id] || "tool",
                response: toolResultToResponse(block.content),
              },
            });
          }
        }
      }
      if (!parts.length) continue;
      // Gemini veut des rôles alternés : on fusionne les messages consécutifs du même rôle
      const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts.push(...parts);
      else contents.push({ role, parts });
    }
    return contents;
  };

  const langHint = (messages) => {
    const l = detectLanguage(messages);
    if (l === "français") return "\n\n⚠️ LANGUE DU DERNIER MESSAGE DE LA CLIENTE : FRANÇAIS. Réponds UNIQUEMENT en français (vouvoiement), y compris le bloc promotions en français. Aucun mot en arabe.";
    if (l === "darija") return "\n\n⚠️ LANGUE DU DERNIER MESSAGE DE LA CLIENTE : DARIJA. Réponds en darija écrite en lettres arabes (noms de modèles en français acceptés), bloc promotions en arabe.";
    if (l === "anglais") return "\n\n⚠️ LANGUE DU DERNIER MESSAGE DE LA CLIENTE : ANGLAIS. Réponds en anglais.";
    return "";
  };

  const toGeminiTools = (tools) =>
    tools && tools.length
      ? [{
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description || "",
            parametersJsonSchema: t.input_schema || { type: "object", properties: {} },
          })),
        }]
      : undefined;

  /**
   * Même signature que claudeService.streamConversation.
   * Renvoie un message au format Anthropic : { role, content: [...], stop_reason }
   */
  const streamConversation = async ({ messages, promptType = AppConfig.api.defaultPromptType, tools }, handlers) => {
    // Modèles essayés dans l'ordre : si l'offre gratuite est saturée (503/429), on passe au suivant
    const models = [...new Set([AppConfig.api.defaultModel, ...FALLBACK_MODELS])];
    let stream, lastErr;
    const contents = toGeminiContents(messages);
    const systemInstruction = getSystemPrompt(promptType) + langHint(messages) + flowHint(messages, detectLanguage(messages));
    const geminiTools = toGeminiTools(tools);
    // Gemini refuse un historique qui se termine par un message de Lina
    if (contents.length && contents[contents.length - 1].role === "model") contents.push({ role: "user", parts: [{ text: "..." }] });
    for (const model of models) {
      let useThinkingCfg = !noThinkingModels.has(model);
      for (let attempt = 0; attempt < 2 && !stream; attempt++) {
        try {
          const config = { systemInstruction, maxOutputTokens: AppConfig.api.maxTokens, tools: geminiTools };
          // Réflexion minimale = réponse plus rapide (retirée si le modèle ne l'accepte pas)
          if (useThinkingCfg) config.thinkingConfig = { thinkingBudget: 0 };
          stream = await ai.models.generateContentStream({ model, contents, config });
        } catch (e) {
          lastErr = e;
          const msg = String(e?.message || e);
          if (/INVALID_ARGUMENT|invalid argument|thinking/i.test(msg)) {
            if (useThinkingCfg) { useThinkingCfg = false; noThinkingModels.add(model); attempt--; continue; }
            console.warn(`[Lina] Gemini ${model} : requête refusée`, msg.slice(0, 200));
            break; // on essaie le modèle suivant
          }
          const busy = /503|UNAVAILABLE|overloaded|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
          console.warn(`[Lina] Gemini ${model} indisponible (essai ${attempt + 1})`);
          const gone = /404|NOT_FOUND|no longer available|not found/i.test(msg);
          if (gone) break; // modèle retiré : on passe directement au suivant
          if (!busy) throw normalizeError(e);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (stream) break;
    }
    if (!stream) throw normalizeError(lastErr);

    let text = "";
    const toolUses = [];
    try {
      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.thought) continue; // réflexion interne, non affichée
          if (part.text) {
            // Supprime les caractères parasites (coréen, chinois, japonais…) que le modèle gratuit insère parfois
            const clean = part.text.replace(/[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u9FFF\uAC00-\uD7AF]/g, "");
            text += clean;
            if (clean) handlers.onText?.(clean);
          }
          if (part.functionCall) {
            toolUses.push({
              type: "tool_use",
              id: part.functionCall.id || `call_${Date.now()}_${toolUses.length}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {},
              ...(part.thoughtSignature ? { thought_signature: part.thoughtSignature } : {}),
            });
          }
        }
      }
    } catch (e) {
      throw normalizeError(e);
    }

    const content = [];
    if (text) {
      const textBlock = { type: "text", text };
      content.push(textBlock);
      handlers.onContentBlock?.(textBlock);
    }
    content.push(...toolUses);
    if (!content.length) content.push({ type: "text", text: "" });

    const finalMessage = {
      role: "assistant",
      content,
      stop_reason: toolUses.length ? "tool_use" : "end_turn",
    };

    handlers.onMessage?.(finalMessage);

    if (handlers.onToolUse) {
      for (const tu of toolUses) await handlers.onToolUse(tu);
    }
    return finalMessage;
  };

  return { streamConversation, getSystemPrompt };
}

/** Aligne les erreurs Gemini sur ce qu'attend streaming.server.js (status 401 / 429) */
function normalizeError(e) {
  const msg = String(e?.message || e);
  const err = new Error(msg);
  if (e?.status) err.status = e.status;
  else if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) err.status = 429;
  else if (/API key|PERMISSION_DENIED|UNAUTHENTICATED|401|403/i.test(msg)) err.status = 401;
  if (err.status === 403) err.status = 401;
  return err;
}

export default { createGeminiService };
