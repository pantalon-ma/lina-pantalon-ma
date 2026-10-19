/**
 * Chat API Route
 * Handles chat interactions with Claude API and tools
 */
import MCPClient from "../mcp-client";
import prisma, { saveMessage, flushMessages, getConversationHistory, resolveConversationId } from "../db.server";
import { detectLanguage } from "../services/gemini.server";
import { resolveInstalledShopOrigin, shopDomainFor } from "../services/shop-origin.server";
import AppConfig from "../services/config.server";
import { createSseStream } from "../services/streaming.server";
import { createClaudeService } from "../services/claude.server";
import { createGeminiService } from "../services/gemini.server";
import { createToolService } from "../services/tool.server";
import { catalogTool, searchCatalog, CATALOG_TOOL_NAME } from "../services/catalog.server";
import { quickRepliesFor } from "../services/quick-replies.server";
import { fastReply, canSearchDirectly } from "../services/flow.server";
import { closingText, promoDejaAffichee } from "../services/closing.server";


const MCP_TOOLS_TTL = 30 * 60 * 1000;
const mcpToolsCache = new Map(); // shopOrigin -> { at, tools }
const MAX_HISTORY = 14;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * Rract Router loader function for handling GET requests
 */
export async function loader({ request }) {
  const shopOrigin = await resolveInstalledShopOrigin(request);
  if (!shopOrigin) return forbidden();

  // Handle OPTIONS requests (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request, shopOrigin)
    });
  }

  const url = new URL(request.url);

  // Handle history fetch requests - matches /chat?history=true&conversation_id=XYZ
  if (url.searchParams.has('history') && url.searchParams.has('conversation_id')) {
    return handleHistoryRequest(request, shopOrigin, url.searchParams.get('conversation_id'));
  }

  // Handle SSE requests
  if (!url.searchParams.has('history') && request.headers.get("Accept") === "text/event-stream") {
    return handleChatRequest(request, shopOrigin);
  }

  // API-only: reject all other requests
  return new Response(JSON.stringify({ error: AppConfig.errorMessages.apiUnsupported }), { status: 400, headers: getCorsHeaders(request, shopOrigin) });
}

/**
 * React Router action function for handling POST requests
 */
export async function action({ request }) {
  const shopOrigin = await resolveInstalledShopOrigin(request);
  if (!shopOrigin) return forbidden();

  // Clic sur « Voir le modèle » (envoyé par sendBeacon) → registre des clics
  if (new URL(request.url).searchParams.get("event") === "click") {
    try {
      const body = JSON.parse(await request.text());
      await prisma.clickLog.create({ data: {
        shop: shopDomainFor(new URL(shopOrigin).hostname),
        title: String(body.title || "").slice(0, 200),
        url: String(body.url || "").slice(0, 500),
      } });
    } catch (e) { console.error("[Lina] log clic:", e.message); }
    return new Response(null, { status: 204, headers: getCorsHeaders(request, shopOrigin) });
  }

  return handleChatRequest(request, shopOrigin);
}

function forbidden() {
  return new Response(JSON.stringify({ error: AppConfig.errorMessages.unknownShop }), { status: 403 });
}

/**
 * Handle history fetch requests
 * @param {Request} request - The request object
 * @param {string} conversationId - The conversation ID
 * @returns {Response} JSON response with chat history
 */
async function handleHistoryRequest(request, shopOrigin, conversationId) {
  const messages = await getConversationHistory(conversationId);

  return new Response(JSON.stringify({ messages }), { headers: getCorsHeaders(request, shopOrigin) });
}

/**
 * Handle chat requests (both GET and POST)
 * @param {Request} request - The request object
 * @returns {Response} Server-sent events stream
 */
async function handleChatRequest(request, shopOrigin) {
  try {
    // Get message data from request body
    const body = await request.json();
    const userMessage = body.message;

    // Validate required message
    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: AppConfig.errorMessages.missingMessage }),
        { status: 400, headers: getSseHeaders(shopOrigin) }
      );
    }

    // Only continue conversations this server issued; anything else gets a fresh unguessable id
    const conversationId = await resolveConversationId(body.conversation_id);
    const promptType = body.prompt_type || AppConfig.api.defaultPromptType;

    // Create a stream for the response
    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({
        shopOrigin,
        userMessage,
        conversationId,
        promptType,
        stream
      });
    });

    return new Response(responseStream, {
      headers: getSseHeaders(shopOrigin)
    });
  } catch (error) {
    console.error('Error in chat request handler:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: getCorsHeaders(request, shopOrigin)
    });
  }
}

/**
 * Handle a complete chat session
 * @param {Object} params - Session parameters
 * @param {string} params.shopOrigin - Origin of the installed shop making the request
 * @param {string} params.userMessage - The user's message
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.promptType - The prompt type
 * @param {Object} params.stream - Stream manager for sending responses
 */
async function handleChatSession({
  shopOrigin,
  userMessage,
  conversationId,
  promptType,
  stream
}) {
  // Initialize services
  const claudeService = (process.env.AI_PROVIDER || 'gemini') === 'claude'
    ? createClaudeService()
    : createGeminiService();
  const toolService = createToolService();

  // Client MCP Shopify (outils panier/politiques) — liste des outils mise en cache pour aller vite
  const mcpClient = new MCPClient(shopOrigin, conversationId);

  try {
    // Send conversation ID to client
    stream.sendMessage({ type: 'id', conversation_id: conversationId });

    const cached = mcpToolsCache.get(shopOrigin);
    if (cached && Date.now() - cached.at < MCP_TOOLS_TTL) {
      mcpClient.storefrontTools = cached.tools;
      mcpClient.tools = [...cached.tools];
    } else {
      try {
        const tools = await withTimeout(mcpClient.connectToStorefrontServer(), 4000);
        mcpToolsCache.set(shopOrigin, { at: Date.now(), tools });
      } catch (error) {
        console.warn('MCP indisponible, on continue sans:', error.message);
        mcpToolsCache.set(shopOrigin, { at: Date.now() - MCP_TOOLS_TTL + 60000, tools: [] });
      }
    }
    // Le catalogue est préchargé en parallèle pendant que Gemini réfléchit
    searchCatalog(shopOrigin, {}).catch(() => {});

    // Prepare conversation state
    let conversationHistory = [];
    let productsToDisplay = [];
    let produitsAffiches = false;
    let derniereRecherche = null;

    // Save user message to the database
    await saveMessage(conversationId, 'user', userMessage);

    // Fetch all messages from the database for this conversation
    const dbMessages = await getConversationHistory(conversationId);

    // Format messages for Claude API (on garde seulement les derniers échanges : plus rapide)
    let recent = dbMessages;
    if (recent.length > MAX_HISTORY) {
      recent = recent.slice(-MAX_HISTORY);
      // l'historique doit commencer par un vrai message texte de la cliente
      const start = recent.findIndex((m) => m.role === 'user' && !String(m.content).trim().startsWith('['));
      recent = start >= 0 ? recent.slice(start) : dbMessages.slice(-1);
    }
    conversationHistory = recent.map(dbMessage => {
      let content;
      try {
        content = JSON.parse(dbMessage.content);
        // « 42 », « true »… sont du texte de la cliente, pas des blocs : on garde la chaîne
        if (!Array.isArray(content)) content = dbMessage.content;
      } catch (e) {
        content = dbMessage.content;
      }
      return {
        role: dbMessage.role,
        content
      };
    });

    // Clic sur un bouton du déroulé : réponse immédiate, sans attendre l'IA
    const fast = fastReply(conversationHistory, detectLanguage(conversationHistory));
    if (fast) {
      stream.sendMessage({ type: 'chunk', chunk: fast });
      const content = [{ type: 'text', text: fast }];
      await saveMessage(conversationId, 'assistant', JSON.stringify(content));
      stream.sendMessage({ type: 'message_complete' });
      const options = quickRepliesFor(fast, { langue: detectLanguage(conversationHistory), dernierMessage: userMessage });
      if (options.length) stream.sendMessage({ type: 'quick_replies', options });
      stream.sendMessage({ type: 'end_turn' });
      return;
    }

    // Recherche directe (sans IA) quand toutes les infos sont connues : réponse en 1-2 s
    const direct = canSearchDirectly(conversationHistory);
    if (direct) {
      try {
        const langue = detectLanguage(conversationHistory);
        const result = await searchCatalog(shopOrigin, direct);
        logDemand(shopOrigin, direct, result, langue);
        const text = closingText(result, { langue, promoDeja: promoDejaAffichee(conversationHistory) });
        if (text) {
          if (result.products?.length) {
            stream.sendMessage({ type: 'product_results', products: result.products.slice(0, AppConfig.tools.maxProductsToDisplay) });
            stream.sendMessage({ type: 'new_message' });
          }
          stream.sendMessage({ type: 'chunk', chunk: text });
          stream.sendMessage({ type: 'message_complete' });
          const summary = result.products?.length ? `\n[Modèles affichés : ${result.products.map((p) => `${p.title} (${p.couleur_proposee}, ${p.taille_proposee})`).join(' ; ')}]` : '';
          await saveMessage(conversationId, 'assistant', JSON.stringify([{ type: 'text', text: text + summary }]));
          let options = quickRepliesFor(text, { langue, produitsAffiches: !!result.products?.length, dernierMessage: userMessage });
          if (result.rupture && result.autres_couleurs_meme_modele?.length) options = [...result.autres_couleurs_meme_modele, langue === 'darija' ? 'قصة أخرى' : 'Autre coupe'];
          if (options.length) stream.sendMessage({ type: 'quick_replies', options });
          stream.sendMessage({ type: 'end_turn' });
          return;
        }
      } catch (e) { console.warn('[Lina] recherche directe:', e.message); }
    }

    // Execute the conversation stream
    let finalMessage = { role: 'user', content: userMessage };

    while (finalMessage.stop_reason !== "end_turn") {
      finalMessage = await claudeService.streamConversation(
        {
          messages: conversationHistory,
          promptType,
          tools: [catalogTool, ...mcpClient.tools.filter(t => t.name !== 'search_shop_catalog')]
        },
        {
          // Handle text chunks
          onText: (textDelta) => {
            stream.sendMessage({
              type: 'chunk',
              chunk: textDelta
            });
          },

          // Handle complete messages
          onMessage: (message) => {
            conversationHistory.push({
              role: message.role,
              content: message.content
            });

            saveMessage(conversationId, message.role, JSON.stringify(message.content))
              .catch((error) => {
                console.error("Error saving message to database:", error);
              });

            // Send a completion message
            stream.sendMessage({ type: 'message_complete' });
          },

          // Handle tool use requests
          onToolUse: async (content) => {
            const toolName = content.name;
            const toolArgs = content.input;
            const toolUseId = content.id;

            const toolUseMessage = `Calling tool: ${toolName} with arguments: ${JSON.stringify(toolArgs)}`;

            stream.sendMessage({
              type: 'tool_use',
              tool_use_message: toolUseMessage
            });

            // Call the tool (outil catalogue local, ou outils MCP Shopify)
            let toolUseResponse;
            if (toolName === CATALOG_TOOL_NAME) {
              try {
                const result = await searchCatalog(shopOrigin, toolArgs);
                derniereRecherche = result;
                toolUseResponse = { content: [{ type: "text", text: JSON.stringify(result) }] };
                logDemand(shopOrigin, toolArgs, result, detectLanguage(conversationHistory));
              } catch (e) {
                console.error("[Lina] Erreur catalogue:", e);
                toolUseResponse = { error: { type: "tool_error", data: "Catalogue momentanément indisponible. (" + String(e.message).slice(0, 300) + ")" } };
              }
            } else {
              toolUseResponse = await mcpClient.callTool(toolName, toolArgs);
            }

            // Handle tool response based on success/error
            if (toolUseResponse.error) {
              await toolService.handleToolError(
                toolUseResponse,
                toolName,
                toolUseId,
                conversationHistory,
                stream.sendMessage,
                conversationId
              );
            } else {
              await toolService.handleToolSuccess(
                toolUseResponse,
                toolName,
                toolUseId,
                conversationHistory,
                productsToDisplay,
                conversationId
              );
            }

            // Cartes produits affichées tout de suite (photos, prix, lien), avant le texte de Lina
            if (toolName === CATALOG_TOOL_NAME && productsToDisplay.length > 0) {
              produitsAffiches = true;
              stream.sendMessage({ type: 'product_results', products: [...productsToDisplay] });
              productsToDisplay.length = 0;
            }

            // Signal new message to client
            stream.sendMessage({ type: 'new_message' });
          },

          // Handle content block completion
          onContentBlock: (contentBlock) => {
            if (contentBlock.type === 'text') {
              stream.sendMessage({
                type: 'content_block_complete',
                content_block: contentBlock
              });
            }
          }
        }
      );

      // Après une recherche : le texte final est écrit par le code (pas de 2e appel IA = plus rapide)
      if (finalMessage.stop_reason === 'tool_use' && derniereRecherche) {
        const langue = detectLanguage(conversationHistory);
        const text = closingText(derniereRecherche, { langue, promoDeja: promoDejaAffichee(conversationHistory) });
        if (text) {
          stream.sendMessage({ type: 'chunk', chunk: text });
          stream.sendMessage({ type: 'message_complete' });
          const content = [{ type: 'text', text }];
          conversationHistory.push({ role: 'assistant', content });
          saveMessage(conversationId, 'assistant', JSON.stringify(content)).catch(() => {});
          finalMessage = { role: 'assistant', content, stop_reason: 'end_turn' };
        }
      }
    }

    // Tout est enregistré avant de rendre la main (le message suivant voit l'historique complet)
    await flushMessages(conversationId);

    // Boutons de réponse rapide (type, coupe, couleur, taille…) selon la question de Lina
    try {
      const last = finalMessage?.content;
      const lastText = Array.isArray(last) ? last.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : String(last || '');
      const langue = detectLanguage(conversationHistory);
      let options = quickRepliesFor(lastText, { langue, produitsAffiches, dernierMessage: userMessage });
      // Rupture : boutons = les couleurs vraiment disponibles dans sa taille
      if (derniereRecherche?.rupture && derniereRecherche.autres_couleurs_meme_modele?.length) {
        options = [...derniereRecherche.autres_couleurs_meme_modele, langue === 'darija' ? 'قصة أخرى' : 'Autre coupe'];
      }
      if (options.length) stream.sendMessage({ type: 'quick_replies', options });
    } catch (e) { console.warn('[Lina] boutons:', e.message); }

    // Signal end of turn
    stream.sendMessage({ type: 'end_turn' });

    // Send product results if available
    if (productsToDisplay.length > 0) {
      stream.sendMessage({
        type: 'product_results',
        products: productsToDisplay
      });
    }
  } catch (error) {
    // The streaming handler takes care of error handling
    throw error;
  }
}

/** Registre des demandes (rapports) — sans donnée personnelle */
function logDemand(shopOrigin, args, result, langue) {
  if (result.besoin_taille || result.mesure_manquante) return;
  prisma.demandLog.create({ data: {
    shop: shopDomainFor(new URL(shopOrigin).hostname),
    couleur: String(args.couleur || "").toLowerCase().slice(0, 60),
    type: String(args.type || "").toLowerCase().slice(0, 80),
    taille: String(args.taille || "").slice(0, 20),
    exact: !result.rupture,
    nbProposes: result.products.length,
    modeles: result.products.map((p) => p.title).join(" | ").slice(0, 1000),
    langue: langue || "",
  } }).catch((e) => console.error("[Lina] log demande:", e.message));
}

/**
 * Gets CORS headers for the response
 * @param {Request} request - The request object
 * @param {string} shopOrigin - Origin of the installed shop making the request
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(request, shopOrigin) {
  const requestHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Accept";

  return {
    "Access-Control-Allow-Origin": shopOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400" // 24 hours
  };
}

/**
 * Get SSE headers for the response
 * @param {string} shopOrigin - Origin of the installed shop making the request
 * @returns {Object} SSE headers object
 */
function getSseHeaders(shopOrigin) {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": shopOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
    "Access-Control-Allow-Headers": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  };
}
