/**
 * Tool Service
 * Manages tool execution and processing
 */
import { saveMessage } from "../db.server";
import AppConfig from "./config.server";

/**
 * Creates a tool service instance
 * @returns {Object} Tool service with methods for managing tools
 */
export function createToolService() {
  /**
   * Handles a tool error response
   * @param {Object} toolUseResponse - The error response from the tool
   * @param {string} toolName - The name of the tool
   * @param {string} toolUseId - The ID of the tool use request
   * @param {Array} conversationHistory - The conversation history
   * @param {Function} sendMessage - Function to send messages to the client
   * @param {string} conversationId - The conversation ID
   */
  const handleToolError = async (toolUseResponse, toolName, toolUseId, conversationHistory, sendMessage, conversationId) => {
    if (toolUseResponse.error.type === "auth_required") {
      console.log("Auth required for tool:", toolName);
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
      sendMessage({ type: 'auth_required' });
    } else {
      console.log("Tool use error", toolUseResponse.error);
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
    }
  };

  /**
   * Handles a successful tool response
   * @param {Object} toolUseResponse - The response from the tool
   * @param {string} toolName - The name of the tool
   * @param {string} toolUseId - The ID of the tool use request
   * @param {Array} conversationHistory - The conversation history
   * @param {Array} productsToDisplay - Array to add product results to
   * @param {string} conversationId - The conversation ID
   */
  const handleToolSuccess = async (toolUseResponse, toolName, toolUseId, conversationHistory, productsToDisplay, conversationId) => {
    // Check if this is a product search result
    if (toolName === "rechercher_modeles") {
      try {
        const data = JSON.parse(toolUseResponse.content[0].text);
        // On remplace les cartes précédentes par la dernière recherche
        productsToDisplay.length = 0;
        productsToDisplay.push(...(data.products || []).slice(0, data.parcourir ? 40 : AppConfig.tools.maxProductsToDisplay));
      } catch (e) { console.error("Erreur lecture catalogue:", e); }
    } else if (toolName === AppConfig.tools.productSearchName) {
      productsToDisplay.push(...processProductSearchResult(toolUseResponse));
    }

    // Version courte pour l'historique (sans photos ni listes) : réponses de l'IA plus rapides
    let historyContent = toolUseResponse.content;
    if (toolName === "rechercher_modeles") {
      try {
        const d = JSON.parse(toolUseResponse.content[0].text);
        const compact = {
          note: d.note, similaires: d.similaires, saison: d.saison,
          ...(d.rupture ? { rupture: true, autres_couleurs_meme_modele: d.autres_couleurs_meme_modele, autres_modeles_meme_couleur: d.autres_modeles_meme_couleur } : {}),
          ...(d.besoin_taille ? { besoin_taille: true } : {}),
          ...(d.mesure_manquante ? { mesure_manquante: d.mesure_manquante } : {}),
          modeles_affiches: (d.products || []).map((p) => ({
            nom: p.title, prix: p.price, couleur: p.couleur_proposee,
            ...(p.taille_proposee ? { taille: p.taille_proposee } : {}),
            ...(p.taille_conseillee ? { taille_conseillee_selon_mesures: p.taille_conseillee } : {}),
            ...(p.sizes && p.sizes.length ? { tailles: p.sizes.join(",") } : {}),
          })),
        };
        historyContent = [{ type: "text", text: JSON.stringify(compact) }];
      } catch (e) { /* garde l'original */ }
    }
    addToolResultToHistory(conversationHistory, toolUseId, historyContent, conversationId);
  };

  /**
   * Processes product search results
   * @param {Object} toolUseResponse - The response from the tool
   * @returns {Array} Processed product data
   */
  const processProductSearchResult = (toolUseResponse) => {
    try {
      console.log("Processing product search result");
      let products = [];

      if (toolUseResponse.content && toolUseResponse.content.length > 0) {
        const content = toolUseResponse.content[0].text;

        try {
          let responseData;
          if (typeof content === 'object') {
            responseData = content;
          } else if (typeof content === 'string') {
            responseData = JSON.parse(content);
          }

          if (responseData?.products && Array.isArray(responseData.products)) {
            products = responseData.products
              .slice(0, AppConfig.tools.maxProductsToDisplay)
              .map(formatProductData);

            console.log(`Found ${products.length} products to display`);
          }
        } catch (e) {
          console.error("Error parsing product data:", e);
        }
      }

      return products;
    } catch (error) {
      console.error("Error processing product search results:", error);
      return [];
    }
  };

  /**
   * Formats a product data object
   * @param {Object} product - Raw product data
   * @returns {Object} Formatted product data
   */
  const formatProductData = (product) => {
    const price = product.price_range
      ? `${product.price_range.min} DH`
      : (product.variants && product.variants.length > 0
        ? `${product.variants[0].price} DH`
        : '');

    // Tailles / couleurs disponibles (variantes en stock)
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const avail = variants.filter(v => v.available !== false && v.availableForSale !== false);
    const opts = {};
    avail.forEach(v => {
      const list = v.selectedOptions || v.options || [];
      (Array.isArray(list) ? list : []).forEach(o => {
        const n = (o.name || '').toLowerCase(), val = o.value;
        if (!val) return;
        const key = /taille|size/.test(n) ? 'sizes' : /couleur|color|colour/.test(n) ? 'colors' : null;
        if (key) (opts[key] = opts[key] || new Set()).add(val);
      });
    });

    return {
      sizes: opts.sizes ? [...opts.sizes] : [],
      colors: opts.colors ? [...opts.colors] : [],
      in_stock: variants.length ? avail.length > 0 : true,
      id: product.product_id || `product-${Math.random().toString(36).substring(7)}`,
      title: product.title || 'Product',
      price: price,
      image_url: product.image_url || '',
      description: product.description || '',
      url: product.url || ''
    };
  };

  /**
   * Adds a tool result to the conversation history
   * @param {Array} conversationHistory - The conversation history
   * @param {string} toolUseId - The ID of the tool use request
   * @param {string} content - The content of the tool result
   * @param {string} conversationId - The conversation ID
   */
  const addToolResultToHistory = async (conversationHistory, toolUseId, content, conversationId) => {
    const toolResultMessage = {
      role: 'user',
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        content: content
      }]
    };

    // Add to in-memory history
    conversationHistory.push(toolResultMessage);

    // Save to database with special format to indicate tool result
    if (conversationId) {
      try {
        await saveMessage(conversationId, 'user', JSON.stringify(toolResultMessage.content));
      } catch (error) {
        console.error('Error saving tool result to database:', error);
      }
    }
  };

  return {
    handleToolError,
    handleToolSuccess,
    processProductSearchResult,
    addToolResultToHistory
  };
}

export default {
  createToolService
};
