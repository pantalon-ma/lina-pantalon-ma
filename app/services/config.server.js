/**
 * Configuration Service
 * Centralizes all configuration values for the chat service
 */

export const AppConfig = {
  // API Configuration
  api: {
    defaultModel: (process.env.AI_PROVIDER || 'gemini') === 'claude'
      ? (process.env.CLAUDE_MODEL || 'claude-haiku-5-5')
      : (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'),
    maxTokens: 2000,
    defaultPromptType: 'pantalonMa',
  },

  // Error Message Templates
  errorMessages: {
    missingMessage: "Message is required",
    apiUnsupported: "This endpoint only supports server-sent events (SSE) requests or history requests.",
    unknownShop: "Origin does not match an installed shop",
    authFailed: "Authentication failed with Claude API",
    apiKeyError: "Please check your API key in environment variables",
    rateLimitExceeded: "Rate limit exceeded",
    rateLimitDetails: "Please try again later",
    genericError: "Failed to get response from Claude"
  },

  // Tool Configuration
  tools: {
    productSearchName: "search_shop_catalog",
    maxProductsToDisplay: 4
  }
};

export default AppConfig;
