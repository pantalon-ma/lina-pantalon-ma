/**
 * Questions des clientes classées par thème (pour la FAQ du site).
 * On ignore les réponses courtes du déroulé (boutons, tailles, couleurs…).
 */
export const FAQ_THEMES = [
  ["Paiement (à la livraison, carte, virement)", /pai|payer|carte|virement|cash|esp[èe]ce|خلاص|نخلص|كاش|فيرمو/i],
  ["Échange / retour / remboursement", /[ée]chang|retour|rembours|rendre|تبدال|تبديل|نبدل|نرجع|رجوع/i],
  ["Ouvrir le colis / essayer", /ouvr|essa|colis|نحل|نجرب|كولي|تجربة/i],
  ["Livraison (délai, villes, frais)", /livr|d[ée]lai|exp[ée]di|re[çc]oi|arriv|ville|توصيل|ليفري|ليفريزون|كيوصل|توصل|شحال من نهار/i],
  ["Taille / guide des tailles / mesures", /taille|mesure|guide|hanche|longueur|court|long|serr|المقاس|القياس|طويل|قصير|الوراك/i],
  ["Prix / promotions / réductions", /prix|promo|r[ée]duc|remise|code|soldes|cher|ثمن|بشحال|تخفيض|بروموسيون|الصولد/i],
  ["Stock / réassort / disponibilité", /stock|dispo|rupture|r[ée]assort|revien|bient[ôo]t|كاين|متوفر|غيرجع/i],
  ["Matière / qualité / entretien", /mati[èe]re|tissu|qualit|lavage|laver|repass|extensible|[ée]lasti|ثوب|القماش|الجودة|كيتمد/i],
  ["Commande (suivi, modifier, annuler)", /command|suivi|annul|modifi|كوموند|الطلب|نلغي/i],
  ["Contact / boutique physique / WhatsApp", /contact|whats|t[ée]l[ée]phone|num[ée]ro|magasin|boutique|adresse|واتساب|نمرة|المحل|فين كاينين/i],
];

const SKIP = /^(classique|casual|sport|large|droite?|[ée]troite?|noir|beige|bleu|gris|marron|bordeaux|vert|blanc|rose|camel|rouge|violet|hiver|[ée]t[ée]|demi-saison|peu importe|autres? couleurs?|autre coupe|\d{2}|oui|non|ok|merci)\b/i;

export function themeOf(text) {
  for (const [label, re] of FAQ_THEMES) if (re.test(text)) return label;
  return null;
}

/** Garde les vraies questions des clientes (pas les clics de boutons) */
export function isRealQuestion(text) {
  const t = String(text || "").trim();
  if (t.length < 8 || t.startsWith("[")) return false;
  if (SKIP.test(t) && t.length < 25) return false;
  return /[?؟]/.test(t) || /^(est-ce|comment|combien|quand|o[uù]|pourquoi|quel|vous|je peux|on peux|wach|ach|fin|chhal|kifach|واش|كيفاش|شحال|فين|علاش|امتى|اش)/i.test(t) || themeOf(t) !== null;
}

export function faqReport(messages, n = 10) {
  const byTheme = new Map();
  const other = [];
  for (const m of messages) {
    const t = String(m.content || "").trim();
    if (!isRealQuestion(t)) continue;
    const th = themeOf(t);
    if (!th) { other.push(t); continue; }
    const e = byTheme.get(th) || { theme: th, count: 0, exemples: [] };
    e.count++;
    if (e.exemples.length < 3 && !e.exemples.includes(t)) e.exemples.push(t.slice(0, 140));
    byTheme.set(th, e);
  }
  return {
    themes: [...byTheme.values()].sort((a, b) => b.count - a.count).slice(0, n),
    autres: other.slice(-8).reverse().map((t) => t.slice(0, 140)),
  };
}
