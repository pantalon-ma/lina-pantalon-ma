/**
 * Shop AI Chat - Client-side implementation
 *
 * This module handles the chat interface for the Shopify AI Chat application.
 * It manages the UI interactions, API communication, and message rendering.
 */
(function() {
  'use strict';

  /**
   * Application namespace to prevent global scope pollution
   */
  const ShopAIChat = {
    /**
     * UI-related elements and functionality
     */
    UI: {
      elements: {},
      isMobile: false,

      /**
       * Initialize UI elements and event listeners
       * @param {HTMLElement} container - The main container element
       */
      init: function(container) {
        if (!container) return;

        // Cache DOM elements
        this.elements = {
          container: container,
          chatBubble: container.querySelector('.shop-ai-chat-bubble'),
          chatWindow: container.querySelector('.shop-ai-chat-window'),
          closeButton: container.querySelector('.shop-ai-chat-close'),
          chatInput: container.querySelector('.shop-ai-chat-input input'),
          sendButton: container.querySelector('.shop-ai-chat-send'),
          messagesContainer: container.querySelector('.shop-ai-chat-messages')
        };

        // Detect mobile device
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        // Set up event listeners
        this.setupEventListeners();

        // Fix for iOS Safari viewport height issues
        if (this.isMobile) {
          this.setupMobileViewport();
        }
      },

      /**
       * Set up all event listeners for UI interactions
       */
      setupEventListeners: function() {
        const { chatBubble, closeButton, chatInput, sendButton, messagesContainer } = this.elements;

        // Toggle chat window visibility
        chatBubble.addEventListener('click', () => this.toggleChatWindow());

        // Close chat window
        closeButton.addEventListener('click', () => this.closeChatWindow());

        // Send message when pressing Enter in input
        chatInput.addEventListener('keydown', (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if ((e.key === 'Enter' || e.keyCode === 13) && chatInput.value.trim() !== '') {
            e.preventDefault();
            ShopAIChat.Message.send(chatInput, messagesContainer);

            // On mobile, handle keyboard
            if (this.isMobile) {
              chatInput.blur();
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });

        // Send message when clicking send button
        sendButton.addEventListener('click', () => {
          if (chatInput.value.trim() !== '') {
            ShopAIChat.Message.send(chatInput, messagesContainer);

            // On mobile, focus input after sending
            if (this.isMobile) {
              setTimeout(() => chatInput.focus(), 300);
            }
          }
        });

        // Handle window resize to adjust scrolling
        window.addEventListener('resize', () => this.scrollToBottom());

        // Add global click handler for auth links
        document.addEventListener('click', function(event) {
          if (event.target && event.target.classList.contains('shop-auth-trigger')) {
            event.preventDefault();
            if (window.shopAuthUrl) {
              ShopAIChat.Auth.openAuthPopup(window.shopAuthUrl);
            }
          }
        });
      },

      /**
       * Setup mobile-specific viewport adjustments
       */
      setupMobileViewport: function() {
        const setViewportHeight = () => {
          document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
        };
        window.addEventListener('resize', setViewportHeight);
        setViewportHeight();
      },

      /**
       * Toggle chat window visibility
       */
      toggleChatWindow: function() {
        const { chatWindow, chatInput } = this.elements;

        chatWindow.classList.toggle('active');
        // La bulle « Je vous aide ? » disparaît dès que la cliente ouvre le chat
        const hint = document.querySelector('.lina-hint');
        if (hint) hint.classList.add('lina-hidden');

        if (chatWindow.classList.contains('active')) {
          // On mobile, prevent body scrolling and delay focus
          if (this.isMobile) {
            document.body.classList.add('shop-ai-chat-open');
            setTimeout(() => chatInput.focus(), 500);
          } else {
            chatInput.focus();
          }
          // Always scroll messages to bottom when opening
          this.scrollToBottom();
        } else {
          // Remove body class when closing
          document.body.classList.remove('shop-ai-chat-open');
        }
      },

      /**
       * Close chat window
       */
      closeChatWindow: function() {
        const { chatWindow, chatInput } = this.elements;

        chatWindow.classList.remove('active');

        // On mobile, blur input to hide keyboard and enable body scrolling
        if (this.isMobile) {
          chatInput.blur();
          document.body.classList.remove('shop-ai-chat-open');
        }
      },

      /**
       * Scroll messages container to bottom
       */
      scrollToBottom: function() {
        const { messagesContainer } = this.elements;
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
      },

      /**
       * Show typing indicator in the chat
       */
      showTypingIndicator: function() {
        const { messagesContainer } = this.elements;

        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('shop-ai-typing-indicator');
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(typingIndicator);
        this.scrollToBottom();
      },

      /**
       * Remove typing indicator from the chat
       */
      removeTypingIndicator: function() {
        const { messagesContainer } = this.elements;

        const typingIndicator = messagesContainer.querySelector('.shop-ai-typing-indicator');
        if (typingIndicator) {
          typingIndicator.remove();
        }
      },

      /**
       * Display product results in the chat
       * @param {Array} products - Array of product data objects
       */
      displayProductResults: function(products) {
        const { messagesContainer } = this.elements;

        // Create a wrapper for the product section
        const productSection = document.createElement('div');
        productSection.classList.add('shop-ai-product-section');
        messagesContainer.appendChild(productSection);

        // Add a header for the product results
        const header = document.createElement('div');
        header.classList.add('shop-ai-product-header');
        header.innerHTML = '<h4>Modèles disponibles · الموديلات المتوفرة</h4>';
        productSection.appendChild(header);

        // Create the product grid container
        const productsContainer = document.createElement('div');
        productsContainer.classList.add('shop-ai-product-grid');
        productSection.appendChild(productsContainer);

        if (!products || !Array.isArray(products) || products.length === 0) {
          const noProductsMessage = document.createElement('p');
          noProductsMessage.textContent = "Aucun modèle trouvé";
          noProductsMessage.style.padding = "10px";
          productsContainer.appendChild(noProductsMessage);
        } else {
          products.forEach(product => {
            const productCard = ShopAIChat.Product.createCard(product);
            productsContainer.appendChild(productCard);
          });
        }

        this.scrollToBottom();
      }
    },

    /**
     * Message handling and display functionality
     */
    /**
     * Boutons de réponse rapide (type, coupe, couleur, taille…)
     */
    Quick: {
      WELCOME: ['Classique', 'Casual / Sport', 'كلاسيك', 'كاجوال / سبور'],
      clear: function() {
        document.querySelectorAll('.lina-quick').forEach(function(el) { el.remove(); });
      },
      // Petits pantalons dessinés à côté des coupes : large / droite / étroite
      cutIcon: function(label) {
        const l = label.toLowerCase();
        const svg = function(d) { return '<svg class="lina-cut-ico" viewBox="0 0 24 32" width="16" height="22" aria-hidden="true"><path d="' + d + '" fill="currentColor"/></svg>'; };
        if (/^large$|واسع/.test(l)) return svg('M7 1h10l.6 3H17l6 27h-8.5L12 12l-2.5 19H1L7 4H6.4z');
        if (/^droite?$|ديريكت/.test(l)) return svg('M6 1h12l.6 3H18l.5 27h-6L12 12l-.5 19h-6L6 4h-.6z');
        if (/^[ée]troite?$|ضيق/.test(l)) return svg('M6 1h12l.6 3H18l-2.5 27h-3L12 12l-.5 19h-3L6 4h-.6z');
        return '';
      },

      // Petit emoji à côté des types : classique / casual / sport
      typeIcon: function(label) {
        const l = label.toLowerCase();
        const e = function(x) { return '<span class="lina-type-ico" aria-hidden="true">' + x + '</span>'; };
        if (/^classique$|كلاسيك/.test(l)) return e('💼');
        if (/casual|sport|كاجوال|سبور/.test(l)) return e('👖👟');
        if (/^hiver$|الشتا/.test(l)) return e('❄️');
        if (/^demi-saison$|نص الموسم/.test(l)) return e('🍂');
        if (/^[ée]t[ée]$|الصيف/.test(l)) return e('☀️');
        return '';
      },

      // Boutons de couleur affichés dans leur couleur
      COLORS: [
        [/bleu marine|marine|مارين|كحلي/i, '#1F2A44'], [/bleu jean|jean/i, '#4A6F9C'], [/bleu ciel|ciel/i, '#9CC6E8'], [/bleu roi/i, '#2347A6'], [/turquoise/i, '#2BB3B1'], [/canard|p[ée]trole/i, '#1F5F6B'], [/bleu|زرق/i, '#3B6BB5'],
        [/noir|كحل/i, '#111111'], [/blanc|بيض/i, '#FFFFFF', '#222', '#CCCCCC'], [/beige clair/i, '#EADBC4', '#3a2a1a'], [/beige fonc/i, '#BFA27E'], [/beige|بيج/i, '#D9C3A0', '#3a2a1a'], [/camel|كاميل/i, '#C19A6B'],
        [/marron chocolat|chocolat/i, '#4E2E1E'], [/brique/i, '#9C4A2F'], [/tabac/i, '#8B5A2B'], [/marron|قهوي/i, '#6B4226'],
        [/bordeaux|grenat|بوردو/i, '#6B1F2E'], [/rouge|حمر/i, '#C62828'], [/vieux rose/i, '#C08081'], [/rose poudr|rose clair/i, '#F3C6CF', '#5a2a35'], [/rose fonc/i, '#C2185B'], [/rose|وردي/i, '#E991A8', '#4a1f2b'],
        [/violet|mauve|موف/i, '#7E57C2'], [/vert olive|olive|زيتوني/i, '#6B7A3A'], [/vert sauge|sauge/i, '#9CAF88', '#22301c'], [/vert eau/i, '#9ED9C8', '#1c3a32'], [/vert fonc/i, '#1E4D2B'], [/vert|خضر/i, '#2E7D32'],
        [/gris clair/i, '#C9C9C9', '#222'], [/gris fonc|charbon/i, '#424242'], [/gris|رمادي/i, '#8A8A8A'], [/l[ée]opard|نمر/i, 'repeating-radial-gradient(circle at 30% 40%, #3b2412 0 3px, #c8964f 3px 9px)']
      ],
      colorFor: function(label) {
        for (const row of this.COLORS) {
          if (row[0].test(label)) {
            const bg = row[1];
            let fg = row[2];
            if (!fg) {
              const m = /^#([0-9a-f]{6})$/i.exec(bg);
              if (m) { const n = parseInt(m[1], 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)); fg = l > 160 ? '#222' : '#fff'; }
              else fg = '#fff';
            }
            return { bg: bg, fg: fg, border: row[3] };
          }
        }
        return null;
      },
      show: function(options, messagesContainer) {
        this.clear();
        if (!options || !options.length) return;
        const box = document.createElement('div');
        box.className = 'lina-quick';
        options.forEach(function(label) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'lina-quick-btn';
          b.textContent = label;
          if (/[\u0600-\u06FF]/.test(label)) b.dir = 'rtl';
          const icon = ShopAIChat.Quick.cutIcon(label) || ShopAIChat.Quick.typeIcon(label);
          if (icon) {
            b.classList.add('lina-quick-cut');
            b.innerHTML = icon + '<span>' + label + '</span>';
          }
          const c = ShopAIChat.Quick.colorFor(label);
          if (c) {
            b.classList.add('lina-quick-color');
            b.style.setProperty('background', c.bg, 'important');
            b.style.setProperty('color', c.fg, 'important');
            b.style.setProperty('border-color', c.border || c.bg, 'important');
          }
          b.addEventListener('click', function() {
            const input = ShopAIChat.UI.elements.chatInput;
            input.value = label;
            ShopAIChat.Message.send(input, messagesContainer);
          });
          box.appendChild(b);
        });
        messagesContainer.appendChild(box);
        ShopAIChat.UI.scrollToBottom();
      }
    },

    Message: {
      /**
       * Send a message to the API
       * @param {HTMLInputElement} chatInput - The input element
       * @param {HTMLElement} messagesContainer - The messages container
       */
      send: async function(chatInput, messagesContainer) {
        const userMessage = chatInput.value.trim();
        const conversationId = sessionStorage.getItem('shopAiConversationId');
        ShopAIChat.Quick.clear();

        // Add user message to chat
        this.add(userMessage, 'user', messagesContainer);

        // Clear input
        chatInput.value = '';

        // Show typing indicator
        ShopAIChat.UI.showTypingIndicator();

        try {
          ShopAIChat.API.streamResponse(userMessage, conversationId, messagesContainer);
        } catch (error) {
          console.error('Error communicating with Claude API:', error);
          ShopAIChat.UI.removeTypingIndicator();
          this.add("Sorry, I couldn't process your request at the moment. Please try again later.", 'assistant', messagesContainer);
        }
      },

      /**
       * Add a message to the chat
       * @param {string} text - Message content
       * @param {string} sender - Message sender ('user' or 'assistant')
       * @param {HTMLElement} messagesContainer - The messages container
       * @returns {HTMLElement} The created message element
       */
      add: function(text, sender, messagesContainer) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('shop-ai-message', sender);

        if (sender === 'assistant') {
          messageElement.dataset.rawText = text;
          ShopAIChat.Formatting.formatMessageContent(messageElement);
        } else {
          messageElement.textContent = text;
        }

        messagesContainer.appendChild(messageElement);
        ShopAIChat.UI.scrollToBottom();

        return messageElement;
      },

      /**
       * Add a tool use message to the chat with expandable arguments
       * @param {string} toolMessage - Tool use message content
       * @param {HTMLElement} messagesContainer - The messages container
       */
      addToolUse: function(toolMessage, messagesContainer) {
        // Parse the tool message to extract tool name and arguments
        const match = toolMessage.match(/Calling tool: (\w+) with arguments: (.+)/);
        if (!match) {
          // Fallback for unexpected format
          const toolUseElement = document.createElement('div');
          toolUseElement.classList.add('shop-ai-message', 'tool-use');
          toolUseElement.textContent = toolMessage;
          messagesContainer.appendChild(toolUseElement);
          ShopAIChat.UI.scrollToBottom();
          return;
        }

        const toolName = match[1];
        const argsString = match[2];

        // Create the main tool use element
        const toolUseElement = document.createElement('div');
        toolUseElement.classList.add('shop-ai-message', 'tool-use');

        // Create the header (always visible)
        const headerElement = document.createElement('div');
        headerElement.classList.add('shop-ai-tool-header');

        const toolText = document.createElement('span');
        toolText.classList.add('shop-ai-tool-text');
        toolText.textContent = `Calling tool: ${toolName}`;

        const toggleElement = document.createElement('span');
        toggleElement.classList.add('shop-ai-tool-toggle');
        toggleElement.textContent = '[+]';

        headerElement.appendChild(toolText);
        headerElement.appendChild(toggleElement);

        // Create the arguments section (initially hidden)
        const argsElement = document.createElement('div');
        argsElement.classList.add('shop-ai-tool-args');

        try {
          // Try to format JSON arguments nicely
          const parsedArgs = JSON.parse(argsString);
          argsElement.textContent = JSON.stringify(parsedArgs, null, 2);
        } catch (e) {
          // If not valid JSON, just show as-is
          argsElement.textContent = argsString;
        }

        // Add click handler to toggle arguments visibility
        headerElement.addEventListener('click', function() {
          const isExpanded = argsElement.classList.contains('expanded');
          if (isExpanded) {
            argsElement.classList.remove('expanded');
            toggleElement.textContent = '[+]';
          } else {
            argsElement.classList.add('expanded');
            toggleElement.textContent = '[-]';
          }
        });

        // Assemble the complete element
        toolUseElement.appendChild(headerElement);
        toolUseElement.appendChild(argsElement);

        messagesContainer.appendChild(toolUseElement);
        ShopAIChat.UI.scrollToBottom();
      }
    },

    /**
     * Text formatting and markdown handling
     */
    Formatting: {
      /**
       * Format message content with markdown and links
       * @param {HTMLElement} element - The element to format
       */
      formatMessageContent: function(element) {
        if (!element || !element.dataset.rawText) return;

        const rawText = element.dataset.rawText;

        // Process the text with various Markdown features
        let processedText = rawText;

        // Process Markdown links
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        processedText = processedText.replace(markdownLinkRegex, (match, text, url) => {
          // Check if it's an auth URL
          if (url.includes('shopify.com/authentication') &&
             (url.includes('oauth/authorize') || url.includes('authentication'))) {
            // Store the auth URL in a global variable for later use - this avoids issues with onclick handlers
            window.shopAuthUrl = url;
            // Just return normal link that will be handled by the document click handler
            return '<a href="#auth" class="shop-auth-trigger">' + text + '</a>';
          }
          // Lien WhatsApp : gros bouton vert avec icône et numéro
          else if (url.includes('wa.me') || url.includes('whatsapp')) {
            const num = (url.match(/wa\.me\/(\d+)/) || [])[1] || '212703200695';
            const local = '0' + num.replace(/^212/, '');
            const pretty = local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
            return '<a href="https://wa.me/' + num + '" target="_blank" rel="noopener noreferrer" class="lina-wa-btn">' +
              '<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><path fill="#fff" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.2c1.9 1 4 1.6 6.1 1.6 7 0 12.7-5.7 12.7-12.7S23 3 16 3zm0 23.1c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-4.1 1.3 1.3-4-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.7C5.4 9.8 10.2 5 16 5s10.6 4.8 10.6 10.6S21.8 26.1 16 26.1zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.4z"/></svg>' +
              '<span>' + text + '<br><small>' + pretty + '</small></span></a>';
          }
          // If it's a checkout link, replace the text
          else if (url.includes('/cart') || url.includes('checkout')) {
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">click here to proceed to checkout</a>';
          } else {
            // For normal links, preserve the original text
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
          }
        });

        // Convert text to HTML with proper list handling
        processedText = this.convertMarkdownToHtml(processedText);

        // Apply the formatted HTML
        element.innerHTML = processedText;
      },

      /**
       * Convert Markdown text to HTML with list support
       * @param {string} text - Markdown text to convert
       * @returns {string} HTML content
       */
      convertMarkdownToHtml: function(text) {
        text = text.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
        const lines = text.split('\n');
        let currentList = null;
        let listItems = [];
        let htmlContent = '';
        let startNumber = 1;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const unorderedMatch = line.match(/^\s*([-*])\s+(.*)/);
          const orderedMatch = line.match(/^\s*(\d+)[\.)]\s+(.*)/);

          if (unorderedMatch) {
            if (currentList !== 'ul') {
              if (currentList === 'ol') {
                htmlContent += `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
                listItems = [];
              }
              currentList = 'ul';
            }
            listItems.push('<li>' + unorderedMatch[2] + '</li>');
          } else if (orderedMatch) {
            if (currentList !== 'ol') {
              if (currentList === 'ul') {
                htmlContent += '<ul>' + listItems.join('') + '</ul>';
                listItems = [];
              }
              currentList = 'ol';
              startNumber = parseInt(orderedMatch[1], 10);
            }
            listItems.push('<li>' + orderedMatch[2] + '</li>');
          } else {
            if (currentList) {
              htmlContent += currentList === 'ul'
                ? '<ul>' + listItems.join('') + '</ul>'
                : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
              listItems = [];
              currentList = null;
            }

            if (line.trim() === '') {
              htmlContent += '<br>';
            } else {
              htmlContent += '<p>' + line + '</p>';
            }
          }
        }

        if (currentList) {
          htmlContent += currentList === 'ul'
            ? '<ul>' + listItems.join('') + '</ul>'
            : `<ol start="${startNumber}">` + listItems.join('') + '</ol>';
        }

        htmlContent = htmlContent.replace(/<\/p><p>/g, '</p>\n<p>');
        return htmlContent;
      }
    },

    /**
     * API communication and data handling
     */
    API: {
      CHAT_URL: 'https://lina-pantalon-ma.onrender.com/chat',

      /**
       * Stream a response from the API
       * @param {string} userMessage - User's message text
       * @param {string} conversationId - Conversation ID for context
       * @param {HTMLElement} messagesContainer - The messages container
       */
      streamResponse: async function(userMessage, conversationId, messagesContainer) {
        let currentMessageElement = null;

        try {
          const promptType = window.shopChatConfig?.promptType || "pantalonMa";
          const requestBody = JSON.stringify({
            message: userMessage,
            conversation_id: conversationId,
            prompt_type: promptType
          });

          const streamUrl = this.CHAT_URL;

          const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream'
            },
            body: requestBody
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // Create initial message element
          let messageElement = document.createElement('div');
          messageElement.classList.add('shop-ai-message', 'assistant');
          messageElement.textContent = '';
          messageElement.dataset.rawText = '';
          messagesContainer.appendChild(messageElement);
          currentMessageElement = messageElement;

          // Process the stream
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.handleStreamEvent(data, currentMessageElement, messagesContainer, userMessage,
                    (newElement) => { currentMessageElement = newElement; });
                } catch (e) {
                  console.error('Error parsing event data:', e, line);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in streaming:', error);
          ShopAIChat.UI.removeTypingIndicator();
          ShopAIChat.Message.add("Désolée, je n'ai pas pu répondre. Réessayez dans un instant.",
            'assistant', messagesContainer);
        }
      },

      /**
       * Handle stream events from the API
       * @param {Object} data - Event data
       * @param {HTMLElement} currentMessageElement - Current message element being updated
       * @param {HTMLElement} messagesContainer - The messages container
       * @param {string} userMessage - The original user message
       * @param {Function} updateCurrentElement - Callback to update the current element reference
       */
      handleStreamEvent: function(data, currentMessageElement, messagesContainer, userMessage, updateCurrentElement) {
        switch (data.type) {
          case 'id':
            if (data.conversation_id) {
              sessionStorage.setItem('shopAiConversationId', data.conversation_id);
            }
            break;

          case 'chunk':
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.dataset.rawText += data.chunk;
            currentMessageElement.textContent = currentMessageElement.dataset.rawText;
            ShopAIChat.UI.scrollToBottom();
            break;

          case 'message_complete':
            ShopAIChat.UI.removeTypingIndicator();
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            ShopAIChat.UI.scrollToBottom();
            break;

          case 'end_turn':
            ShopAIChat.UI.removeTypingIndicator();
            break;

          case 'error':
            console.error('Stream error:', data.error);
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.textContent = "Désolée, je n'ai pas pu répondre. Réessayez dans un instant.";
            break;

          case 'rate_limit_exceeded':
            console.error('Rate limit exceeded:', data.error);
            ShopAIChat.UI.removeTypingIndicator();
            currentMessageElement.textContent = "Beaucoup de demandes en ce moment, réessayez dans un instant.";
            break;

          case 'auth_required':
            // Save the last user message for resuming after authentication
            sessionStorage.setItem('shopAiLastMessage', userMessage || '');
            break;

          case 'product_results':
            ShopAIChat.UI.displayProductResults(data.products);
            break;

          case 'quick_replies':
            ShopAIChat.Quick.show(data.options, messagesContainer);
            break;

          case 'tool_use':
            // Les appels d'outils techniques ne sont pas montrés aux clientes
            if (false && data.tool_use_message) {
              ShopAIChat.Message.addToolUse(data.tool_use_message, messagesContainer);
            }
            break;

          case 'new_message':
            ShopAIChat.Formatting.formatMessageContent(currentMessageElement);
            ShopAIChat.UI.showTypingIndicator();

            // Create new message element for the next response
            const newMessageElement = document.createElement('div');
            newMessageElement.classList.add('shop-ai-message', 'assistant');
            newMessageElement.textContent = '';
            newMessageElement.dataset.rawText = '';
            messagesContainer.appendChild(newMessageElement);

            // Update the current element reference
            updateCurrentElement(newMessageElement);
            break;

          case 'content_block_complete':
            ShopAIChat.UI.showTypingIndicator();
            break;
        }
      },

      /**
       * Fetch chat history from the server
       * @param {string} conversationId - Conversation ID
       * @param {HTMLElement} messagesContainer - The messages container
       */
      fetchChatHistory: async function(conversationId, messagesContainer) {
        try {
          // Show a loading message
          const loadingMessage = document.createElement('div');
          loadingMessage.classList.add('shop-ai-message', 'assistant');
          loadingMessage.textContent = "Chargement de la conversation…";
          messagesContainer.appendChild(loadingMessage);

          // Fetch history from the server
          const historyUrl = `${this.CHAT_URL}?history=true&conversation_id=${encodeURIComponent(conversationId)}`;
          console.log('Fetching history from:', historyUrl);

          const response = await fetch(historyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            mode: 'cors'
          });

          if (!response.ok) {
            console.error('History fetch failed:', response.status, response.statusText);
            throw new Error('Failed to fetch chat history: ' + response.status);
          }

          const data = await response.json();

          // Remove loading message
          messagesContainer.removeChild(loadingMessage);

          // No messages, show welcome message
          if (!data.messages || data.messages.length === 0) {
            const welcomeMessage = "Bonjour 👋 Je suis Lina, votre conseillère pantalon.ma.\nالسلام 👋 أنا لينا، غادي نعاونك تلقاي السروال اللي يعجبك!\n\nQuel type de pantalon : classique ou casual / sport ?\nأشمن نوع: كلاسيك ولا كاجوال / سبور؟";
            ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);
            ShopAIChat.Quick.show(ShopAIChat.Quick.WELCOME, messagesContainer);
            return;
          }

          // Add messages to the UI - filter out tool results
          data.messages.forEach(message => {
            try {
              const messageContents = JSON.parse(message.content);
              for (const contentBlock of messageContents) {
                if (contentBlock.type === 'text') {
                  ShopAIChat.Message.add(contentBlock.text, message.role, messagesContainer);
                }
              }
            } catch (e) {
              ShopAIChat.Message.add(message.content, message.role, messagesContainer);
            }
          });

          // Scroll to bottom
          ShopAIChat.UI.scrollToBottom();

        } catch (error) {
          console.error('Error fetching chat history:', error);

          // Remove loading message if it exists
          const loadingMessage = messagesContainer.querySelector('.shop-ai-message.assistant');
          if (loadingMessage && loadingMessage.textContent === "Chargement de la conversation…") {
            messagesContainer.removeChild(loadingMessage);
          }

          // Show error and welcome message
          const welcomeMessage = "Bonjour 👋 Je suis Lina, votre conseillère pantalon.ma.\nالسلام 👋 أنا لينا، غادي نعاونك تلقاي السروال اللي يعجبك!\n\nQuel type de pantalon : classique ou casual / sport ?\nأشمن نوع: كلاسيك ولا كاجوال / سبور؟";
          ShopAIChat.Message.add(welcomeMessage, 'assistant', messagesContainer);
            ShopAIChat.Quick.show(ShopAIChat.Quick.WELCOME, messagesContainer);

          // Clear the conversation ID since we couldn't fetch this conversation
          sessionStorage.removeItem('shopAiConversationId');
        }
      }
    },

    /**
     * Authentication-related functionality
     */
    Auth: {
      /**
       * Opens an authentication popup window
       * @param {string|HTMLElement} authUrlOrElement - The auth URL or link element that was clicked
       */
      openAuthPopup: function(authUrlOrElement) {
        let authUrl;
        if (typeof authUrlOrElement === 'string') {
          // If a string URL was passed directly
          authUrl = authUrlOrElement;
        } else {
          // If an element was passed
          authUrl = authUrlOrElement.getAttribute('data-auth-url');
          if (!authUrl) {
            console.error('No auth URL found in element');
            return;
          }
        }

        // Open the popup window centered in the screen
        const width = 600;
        const height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;

        const popup = window.open(
          authUrl,
          'ShopifyAuth',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        // Focus the popup window
        if (popup) {
          popup.focus();
        } else {
          // If popup was blocked, show a message
          alert('Autorisez les fenêtres pop-up pour vous connecter.');
        }

        const messagesContainer = document.querySelector('.shop-ai-chat-messages');
        ShopAIChat.Message.add("Authentication in progress. Please complete the process in the popup window.",
          'assistant', messagesContainer);

        this.listenForAuthComplete(messagesContainer);
      },

      /**
       * Waits for the auth popup to hand back the re-keyed conversation id, then resumes.
       * @param {HTMLElement} messagesContainer - The messages container
       */
      listenForAuthComplete: function(messagesContainer) {
        const appOrigin = new URL(ShopAIChat.API.CHAT_URL).origin;

        const onMessage = (event) => {
          if (event.origin !== appOrigin) return;
          if (!event.data || event.data.type !== 'shop-ai-auth-complete') return;

          window.removeEventListener('message', onMessage);

          const conversationId = event.data.conversation_id;
          sessionStorage.setItem('shopAiConversationId', conversationId);

          const message = sessionStorage.getItem('shopAiLastMessage');
          if (!message) return;
          sessionStorage.removeItem('shopAiLastMessage');

          ShopAIChat.Message.add("Authorization successful! I'm now continuing with your request.",
            'assistant', messagesContainer);
          ShopAIChat.API.streamResponse(message, conversationId, messagesContainer);
          ShopAIChat.UI.showTypingIndicator();
        };

        window.addEventListener('message', onMessage);
      }
    },

    /**
     * Product-related functionality
     */
    Product: {
      /**
       * Create a product card element
       * @param {Object} product - Product data
       * @returns {HTMLElement} Product card element
       */
      createCard: function(product) {
        const card = document.createElement('div');
        card.classList.add('shop-ai-product-card');

        // Create image container
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('shop-ai-product-image');

        // Add product image or placeholder
        const image = document.createElement('img');
        image.src = product.image_url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
        image.alt = product.title;
        image.onerror = function() {
          // If image fails to load, use a fallback placeholder
          this.src = 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
        };
        if (product.url) {
          const imgLink = document.createElement('a');
          imgLink.href = product.url; imgLink.target = '_blank';
          imgLink.appendChild(image);
          imageContainer.appendChild(imgLink);
        } else {
          imageContainer.appendChild(image);
        }
        card.appendChild(imageContainer);

        // Add product info
        const info = document.createElement('div');
        info.classList.add('shop-ai-product-info');

        // Add product title
        const title = document.createElement('h3');
        title.classList.add('shop-ai-product-title');
        title.textContent = product.title.replace(/^Pantalon Femme - /, '');

        // If product has a URL, make the title a link
        if (product.url) {
          const titleLink = document.createElement('a');
          titleLink.href = product.url;
          titleLink.target = '_blank';
          titleLink.textContent = product.title.replace(/^Pantalon Femme - /, '');
          title.textContent = '';
          title.appendChild(titleLink);
        }

        info.appendChild(title);

        // Add product price
        const price = document.createElement('p');
        price.classList.add('shop-ai-product-price');
        price.textContent = product.price;
        info.appendChild(price);

        // Tailles et couleurs disponibles
        const meta = [];
        if (product.couleur_proposee) meta.push('Couleur : ' + product.couleur_proposee.replace(/-/g, ' '));
        if (product.taille_proposee) meta.push('Taille : ' + product.taille_proposee.split('-')[0] + ' ✓ disponible');
        if (product.colors && product.colors.length > 1) meta.push('Autres couleurs : ' + product.colors.length);
        meta.forEach(t => {
          const el = document.createElement('p');
          el.classList.add('shop-ai-product-meta');
          el.textContent = t;
          info.appendChild(el);
        });

        const trackClick = function() {
          try {
            navigator.sendBeacon(ShopAIChat.API.CHAT_URL + '?event=click',
              new Blob([JSON.stringify({ title: product.title, url: product.url })], { type: 'text/plain' }));
          } catch (e) {}
        };
        card.addEventListener('click', function(ev) { if (ev.target.closest('a')) trackClick(); });

        // Bouton « Voir le modèle » (lien direct vers la page produit, bonne couleur/taille)
        if (product.url) {
          const button = document.createElement('a');
          button.classList.add('shop-ai-add-to-cart');
          button.href = product.url;
          button.target = '_blank';
          button.textContent = 'Voir le modèle';
          button.style.display = 'inline-block';
          button.style.textAlign = 'center';
          button.style.textDecoration = 'none';
          info.appendChild(button);
        }

        card.appendChild(info);

        return card;
      }
    },

    /**
     * Initialize the chat application
     */
    init: function() {
      // Initialize UI
      const container = document.querySelector('.shop-ai-chat-container');
      if (!container) return;

      this.UI.init(container);

      // Réveille le serveur de Lina dès l'arrivée sur le site (avant le 1er message)
      try { fetch('https://lina-pantalon-ma.onrender.com/healthz', { mode: 'no-cors', cache: 'no-store' }).catch(function() {}); } catch (e) {}

      // Check for existing conversation
      const conversationId = sessionStorage.getItem('shopAiConversationId');

      if (conversationId) {
        // Fetch conversation history
        this.API.fetchChatHistory(conversationId, this.UI.elements.messagesContainer);
      } else {
        // No previous conversation, show welcome message
        const welcomeMessage = "Bonjour 👋 Je suis Lina, votre conseillère pantalon.ma.\nالسلام 👋 أنا لينا، غادي نعاونك تلقاي السروال اللي يعجبك!\n\nQuel type de pantalon : classique ou casual / sport ?\nأشمن نوع: كلاسيك ولا كاجوال / سبور؟";
        this.Message.add(welcomeMessage, 'assistant', this.UI.elements.messagesContainer);
        this.Quick.show(this.Quick.WELCOME, this.UI.elements.messagesContainer);
      }
    }
  };

  // Initialize the application when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    ShopAIChat.init();
  });
})();
