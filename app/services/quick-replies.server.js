/**
 * Boutons de réponse rapide sous le message de Lina (type, coupe, couleur, taille, saison).
 * Déduits de la question posée par Lina, dans la langue de la cliente.
 */
const FR = {
  type: ["Classique", "Casual / Sport"],
  coupe: ["Large", "Droite", "Étroite"],
  couleur: ["Noir", "Beige", "Bleu", "Gris", "Marron", "Bordeaux", "Vert", "Autre couleur"],
  taille: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "Je ne connais pas ma taille", "Voir les modèles d'abord"],
  saison: ["Hiver", "Demi-saison", "Été", "Peu importe"],
  couleur2: ["Noir", "Bleu", "Marron", "Gris", "Beige", "Vert", "Bordeaux", "Blanc", "Camel", "Rose", "Rouge", "Violet", "Léopard"],
  apres: ["Autres couleurs", "Autre coupe", "Parler à une conseillère"],
};
const AR = {
  type: ["كلاسيك", "كاجوال / سبور"],
  coupe: ["واسع", "ديريكت", "ضيق"],
  couleur: ["كحل", "بيج", "زرق", "رمادي", "قهوي", "بوردو", "خضر", "لون آخر"],
  taille: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "ما عارفاش المقاس", "نشوف الموديلات أولا"],
  saison: ["الشتا", "نص الموسم", "الصيف", "كيفما كان"],
  couleur2: ["كحل", "زرق", "قهوي", "رمادي", "بيج", "خضر", "بوردو", "بيض", "كاميل", "وردي", "حمر", "موف", "نمر"],
  apres: ["ألوان أخرى", "قصة أخرى", "نهضر مع مستشارة"],
};

export const BUTTONS = { FR, AR };

export function quickRepliesFor(text, { langue, produitsAffiches, dernierMessage } = {}) {
  const L = langue === "darija" ? AR : FR;
  const t = String(text || "").toLowerCase();
  const question = /[?؟]\s*(😊|🙂)?\s*$/.test(t.trim()) || /[?؟]/.test(t.slice(-80));
  if (produitsAffiches && /vérifier la disponibilit|باش نأكد ليك/.test(t)) return L.taille.slice(0, -1); // mode « voir d'abord » : on demande la taille
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

/** Nom de couleur de base → libellé darija */
export const COLOR_AR = { Noir: "كحل", Blanc: "بيض", Beige: "بيج", Marron: "قهوي", Bleu: "زرق", Vert: "خضر", Gris: "رمادي", Rose: "وردي", Rouge: "حمر", Violet: "موف", Bordeaux: "بوردو", "Léopard": "نمر" };
