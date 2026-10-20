/**
 * Déroulé imposé par le code : on regarde ce que la cliente a déjà dit
 * et on indique à Lina la prochaine question à poser (la saison une seule fois, « autre couleur »…).
 */
import { familyOf } from "./catalog.server";
import { themeOf } from "./faq.server";


// Fautes d'orthographe, darija en lettres latines, mélanges français/darija → mots du catalogue
const TYPOS = [
  [/\b(classik|klasik|klassik|clasique|classiq|classic|clasic|klasic)\w*/gi, "classique"],
  [/\b(kajwal|kajual|cajual|caual|casuel|cazual|kasual|décontracté|decontracte)\b/gi, "casual"],
  [/\b(spor|sportif|sportive|jogging|survet)\b/gi, "sport"],
  [/\b(larg|larje|larj|lardj|wase3|wasa3|wasea|wasse3|was3|wassa3|évasé|evase)\b/gi, "large"],
  [/\b(drwat|drwa|droat|drait|droi|dirikt|direct|dirict|derict|mstagim|mostakim)\b/gi, "droit"],
  [/\b(etrwa|etroi|etrois|serré|serre|serr[ée]e?|dayek|dayq|d[i9]i[9q]|mzir|mziyer|slime?|cigaret\w*|sigaret\w*)\b/gi, "étroit"],
  [/\b(noire?s?|k7el|k7al|khal|kahla|k7la|kehla|ka7la)\b/gi, "noir"],
  [/\b(blanche?s?|byad|bayda|biyad|bid|byed)\b/gi, "blanc"],
  [/\b(bleue?s?|zr9|zar9a|zer9a|zre9|zar9|zrag|zar9in)\b/gi, "bleu"],
  [/\b(marro|maron|marrone|kahwi|9ahwi|qahwi|9ahoui|kahoui|chocola)\b/gi, "marron"],
  [/\b(bordo|bordot|bordeau|bourdeau|bordau|burgundy)\b/gi, "bordeaux"],
  [/\b(gri|grise?s?|ramadi|rmadi|ramdi)\b/gi, "gris"],
  [/\b(verte?s?|khdar|khder|khadra|5dar|5edra)\b/gi, "vert"],
  [/\b(bej|bege|beig|beije)\b/gi, "beige"],
  [/\b(hiv(?:e|è)r|chta|ach[t]?ta|bard|lbard)\b/gi, "hiver"],
  [/\b(ete|été|sif|sayf|sh?rgi)\b/gi, "été"],
  [/\b(pantalan|pantallon|pantalo|pentalon|pontalon|pantalons|serwal|sarwal|srawel|sirwal)\b/gi, "pantalon"],
  [/\b(tail|tay|tayl|taiye|ma9as|m9as|me9as|mqas|size)\b/gi, "taille"],
];
export const fixTypos = (t) => TYPOS.reduce((acc, [re, w]) => acc.replace(re, w), String(t || ""));

const textOf0 = (m) =>
  typeof m.content === "string" ? m.content
    : Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text).join(" ") : "";
const textOf = (m) => (m.role === "user" ? fixTypos(textOf0(m)) : textOf0(m));

export function flowState(messages) {
  const users = messages.filter((m) => m.role === "user").map(textOf).filter((t) => t.trim());
  const assistants = messages.filter((m) => m.role === "assistant").map(textOf);
  const all = users.join(" \n ").toLowerCase();
  const last = (users[users.length - 1] || "").toLowerCase();
  return {
    style: /classi|casual|sport|كلاسيك|كاجوال|سبور|milano|molleton/.test(all),
    coupe: /large|droit|étroit|etroit|fente|palazzo|jupe|slim|cigarette|واسع|ديريكت|ضيق/.test(all),
    couleur: users.some((u) => familyOf(u)) || /peu importe.*couleur|n'importe quelle couleur/.test(all),
    saisonDite: /hiver|été|\bete\b|demi|saison|peu importe|chaud|l[ée]ger|كيفما كان|شتا|صيف|موسم|دافي|خفيف/.test(all),
    saisonDemandee: assistants.some((a) => /saison|موسم/.test(a.toLowerCase())),
    taille: /\b(3[4-9]|[45]\d|60)\b|hanche|الوراك/.test(all) || users.some((u) => /^\s*(taille\s*)?(xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\s*$/i.test(u)),
    autreCouleur: /autres? couleurs?|لون آخر|ألوان أخرى|الوان اخرى/.test(last) && !familyOf(last),
    autreCoupe: /autre coupe|قصة أخرى/.test(last),
  };
}

export function flowHint(messages, langue) {
  const s = flowState(messages);
  const ar = langue === "darija";
  if (s.autreCouleur) return `\n\n➡️ ÉTAPE IMPOSÉE : la cliente veut une autre couleur. N'appelle PAS l'outil. Réponds UNIQUEMENT : « ${ar ? "أشمن لون؟" : "Quelle couleur ?"} »`;
  if (s.autreCoupe) return `\n\n➡️ ÉTAPE IMPOSÉE : la cliente veut une autre coupe. N'appelle PAS l'outil. Réponds UNIQUEMENT : « ${ar ? "شمن قصة: واسع، ديريكت ولا ضيق؟" : "Quelle coupe : large, droite ou étroite ?"} »`;
  // La cliente parle d'un pantalon (pas d'une question boutique) : on suit le déroulé dans l'ordre
  const users = messages.filter((m) => m.role === "user").map(textOf).filter((t) => t.trim());
  const last = users[users.length - 1] || "";
  const th = themeOf(last);
  const questionBoutique = th && !/^Taille/.test(th);
  if (!questionBoutique) {
    const q = ar
      ? { style: "أشمن نوع: كلاسيك، كاجوال ولا سبور؟", coupe: "شمن قصة: واسع، ديريكت ولا ضيق؟", couleur: "أشمن لون؟" }
      : { style: "Quel type de pantalon : classique, casual ou sport ?", coupe: "Quelle coupe : large, droite ou étroite ?", couleur: "Quelle couleur ?" };
    const next = !s.style ? "style" : !s.coupe ? "coupe" : !s.couleur ? "couleur" : null;
    if (next && !s.taille)
      return `\n\n➡️ ÉTAPE IMPOSÉE : il manque le ${next === "style" ? "type (classique / casual / sport)" : next}. N'appelle PAS l'outil. Réponds UNIQUEMENT (après une salutation de 2 mots si c'est le 1er message) : « ${q[next]} »`;
  }
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
    mesures: "Votre tour de hanches et votre tour de taille en cm ?",
  },
  ar: {
    style: "أشمن نوع: كلاسيك، كاجوال ولا سبور؟",
    coupe: "شمن قصة: واسع، ديريكت ولا ضيق؟",
    couleur: "أشمن لون؟",
    saison: "لأي موسم: الشتا، نص الموسم ولا الصيف؟",
    taille: "شنو المقاس ديالك؟",
    mesures: "شحال الدورة ديال الوراك و الدورة ديال الحزام بالسنتيم؟",
  },
};
export function fastReply(messages, langue) {
  const users = messages.filter((m) => m.role === "user").map(textOf).filter((t) => t.trim());
  const last = (users[users.length - 1] || "").trim();
  if (/conseill[eè]re|parler à (une|quelqu)|un humain|une personne|whatsapp|واتساب|مستشارة|شي حد/i.test(last) && last.length <= 60)
    return langue === "darija"
      ? "الفريق ديالنا كيجاوبك على واتساب 😊\n[كتبي لينا على واتساب](https://wa.me/212703200695)"
      : "Notre équipe vous répond sur WhatsApp 😊\n[Écrire sur WhatsApp](https://wa.me/212703200695)";
  if (/^(je ne connais pas ma taille|ما عارفاش المقاس)$/i.test(last)) return (langue === "darija" ? Q.ar : Q.fr).mesures;
  // Demande en texte libre d'un pantalon (« pantalon gris classique », « bghit serwal… ») : question suivante sans IA
  if (last && last.length > 22) {
    const lw = last.toLowerCase();
    const parlePantalon = /pantalon|serwal|sarwal|سروال|سراول|jean|palazzo|jupe|classi|casual|sport|large|droit|[ée]troit|chaud|كلاسيك|كاجوال|واسع|ضيق/.test(lw) || !!familyOf(last);
    const th = themeOf(last);
    if (!parlePantalon || (th && !/^Taille/.test(th)) || /[?؟]/.test(last)) return null;
    const st2 = flowState(messages);
    const q2 = langue === "darija" ? Q.ar : Q.fr;
    if (!st2.style) return q2.style;
    if (!st2.coupe) return q2.coupe;
    if (!st2.couleur) return q2.couleur;
    if (!st2.saisonDite && !st2.saisonDemandee) return q2.saison;
    if (!st2.taille) return q2.taille;
    return null;
  }
  if (!last) return null;
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

/** Paramètres de recherche déduits des réponses de la cliente (dernière valeur donnée pour chaque étape) */
export function extractParams(messages) {
  const users = messages.filter((m) => m.role === "user").map(textOf).map((t) => t.trim()).filter(Boolean);
  const out = {};
  for (const u0 of users) {
    const u = u0.toLowerCase();
    if (/sport|سبور|milano|molleton/.test(u)) out.style = "sport";
    else if (/classi|كلاسيك/.test(u)) out.style = "classique";
    else if (/casual|كاجوال/.test(u)) out.style = "casual";
    if (/étroit|etroit|fente|slim|cigarette|ضيق/.test(u)) out.type = "à fentes";
    else if (/droit|ديريكت/.test(u)) out.type = "droit";
    else if (/large|palazzo|pantalon jupe|واسع/.test(u)) out.type = "large";
    if (familyOf(u0)) out.couleur = u.length <= 22 ? u0 : familyOf(u0);
    if (/demi|نص الموسم/.test(u)) out.saison = "demi-saison";
    else if (/hiver|chaud|شتا|دافي/.test(u)) out.saison = "hiver";
    else if (/été|\bete\b|l[ée]ger|صيف|خفيف/.test(u)) out.saison = "ete";
    else if (/peu importe|كيفما كان/.test(u)) out.saison = "";
    const n = u.match(/^\s*(?:taille\s*)?(3[4-9]|[45]\d|60)\s*$/) || u.match(/^\s*(?:taille\s*)?(xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\s*$/i)
      || u.match(/(?:taille|t\.?|المقاس|مقاس)\s*:?\s*(3[4-9]|[45]\d|60)\b/) || u.match(/(?:taille|المقاس|مقاس)\s*:?\s*(xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\b/i);
    if (n) out.taille = n[1].toUpperCase();
  }
  return out;
}

/** Recherche directe (sans IA) : la cliente vient de donner la dernière info par un clic / un chiffre */
/** Tours de hanches / taille (cm) donnés par la cliente, après que Lina les a demandés */
export function extractMeasures(messages) {
  const out = {};
  let askedWaistLast = false;
  for (const m of messages) {
    const t = textOf(m);
    if (m.role === "assistant") { askedWaistLast = /tour de taille en cm\s*\?$|الحزام بالسنتيم؟$/.test(t.trim()) && !/hanches/.test(t); continue; }
    if (m.role !== "user") continue;
    const u = t.toLowerCase();
    const nums = (u.match(/\d{2,3}(?:[.,]\d)?/g) || []).map((x) => Number(x.replace(",", "."))).filter((n) => n >= 55 && n <= 190);
    if (!nums.length) continue;
    const hipM = u.match(/(?:hanche|hanches|bassin|وراك|الوراك|fesse)[^\d]{0,20}(\d{2,3})/) || u.match(/(\d{2,3})\s*(?:cm)?\s*(?:de |d')?\s*(?:hanche|hanches|bassin|وراك)/);
    const waistM = u.match(/(?:taille|ceinture|حزام|الحزام|كرش)[^\d]{0,20}(\d{2,3})/) || u.match(/(\d{2,3})\s*(?:cm)?\s*(?:de |d')?\s*(?:taille|ceinture|حزام)/);
    if (hipM) out.tour_hanches = Number(hipM[1]);
    if (waistM) out.tour_taille = Number(waistM[1]);
    const rest = nums.filter((n) => n !== out.tour_hanches && n !== out.tour_taille);
    if (!hipM && !waistM) {
      if (rest.length >= 2) { out.tour_hanches = Math.max(rest[0], rest[1]); out.tour_taille = Math.min(rest[0], rest[1]); }
      else if (rest.length === 1) {
        if (askedWaistLast || (out.tour_hanches && !out.tour_taille)) out.tour_taille = rest[0];
        else if (!out.tour_hanches) out.tour_hanches = rest[0];
      }
    } else if (rest.length === 1) {
      if (hipM && !waistM && !out.tour_taille) out.tour_taille = rest[0];
      if (waistM && !hipM && !out.tour_hanches) out.tour_hanches = rest[0];
    }
  }
  return out;
}

export function canSearchDirectly(messages) {
  const users = messages.filter((m) => m.role === "user").map(textOf).filter((t) => t.trim());
  const last = (users[users.length - 1] || "").trim();
  if (!last) return null;
  const mes = extractMeasures(messages);
  const lastHasMeasure = /\d{2,3}/.test(last) && (mes.tour_hanches || mes.tour_taille) && last.length <= 60 && !/[?؟]/.test(last);
  const lastHasSize = /(?:taille|t\.?|المقاس|مقاس)\s*:?\s*(3[4-9]|[45]\d|60|xs|s|m|l|xl|xxl|[2-5]xl)\b/i.test(last) && !/[?؟]/.test(last);
  if (last.length > 22 && !lastHasMeasure && !lastHasSize) return null;
  const s = flowState(messages);
  if (!(s.style && s.coupe && s.couleur && (s.saisonDite || s.saisonDemandee) && (s.taille || mes.tour_hanches || mes.tour_taille))) return null;
  const p = extractParams(messages);
  if (!p.couleur) return null;
  if (mes.tour_hanches || mes.tour_taille) {
    delete p.taille;
    if (mes.tour_hanches) p.tour_hanches = mes.tour_hanches;
    if (mes.tour_taille) p.tour_taille = mes.tour_taille;
    return p;
  }
  if (!p.taille) return null;
  return p;
}
