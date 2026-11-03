import crypto from "node:crypto";
import prisma from "../db.server";
import { faqReport, unansweredReport, anonymise } from "../services/faq.server";
import { diagnoseDemand } from "../services/catalog.server";

// Rapport hebdomadaire (questions posées à Lina, questions sans réponse). Protégé par une clé privée.
const KEY_HASH = "c9f420dcd3e9c97bf7f1132bbea96a1f368309c37b9a69afb5fb11f7577af59d";

export async function loader({ request }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const ok = crypto.createHash("sha256").update(key).digest("hex") === KEY_HASH;
  if (!ok) return new Response("Forbidden", { status: 403 });
  const days = Math.min(Math.max(Number(url.searchParams.get("jours")) || 7, 1), 90);
  const since = new Date(Date.now() - days * 864e5);
  const [msgs, demands, clicks, conversations] = await Promise.all([
    prisma.message.findMany({ where: { createdAt: { gte: since } }, select: { conversationId: true, role: true, content: true, createdAt: true }, orderBy: [{ conversationId: "asc" }, { createdAt: "asc" }], take: 40000 }),
    prisma.demandLog.findMany({ where: { createdAt: { gte: since } }, take: 10000 }),
    prisma.clickLog.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, title: true, url: true }, orderBy: { createdAt: "asc" }, take: 5000 }),
    prisma.conversation.count({ where: { createdAt: { gte: since } } }),
  ]);
  const userMsgs = msgs.filter((m) => m.role === "user").map((m) => ({ content: anonymise(m.content) }));
  const faq = faqReport(userMsgs, 12);
  const sansReponse = unansweredReport(msgs, 40);
  const ruptures = {};
  for (const d of demands.filter((d) => !d.exact)) { const k = [d.type, d.couleur, d.taille && "T" + d.taille].filter(Boolean).join(" · "); ruptures[k] = (ruptures[k] || 0) + 1; }
  // Demandes non trouvées : modèle absent du catalogue, taille jamais faite, ou simple rupture de stock
  const origin = process.env.LINA_SHOP_ORIGIN || "https://pantalon.ma";
  const pasDuTout = {}, taillesJamais = {}, epuises = {};
  const vus = new Map();
  for (const d of demands.filter((d) => !d.exact)) {
    const key = [d.type, d.couleur, d.taille].join("|");
    if (!vus.has(key)) vus.set(key, await diagnoseDemand(origin, d).catch(() => "?"));
    const why = vus.get(key);
    const label = [d.type, d.couleur].filter(Boolean).join(" · ") || "(sans précision)";
    if (why === "jamais") pasDuTout[label] = (pasDuTout[label] || 0) + 1;
    else if (why === "taille") { const l = label + " · T" + d.taille; taillesJamais[l] = (taillesJamais[l] || 0) + 1; }
    else if (why === "rupture") { const l = label + (d.taille ? " · T" + d.taille : ""); epuises[l] = (epuises[l] || 0) + 1; }
  }
  // Articles demandés en texte libre que la boutique ne vend pas (ou tailles hors gamme)
  const HORS = [["short / bermuda", /\b(short|bermuda)\b/i], ["legging", /\bleggings?\b|ليڭينڭ|ليجينج/i], ["combinaison / salopette", /combinaison|salopette/i],
    ["robe", /\brobes?\b|كسوة|روبة/i], ["chemise / blouse / haut", /\b(chemise|blouse|top|tunique|t-shirt|pull)\b|قميجة/i], ["veste / blazer / manteau", /\b(veste|blazer|manteau|gilet)\b|جاكيط/i],
    ["ensemble / tailleur complet", /\bensemble\b|tailleur complet|كونجو/i], ["abaya / jellaba / caftan", /abaya|abaya|jel+aba|djel+aba|caftan|kaftan|جلابة|عباية|قفطان/i],
    ["pantalon cargo / baggy", /\b(cargo|baggy)\b/i], ["pantalon flare / pattes d'eph", /\bflare\b|patte[s]? d.?(é|e)l(é|e)phant|pattes d.?eph/i],
    ["pantacourt / 7-8", /pantacourt|\b7\s?\/\s?8\b|corsaire/i], ["pantalon de grossesse", /grossesse|enceinte|maternit|حامل/i],
    ["pantalon homme / enfant", /\b(homme|enfant|fille de \d|garçon|bébé)\b|رجال|دراري/i], ["taille 58 et plus", /\b(5[89]|6\d)\b/],
  ];
  const horsCatalogue = {};
  for (const m of userMsgs) for (const [nom, re] of HORS) if (re.test(m.content)) { (horsCatalogue[nom] ||= []).length < 3 ? horsCatalogue[nom].push(m.content.slice(0, 100)) : horsCatalogue[nom].push(null); }
  const top = (o, n = 15) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

  return Response.json({
    periode_jours: days,
    conversations, recherches: demands.length, clics_voir_modele: clicks.length,
    // pour compter les commandes passées via Lina (à croiser avec les commandes Shopify)
    clics_detail: clicks.map((c) => ({ date: c.createdAt, modele: c.title, variante: (String(c.url).match(/variant=(\d+)/) || [])[1] || "" })),
    questions_par_theme: faq.themes, autres_questions: faq.autres,
    questions_sans_reponse: sansReponse,
    modeles_demandes_absents_du_catalogue: top(pasDuTout),
    tailles_demandees_jamais_faites: top(taillesJamais),
    demandes_en_rupture_de_stock: top(epuises),
    articles_demandes_non_vendus: Object.entries(horsCatalogue).map(([nom, ex]) => ({ article: nom, demandes: ex.length, exemples: ex.filter(Boolean) })).sort((a, b) => b.demandes - a.demandes),
    ruptures_demandees: Object.entries(ruptures).sort((a, b) => b[1] - a[1]).slice(0, 10),
  }, { headers: { "X-Robots-Tag": "noindex, nofollow" } });
}
