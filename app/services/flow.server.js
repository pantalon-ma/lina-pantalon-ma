/**
 * Déroulé imposé par le code : on regarde ce que la cliente a déjà dit
 * et on indique à Lina la prochaine question à poser (la saison une seule fois, « autre couleur »…).
 */
import { familyOf } from "./catalog.server";

const textOf = (m) =>
  typeof m.content === "string" ? m.content
    : Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text).join(" ") : "";

export function flowState(messages) {
  const users = messages.filter((m) => m.role === "user").map(textOf).filter((t) => t.trim());
  const assistants = messages.filter((m) => m.role === "assistant").map(textOf);
  const all = users.join(" \n ").toLowerCase();
  const last = (users[users.length - 1] || "").toLowerCase();
  return {
    style: /classi|casual|sport|كلاسيك|كاجوال|سبور|milano|molleton/.test(all),
    coupe: /large|droit|étroit|etroit|fente|palazzo|jupe|slim|cigarette|واسع|ديريكت|ضيق/.test(all),
    couleur: users.some((u) => familyOf(u)) || /peu importe.*couleur|n'importe quelle couleur/.test(all),
    saisonDite: /hiver|été|\bete\b|demi|saison|peu importe|كيفما كان|شتا|صيف|موسم/.test(all),
    saisonDemandee: assistants.some((a) => /saison|موسم/.test(a.toLowerCase())),
    taille: /\b(3[4-9]|[45]\d|60)\b|\b(xs|s|m|l|xl|2xl|3xl|4xl|5xl)\b|hanche|الوراك/.test(all),
    autreCouleur: /autres? couleurs?|لون آخر|ألوان أخرى|الوان اخرى/.test(last) && !familyOf(last),
    autreCoupe: /autre coupe|قصة أخرى/.test(last),
  };
}

export function flowHint(messages, langue) {
  const s = flowState(messages);
  const ar = langue === "darija";
  if (s.autreCouleur) return `\n\n➡️ ÉTAPE IMPOSÉE : la cliente veut une autre couleur. N'appelle PAS l'outil. Réponds UNIQUEMENT : « ${ar ? "أشمن لون؟" : "Quelle couleur ?"} »`;
  if (s.autreCoupe) return `\n\n➡️ ÉTAPE IMPOSÉE : la cliente veut une autre coupe. N'appelle PAS l'outil. Réponds UNIQUEMENT : « ${ar ? "شمن قصة: واسع، ديريكت ولا ضيق؟" : "Quelle coupe : large, droite ou étroite ?"} »`;
  if (s.couleur && !s.saisonDite && !s.saisonDemandee)
    return `\n\n➡️ ÉTAPE IMPOSÉE : la couleur est connue, demande MAINTENANT la saison (une seule fois). N'appelle PAS l'outil. Réponds UNIQUEMENT : « ${ar ? "لأي موسم: الشتا، نص الموسم ولا الصيف؟" : "Pour quelle saison : hiver, demi-saison ou été ?"} »`;
  return "";
}

// Réponse immédiate (sans IA) quand la cliente clique un bouton du déroulé : beaucoup plus rapide
const SIMPLE = /^(classique|casual|sport|large|droite?|[ée]troite?|hiver|[ée]t[ée]|demi[- ]saison|peu importe|كلاسيك|كاجوال|سبور|واسع|ديريكت|ضيق|الشتا|الصيف|نص الموسم|كيفما كان)$/i;
const Q = {
  fr: {
    style: "Quel type de pantalon : classique, casual ou sport ?",
    coupe: "Quelle coupe : large, droite ou étroite ?",
    couleur: "Quelle couleur ?",
    saison: "Pour quelle saison : hiver, demi-saison ou été ?",
    taille: "Votre taille ?",
  },
  ar: {
    style: "أشمن نوع: كلاسيك، كاجوال ولا سبور؟",
    coupe: "شمن قصة: واسع، ديريكت ولا ضيق؟",
    couleur: "أشمن لون؟",
    saison: "لأي موسم: الشتا، نص الموسم ولا الصيف؟",
    taille: "شنو المقاس ديالك؟",
  },
};
export function fastReply(messages, langue) {
  const users = messages.filter((m) => m.role === "user").map(textOf).filter((t) => t.trim());
  const last = (users[users.length - 1] || "").trim();
  if (!last || last.length > 22) return null;
  const st = flowState(messages);
  const qq = langue === "darija" ? Q.ar : Q.fr;
  if (st.autreCouleur) return qq.couleur;
  if (st.autreCoupe) return qq.coupe;
  const isSimple = SIMPLE.test(last) || (familyOf(last) && last.split(/\s+/).length <= 3);
  if (!isSimple || users.length < 1) return null;
  const s = flowState(messages);
  const q = langue === "darija" ? Q.ar : Q.fr;
  if (s.autreCouleur || s.autreCoupe) return null;
  if (!s.style) return q.style;
  if (!s.coupe) return q.coupe;
  if (!s.couleur) return q.couleur;
  if (!s.saisonDite && !s.saisonDemandee) return q.saison;
  if (!s.taille) return q.taille;
  return null; // tout est connu : l'IA lance la recherche
}
