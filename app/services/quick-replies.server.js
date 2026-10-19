/**
 * Boutons de réponse rapide sous le message de Lina (type, coupe, couleur, taille, saison).
 * Déduits de la question posée par Lina, dans la langue de la cliente.
 */
const FR = {
  type: ["Classique", "Casual", "Sport"],
  coupe: ["Large", "Droite", "Étroite"],
  couleur: ["Noir", "Beige", "Bleu marine", "Gris", "Marron", "Bordeaux", "Vert", "Autre couleur"],
  taille: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "Je ne connais pas ma taille"],
  saison: ["Hiver", "Demi-saison", "Été", "Peu importe"],
  couleur2: ["Blanc", "Bleu", "Camel", "Rose", "Rouge", "Violet", "Vert olive", "Léopard"],
  apres: ["Autres couleurs", "Autre coupe", "Parler à une conseillère"],
};
const AR = {
  type: ["كلاسيك", "كاجوال", "سبور"],
  coupe: ["واسع", "ديريكت", "ضيق"],
  couleur: ["كحل", "بيج", "مارين", "رمادي", "قهوي", "بوردو", "خضر", "لون آخر"],
  taille: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "ما عارفاش المقاس"],
  saison: ["الشتا", "نص الموسم", "الصيف", "كيفما كان"],
  couleur2: ["بيض", "زرق", "كاميل", "وردي", "حمر", "موف", "خضر زيتوني", "نمر"],
  apres: ["ألوان أخرى", "قصة أخرى", "نهضر مع مستشارة"],
};

export function quickRepliesFor(text, { langue, produitsAffiches, dernierMessage } = {}) {
  const L = langue === "darija" ? AR : FR;
  const t = String(text || "").toLowerCase();
  const question = /[?؟]\s*(😊|🙂)?\s*$/.test(t.trim()) || /[?؟]/.test(t.slice(-80));
  if (produitsAffiches) return L.apres;
  if (!question) return [];
  if (/tour de hanche|tour de taille en cm|الوراك|الدورة/.test(t)) return []; // mesures : saisie libre
  if (/saison|الموسم|الشتا|الصيف/.test(t) && /(hiver|été|ete|شتا|صيف)/.test(t)) return L.saison;
  if (/couleur|لون/.test(t) && /autre|أخرى|اخرى|آخر/.test(String(dernierMessage || "").toLowerCase())) return L.couleur2;
  if ((/casual|كاجوال/.test(t)) && (/sport|سبور/.test(t))) return L.type;
  if ((/large|واسع/.test(t)) && (/droit|ديريكت|étroit|etroit|ضيق/.test(t))) return L.coupe;
  if (/couleur|لون/.test(t)) return L.couleur;
  if (/taille|المقاس|مقاس/.test(t)) return L.taille;
  return [];
}
