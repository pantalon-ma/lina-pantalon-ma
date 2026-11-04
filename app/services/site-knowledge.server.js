// Lina relit régulièrement les pages du site (FAQ, CGV, À propos, Contact) pour rester à jour.
// Le texte est gardé en mémoire 12 h et rafraîchi en arrière-plan : aucune attente pour la cliente.
const ORIGIN = process.env.LINA_SHOP_ORIGIN || "https://pantalon.ma";
const PAGES = [
  ["FAQ", "/pages/faq"],
  ["Conditions générales de vente", "/pages/methodes-de-paiement"],
  ["Contact et point de vente", "/pages/contactez-nous"],
  ["À propos", "/pages/a-propos-de-nous"],
];
const TTL = 12 * 3600 * 1000;
const MAX_PER_PAGE = 3500;
let cache = { at: 0, text: "" };
let loading = null;

export function htmlToText(html) {
  let h = String(html || "");
  const main = h.match(/<main[\s\S]*?<\/main>/i);
  if (main) h = main[0];
  return h
    .replace(/<(script|style|noscript|svg|header|footer|nav|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr|\/summary|\/details)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n")
    .trim();
}

async function refresh() {
  const parts = [];
  for (const [nom, path] of PAGES) {
    try {
      const res = await fetch(ORIGIN + path, { headers: { "User-Agent": "Lina-pantalon.ma/1.0" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const txt = htmlToText(await res.text()).slice(0, MAX_PER_PAGE);
      if (txt.length > 40) parts.push(`### ${nom}\n${txt}`);
    } catch (e) { console.warn("[Lina] lecture page", path, e.message); }
  }
  if (parts.length) cache = { at: Date.now(), text: parts.join("\n\n") };
  else cache.at = Date.now() - TTL + 15 * 60 * 1000; // échec : on réessaie dans 15 min
  return cache.text;
}

/** Texte à ajouter au prompt (jamais bloquant : renvoie la dernière version connue) */
export function siteKnowledge() {
  if (Date.now() - cache.at > TTL && !loading) loading = refresh().finally(() => { loading = null; });
  if (!cache.text) return "";
  return "\n\nINFOS DU SITE pantalon.ma (relues automatiquement sur le site, à jour) :\n" +
    "Utilise-les pour répondre aux questions sur la boutique (livraison, paiement, échange, retour, contact, adresse du point de vente…). " +
    "Si une info du site contredit les INFOS BOUTIQUE ci-dessus, suis l'info du site. Ne recopie pas de longs passages : réponds en 1-2 phrases.\n" +
    cache.text;
}
export const warmSiteKnowledge = () => { if (!cache.text && !loading) loading = refresh().finally(() => { loading = null; }); };
