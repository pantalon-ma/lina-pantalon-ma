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

// ---- Questions auxquelles Lina n'a pas su répondre ----
const NO_ANSWER = /je ne sais pas|je n['’]ai pas (cette |d['’]|l['’]|les )?info|pas d['’]information|je ne peux pas (vous )?(répondre|confirmer|vérifier)|je ne dispose pas|n['’]est pas précisé|contact\w* (notre|l['’])\s?équipe|notre équipe vous répond|écrire sur whatsapp|ما عنديش|ما عرفتش|معنديش|تواصلي مع|الفريق ديالنا كيجاوبك/i;
const BUTTON_LIKE = /^(classique|casual( \/ sport)?|sport|large|droite?|[ée]troite?|hiver|[ée]t[ée]|demi-saison|peu importe|autres? couleurs?|autre coupe|autre couleur|parler à une conseill[eè]re|je ne connais pas ma taille|\d{2,3}|[a-zé ]{2,14})$/i;
const textOfMsg = (c) => { try { const j = JSON.parse(c); if (Array.isArray(j)) return j.filter((b) => b.type === "text").map((b) => b.text).join(" "); } catch {} return String(c || ""); };
/** Masque téléphones et e-mails éventuels */
export const anonymise = (t) => String(t).replace(/(\+?\d[\d\s.-]{7,}\d)/g, "[numéro]").replace(/\S+@\S+\.\S+/g, "[e-mail]");

/** messages : [{conversationId, role, content, createdAt}] triés par conversation puis date */
export function unansweredReport(messages, n = 30) {
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const q = textOfMsg(m.content).trim();
    if (!q || q.startsWith("[") || BUTTON_LIKE.test(q) || q.length < 6) continue;
    // réponse texte suivante de Lina dans la même conversation
    let rep = null;
    for (let k = i + 1; k < messages.length && messages[k].conversationId === m.conversationId; k++) {
      if (messages[k].role === "user" && !String(messages[k].content).trim().startsWith("[")) break;
      if (messages[k].role === "assistant") { const t = textOfMsg(messages[k].content).trim(); if (t) { rep = t; break; } }
    }
    const aidePerso = /conseill|whatsapp|humain|واتساب|مستشارة/i.test(q);
    if (rep === null) out.push({ question: anonymise(q).slice(0, 200), raison: "pas de réponse (erreur ou attente)" });
    else if (NO_ANSWER.test(rep) && !aidePerso) out.push({ question: anonymise(q).slice(0, 200), raison: "renvoyée vers l'équipe / info manquante", reponse: anonymise(rep).slice(0, 160) });
  }
  return out.slice(-n).reverse();
}
