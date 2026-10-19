/**
 * Boutons de réponse rapide sous le message de Lina (type, coupe, couleur, taille, saison).
 * Déduits de la question posée par Lina, dans la langue de la cliente.
 */
const FR = {
  type: ["Classique", "Casual", "Sport"],
  coupe: ["Large", "Droite", "Étroite"],
  couleur: ["Noir", "Beige", "Bleu marine", "Gris", "Marron", "Bordeaux", "Vert", "Autre couleur"],
  taille: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "Je ne connais pas ma taille"],
  apres: ["Autres couleurs", "Modèles d'hiver", "Modèles d'été", "Parler à une conseillère"],
};
const AR = {
  type: ["كلاسيك", "كاجوال", "سبور"],
  coupe: ["واسع", "ديريكت", "ضيق"],
  couleur: ["كحل", "بيج", "مارين", "رمادي", "قهوي", "بوردو", "خضر", "لون آخر"],
  taille: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "ما عارفاش المقاس"],
  apres: ["ألوان أخرى", "موديلات الشتا", "موديلات الصيف", "نهضر مع مستشارة"],
};

export function quickRepliesFor(text, { langue, produitsAffiches } = {}) {
  const L = langue === "darija" ? AR : FR;
  const t = String(text || "").toLowerCase();
  const question = /[?؟]\s*(😊|🙂)?\s*$/.test(t.trim()) || /[?؟]/.test(t.slice(-80));
  if (produitsAffiches) return L.apres;
  if (!question) return [];
  if (/tour de hanche|tour de taille en cm|الوراك|الدورة/.test(t)) return []; // mesures : saisie libre
  if ((/casual|كاجوال/.test(t)) && (/sport|سبور/.test(t))) return L.type;
  if ((/large|واسع/.test(t)) && (/droit|ديريكت|étroit|etroit|ضيق/.test(t))) return L.coupe;
  if (/couleur|لون/.test(t)) return L.couleur;
  if (/taille|المقاس|مقاس/.test(t)) return L.taille;
  return [];
}
