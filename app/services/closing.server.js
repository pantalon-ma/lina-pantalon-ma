/**
 * Texte de Lina après une recherche, écrit par le code (pas de 2e appel à l'IA = plus rapide).
 */
export const PROMO_FR = `Réductions sur le **TOTAL** de la commande :
🏷️ -50 DH à l'achat de 2 articles
🏷️ -100 DH à l'achat de 3 articles
🏷️ -150 DH à l'achat de 4 articles
🏷️ **-250 DH** à l'achat de 5 articles

1ère commande ? **-10%** de bienvenue ❤️`;
export const PROMO_AR = `تخفيضات على **المجموع** :
🏷️ -50 درهم عند شراء قطعتين
🏷️ -100 درهم عند شراء 3 قطع
🏷️ -150 درهم عند شراء 4 قطع
🏷️ **-250** درهم عند شراء 5 قطع

أول طلب ليك؟ استمتعي بـ **10%-** خصم الترحيب ❤️`;

const textOf = (m) =>
  typeof m.content === "string" ? m.content
    : Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text).join(" ") : "";

export const promoDejaAffichee = (messages) =>
  messages.some((m) => m.role === "assistant" && /Réductions sur le|تخفيضات على/.test(textOf(m)));

/** Renvoie le texte final, ou null si l'IA doit répondre elle-même */
export function closingText(result, { langue, promoDeja } = {}) {
  if (!result) return null;
  const ar = langue === "darija";
  const d = result.demande || {};
  if (result.besoin_taille) return ar ? "شنو المقاس ديالك؟" : "Votre taille ?";
  if (result.mesure_manquante) {
    if (result.mesure_manquante === "tour_taille") return ar ? "و شحال الدورة ديال الحزام بالسنتيم؟" : "Et votre tour de taille en cm ?";
    return ar ? "و شحال الدورة ديال الوراك بالسنتيم؟" : "Et votre tour de hanches en cm ?";
  }
  if (result.rupture) {
    const cols = (result.autres_couleurs_meme_modele || []).map((c) => c.toLowerCase());
    const t = d.taille ? ` ${d.taille}` : "";
    const coul = d.couleur ? (ar ? ` بـ${d.couleur}` : ` en ${d.couleur.toLowerCase()}`) : "";
    if (cols.length)
      return ar
        ? `سمحي ليا، هاد الموديل${coul} ما بقاش فالمقاس${t} ديالك 😔 متوفر فالمقاس${t} : ${cols.join("، ")}. أشمن لون بغيتي؟`
        : `Désolée, ce modèle${coul} n'est plus disponible dans votre taille${t} 😔 Disponible en${t} : ${cols.join(", ")}. Laquelle vous plaît ?`;
    return ar
      ? `سمحي ليا، هاد الموديل${coul} ما بقاش فالمقاس${t} ديالك 😔 بغيتي نشوفو قصة أخرى؟`
      : `Désolée, ce modèle${coul} n'est plus disponible dans votre taille${t} 😔 Voulez-vous voir une autre coupe ?`;
  }
  if (result.products?.length) {
    const mesures = result.products.some((p) => p.taille_conseillee);
    const line = ar
      ? (mesures ? "هادو المقاسات المناسبة ليك حسب القياسات ديالك 😊 أشمن موديل عجبك؟" : "أشمن موديل عجبك؟ 😊")
      : (mesures ? "Voici vos tailles conseillées selon vos mesures 😊 Lequel vous plaît ?" : "Lequel vous plaît ? 😊");
    return promoDeja ? line : `${line}\n\n${ar ? PROMO_AR : PROMO_FR}`;
  }
  return null;
}
