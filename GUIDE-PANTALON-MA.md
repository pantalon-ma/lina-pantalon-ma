# Conseillère IA pantalon.ma — mise en ligne

Code adapté du modèle officiel Shopify (shop-chat-agent) :
- Assistante « Lina », en français / darija, prompt dans `app/prompts/prompts.json`
- Cartes produit avec photo, prix en DH, couleurs et tailles dispo, lien et « Ajouter au panier »
- Stock lu en direct via le Storefront MCP de Shopify (rien à synchroniser)
- Infos boutique : livraison 24-48h, retour 7 jours, offre pack, produits (DC)

## Étapes
1. Clé API Gemini (gratuite) : aistudio.google.com/apikey → « Create API key » avec votre compte Google.
   (Pour passer sur Claude plus tard : AI_PROVIDER=claude et CLAUDE_API_KEY dans .env.)
2. Compte Shopify Partners : partners.shopify.com (gratuit).
3. Sur votre ordinateur (Node.js 20+ installé) :
   npm install -g @shopify/cli@latest
   npm install
   cp .env.example .env   → mettre GEMINI_API_KEY=votre_clé
   shopify app dev        → choisir « créer une nouvelle app », puis la boutique pantalon.ma
4. Hébergement permanent (Render, Fly.io ou Railway) : déployer ce dossier (Dockerfile fourni),
   renseigner les variables AI_PROVIDER=gemini, GEMINI_API_KEY, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL,
   puis `shopify app deploy`.
5. Shopify admin → Boutique en ligne → Thèmes → Personnaliser → Intégrations d'app
   → activer « Conseillère IA pantalon.ma », choisir la couleur, enregistrer.

## Pour que les conseils de taille soient justes
Ajouter le guide des tailles (tour de taille / hanches en cm par taille) dans la description
de chaque produit, ou nous le donner pour l'intégrer directement au prompt.
