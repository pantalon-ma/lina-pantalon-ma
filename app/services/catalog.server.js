import prisma from "../db.server";
import sizeGuides from "../data/size-guides.json";
import { shopDomainFor } from "./shop-origin.server";
/**
 * Catalogue pantalon.ma — outil « rechercher_modeles »
 * Lit le catalogue via l'API Storefront publique de Shopify (sans jeton)
 * et ne renvoie QUE les modèles / variantes disponibles en stock.
 */

const API_VERSION = "2025-07";
const CACHE_MS = 3 * 60 * 1000; // le stock est relu toutes les 3 minutes
const cache = new Map(); // shopOrigin -> { at, products }
const tokens = new Map(); // shop domain -> storefront access token


/** Crée (une fois) un jeton Storefront via la session hors-ligne de l'app installée */
async function getStorefrontToken(shopDomain) {
  if (tokens.has(shopDomain)) return tokens.get(shopDomain);
  const session = await prisma.session.findFirst({ where: { shop: shopDomain, isOnline: false } })
    || await prisma.session.findFirst({ where: { shop: shopDomain } });
  if (!session?.accessToken) return null;
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
    body: JSON.stringify({ query: `mutation { storefrontAccessTokenCreate(input: { title: "Lina pantalon.ma" }) { storefrontAccessToken { accessToken } userErrors { message } } }` }),
  });
  const j = await res.json().catch(() => null);
  const token = j?.data?.storefrontAccessTokenCreate?.storefrontAccessToken?.accessToken || null;
  if (!token) console.warn("[Lina] Jeton Storefront non créé:", JSON.stringify(j).slice(0, 300));
  tokens.set(shopDomain, token);
  return token;
}


// Grands types : classique / casual / sport
const STYLE_WORDS = {
  sport: ["milano", "molleton"],
  classique: ["classique", "tailleur", "gabardine", "twill"],
  casual: ["casual", "palazzo", "pantalon jupe", "jean", "lin", "viscose", "crepe", "velours", "simili", "sky", "john smith", "rayonne", "tencel"],
};
export function styleOf(product) {
  const hay = norm(`${product.title} ${(product.tags || []).join(" ")}`);
  if (STYLE_WORDS.sport.some((w) => hay.includes(w))) return "sport";
  if (STYLE_WORDS.classique.some((w) => hay.includes(w))) return "classique";
  return "casual";
}
const normStyle = (s) => {
  const w = norm(s);
  if (/sport|milano|molleton|jogg|سبور/.test(w)) return "sport";
  if (/classi|habill|chic|bureau|كلاسيك/.test(w)) return "classique";
  if (/casual|decontract|kajwal|كاجوال/.test(w)) return "casual";
  return "";
};

export const CATALOG_TOOL_NAME = "rechercher_modeles";

export const catalogTool = {
  name: CATALOG_TOOL_NAME,
  description:
    "Recherche dans le catalogue pantalon.ma les modèles DISPONIBLES EN STOCK. " +
    "Renvoie uniquement des produits et variantes en stock (jamais de rupture), avec photo, prix, lien, couleurs et tailles disponibles. " +
    "Si rien ne correspond exactement, renvoie des modèles similaires disponibles (champ 'similaires': true). " +
    "Utilise-le dès que tu connais au moins la couleur ou le type de pantalon souhaité.",
  input_schema: {
    type: "object",
    properties: {
      couleur: { type: "string", description: "Couleur souhaitée en français, ex. 'noir', 'beige', 'bleu marine', 'vert'. Vide si indifférent." },
      type: { type: "string", description: "Type / coupe / matière souhaités, ex. 'large', 'classique droit', 'palazzo', 'pantalon jupe', 'jean', 'flanelle', 'jupe'. Vide si indifférent." },
      taille: { type: "string", description: "Taille souhaitée, ex. '44' ou 'XL'. Vide si inconnue." },
      style: { type: "string", description: "Type de pantalon : 'classique', 'casual' ou 'sport' (sport = milano, molleton, molleton gratté). Vide si indifférent." },
      saison: { type: "string", description: "'hiver', 'ete' ou 'demi-saison' seulement si la cliente demande des modèles pour une saison précise ; sinon vide (saison actuelle par défaut)." },
      tour_hanches: { type: "number", description: "Tour de hanches COMPLET de la cliente en cm (mesuré sur le corps), si elle l'a donné. L'outil calcule la taille de chaque modèle." },
      tour_taille: { type: "number", description: "Tour de taille COMPLET de la cliente en cm, si elle l'a donné." },
      max: { type: "number", description: "Nombre maximum de modèles à renvoyer (défaut 4)." },
    },
  },
};

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["pantalon", "pantalons", "femme", "un", "une", "le", "la", "les", "de", "du", "des", "en", "a", "avec", "et", "modele", "coupe"]);
const LETTER_SIZES = { S: "38", M: "40", L: "42", XL: "44", "2XL": "46", XXL: "46", "3XL": "48", "4XL": "50", "5XL": "52" };

// ---- Guides des tailles : taille conseillée par modèle selon les mesures de la cliente ----
const cleanTitle = (t) => norm(String(t || "").replace(/^Pantalon Femme - /i, "").replace(/[^\p{L}\p{N}\s()-]/gu, ""));
const GUIDE_BY_TITLE = new Map();
for (const g of sizeGuides) for (const m of g.modeles) GUIDE_BY_TITLE.set(cleanTitle(m), g);
// Guide par défaut (modèles sans tableau) : demi-hanches du vêtement
const DEFAULT_GUIDE = { jupe: false, elastique: true, tailles: [38, 40, 42, 44, 46, 48, 50, 52, 54, 56].map((t, i) => ({ taille: String(t), a_min: 32 + 2 * i, a_max: 44 + 2 * i, b: 50 + 2 * i })) };

export function guideFor(title) {
  return GUIDE_BY_TITLE.get(cleanTitle(title)) || null;
}

/** Taille conseillée pour un modèle : la plus petite où le vêtement couvre ses hanches (et sa taille) */
export function recommendSize(title, { tour_hanches, tour_taille } = {}) {
  const hips = Number(tour_hanches) || 0, waist = Number(tour_taille) || 0;
  if (!hips && !waist) return null;
  const g = guideFor(title) || DEFAULT_GUIDE;
  const halfH = hips / 2, halfW = waist / 2;
  for (const r of g.tailles) {
    const okH = !hips || g.jupe || r.b == null || r.b >= halfH;
    const okW = !waist || (r.a_max > r.a_min ? halfW <= r.a_max : r.a_max >= halfW);
    if (okH && okW) return r.taille;
  }
  return null; // aucune taille du modèle ne convient
}

const QUERY = `query Catalogue($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle productType tags availableForSale
      collections(first: 15) { nodes { handle } }
      featuredImage { url }
      variants(first: 250) {
        nodes { id availableForSale price { amount } selectedOptions { name value } image { url } }
      }
    }
  }
}`;

async function loadCatalog(shopOrigin) {
  const hit = cache.get(shopOrigin);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.products;

  // Domaine .myshopify.com (session de l'app) — l'origine peut être pantalon.ma
  const shopDomain = shopDomainFor(new URL(shopOrigin).hostname);
  const token = await getStorefrontToken(shopDomain);

  const products = [];
  let cursor = null;
  for (let page = 0; page < 5; page++) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers["X-Shopify-Storefront-Access-Token"] = token;
    const res = await fetch(`https://${shopDomain}/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    });
    const raw = await res.text();
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error(`Storefront API ${res.status}: ${raw.slice(0, 200)}`); }
    if (json.errors) throw new Error("Storefront API: " + JSON.stringify(json.errors).slice(0, 300));
    const conn = json.data.products;
    products.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  cache.set(shopOrigin, { at: Date.now(), products });
  return products;
}

const opt = (v, re) => (v.selectedOptions.find((o) => re.test(o.name)) || {}).value || "";
const colorOf = (v) => opt(v, /couleur|color|colour/i);
const sizeOf = (v) => opt(v, /taille|size/i);

function sizeMatches(variantSize, wanted) {
  if (!wanted) return true;
  const w = norm(wanted).toUpperCase().replace(/\s/g, "");
  const parts = norm(variantSize).toUpperCase().split(" "); // ex. "44 XL" -> ["44","XL"]
  const num = LETTER_SIZES[w] || w;
  return parts.includes(w) || parts.includes(num) || parts.join("") === w;
}

// Familles de couleurs : la cliente peut dire « grenat », « k7el », « marine »… on rapproche
const COLOR_FAMILIES = [
  ["bordeaux", ["bordeaux", "grenat", "lie de vin", "prune", "cerise", "bourgogne", "rouge fonce", "burgundy", "بوردو", "بوردو"]],
  ["noir", ["noir", "black", "k7el", "kahla", "khal", "كحل", "كحلة", "اسود", "أسود"]],
  ["blanc", ["blanc", "ecru", "blanc casse", "white", "byed", "بيض", "بيضاء", "ابيض", "أبيض"]],
  ["beige", ["beige", "camel", "nude", "sable", "creme", "taupe", "بيج"]],
  ["marron", ["marron", "chocolat", "brun", "tabac", "brique", "camel", "قهوي", "قهوة", "شوكولا"]],
  ["bleu marine", ["bleu marine", "marine", "bleu nuit", "bleu fonce", "indigo", "navy", "مارين", "كحلي"]],
  ["bleu", ["bleu", "jean", "denim", "ciel", "turquoise", "canard", "petrole", "zre9", "زرق", "ازرق", "أزرق"]],
  ["vert", ["vert", "kaki", "khaki", "olive", "sauge", "khder", "خضر", "اخضر", "أخضر"]],
  ["gris", ["gris", "anthracite", "charbon", "chine", "grey", "gray", "رمادي", "رمادية"]],
  ["rose", ["rose", "vieux rose", "poudre", "fuchsia", "pink", "وردي", "روز"]],
  ["rouge", ["rouge", "red", "7mer", "حمر", "احمر", "أحمر"]],
  ["violet", ["violet", "mauve", "lilas", "parme", "موف", "بنفسجي"]],
  ["leopard", ["leopard", "imprime", "tigre", "panthere", "نمر"]],
];
export const familyOf = (s) => {
  const w = norm(s);
  let best = null, len = 0;
  for (const [fam, syns] of COLOR_FAMILIES)
    for (const syn of syns) {
      const n = norm(syn);
      if ((w === n || w.includes(n)) && n.length > len) { best = fam; len = n.length; }
    }
  return best;
};

export function colorMatches(variantColor, wanted) {
  if (!wanted) return true;
  const c = norm(variantColor).replace(/\s?\d+$/, ""); // "vert 1" -> "vert"
  const w = norm(wanted);
  if (c === w || c.startsWith(w + " ") || c.includes(w) || w.includes(c)) return true;
  const fw = familyOf(wanted);
  if (!fw) return false;
  const fc = familyOf(variantColor);
  // « bleu » englobe « bleu marine » ; « bordeaux » englobe « grenat »…
  return fc === fw || (fw === "bleu" && fc === "bleu marine");
}

// Saison : octobre → mars = automne/hiver ; avril → septembre = printemps/été
const WARM = ["flanelle", "molleton", "chaud", "velours", "simili", "daim", "cuir", "gabardine", "jean", "milano", "serge", "drape"];
const LIGHT = ["lin", "viscose", "crepe", "crush", "rayonne", "tencel", "broderie", "leger", "legere", "twill"];
export function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  return m >= 10 || m <= 3 ? "hiver" : "ete";
}
// Saisons du site : collections « Sélection HIVER / ETE / DEMI-SAISON » d'abord, sinon matière
const seasonsOf = (product) => {
  const handles = (product.collections?.nodes || []).map((c) => norm(c.handle));
  const out = new Set();
  for (const h of handles) {
    if (h.includes("demi saison")) out.add("demi");
    else if (h.includes("hiver")) out.add("hiver");
    else if (/\bete\b/.test(h)) out.add("ete");
  }
  return out;
};
// Saison suivante : hiver → demi-saison ; été → demi-saison ; demi-saison → hiver (automne) ou été (printemps)
export function nextSeason(season, date = new Date()) {
  if (season === "hiver" || season === "ete") return "demi";
  const m = date.getMonth() + 1;
  return m >= 2 && m <= 7 ? "ete" : "hiver";
}
function seasonScore(product, season = currentSeason()) {
  const coll = seasonsOf(product);
  if (coll.size) return coll.has(season) ? 3 : coll.has(nextSeason(season)) ? 2 : -1;
  if (season === "demi") return 0;
  const hay = norm(`${product.title} ${(product.tags || []).join(" ")}`);
  const warm = WARM.some((w) => hay.includes(w));
  const light = LIGHT.some((w) => hay.split(" ").includes(w) || hay.includes(" " + w));
  if (season === "hiver") return warm ? 1 : light ? -1 : 0;
  return light ? 1 : warm ? -1 : 0;
}

// Grandes familles de coupes : Large (palazzo, pantalon jupe), Droit, À fentes (cigarette)…
const TYPE_SYNONYMS = {
  large: ["large", "palazzo", "pantalon jupe", "wide"],
  wide: ["large", "palazzo", "pantalon jupe"],
  "واسع": ["large", "palazzo", "pantalon jupe"],
  palazzo: ["palazzo"],
  etroit: ["fente", "cigarette"], etroite: ["fente", "cigarette"], "ضيق": ["fente", "cigarette"], fente: ["fente", "cigarette"], fentes: ["fente", "cigarette"], cigarette: ["fente", "cigarette"], slim: ["fente", "cigarette"],
  droit: ["droit"], straight: ["droit"],
  jupe: ["jupe"],
  casual: ["casual"], decontracte: ["casual"],
  classique: ["classique"], habille: ["classique"], chic: ["classique"],
};
export function keywordScore(product, type) {
  const words = norm(type).split(" ").filter((x) => x.length > 1 && !STOP.has(x));
  if (!words.length) return 1;
  const hay = norm(`${product.title} ${product.productType} ${(product.tags || []).join(" ")}`);
  return words.filter((w) => (TYPE_SYNONYMS[w] || [w]).some((alt) => hay.includes(norm(alt)))).length / words.length;
}

function shape(product, shopOrigin, couleur, taille) {
  const avail = product.variants.nodes.filter((v) => v.availableForSale);
  const forColor = avail.filter((v) => colorMatches(colorOf(v), couleur));
  const exact = forColor.find((v) => sizeMatches(sizeOf(v), taille)) || forColor[0] || avail[0];
  const colors = [...new Set(avail.map(colorOf).filter(Boolean))];
  const sizes = [...new Set((forColor.length ? forColor : avail).map(sizeOf).filter(Boolean))];
  const variantId = exact?.id?.split("/").pop();
  return {
    id: product.id,
    title: product.title,
    price: exact ? `${Math.round(Number(exact.price.amount))} DH` : "",
    image_url: exact?.image?.url || product.featuredImage?.url || "",
    url: `${shopOrigin}/products/${product.handle}${variantId ? `?variant=${variantId}` : ""}`,
    couleur_proposee: exact ? colorOf(exact) : "",
    colors,
    taille_proposee: exact && taille ? sizeOf(exact) : "",
    sizes: taille ? [] : sizes,
    in_stock: true,
  };
}

export async function searchCatalog(shopOrigin, args = {}) {
  const { couleur = "" } = args;
  // « étroit » = nos modèles à fentes
  let type = String(args.type || "").replace(/\b(etroit|étroit|étroite|etroite)\b/gi, "à fentes");
  // « chaud / pour l'hiver » = saison, pas un mot du titre (sinon seuls les « Classique … Chaud » sortent)
  const veutChaud = /\b(chaud|chaude|chauds|hiver|warm|chauffant)\b|دافي|سخون|الشتا/i.test(type);
  const veutLeger = /\b(l[ée]ger|l[ée]g[èe]re|frais|fra[îi]che|[ée]t[ée])\b|خفيف|الصيف/i.test(type);
  type = type.replace(/\b(pantalons?|chaud|chaude|chauds|hiver|warm|chauffant|l[ée]ger|l[ée]g[èe]re|frais|fra[îi]che|[ée]t[ée]|pour l')\b|دافي|سخون|الشتا|خفيف|الصيف/gi, " ").trim();
  const taille = String(args.taille || "").trim();
  const mesures = { tour_hanches: Number(args.tour_hanches) || 0, tour_taille: Number(args.tour_taille) || 0 };
  const parMesures = !taille && (mesures.tour_hanches || mesures.tour_taille);
  // taille voulue pour CE modèle : celle de la cliente, ou celle calculée avec le guide du modèle
  const sizeFor = (p) => taille || (parMesures ? recommendSize(p.title, mesures) : "");
  const max = Math.min(Math.max(Number(args.max) || 4, 1), 8);
  const style = normStyle(args.style);
  const sa = String(args.saison || "");
  const saisonVoulue = veutChaud ? "hiver" : veutLeger ? "ete" : /demi|mi.saison|intersaison|نص/i.test(sa) ? "demi" : /ete|été|printemps|صيف/i.test(sa) ? "ete" : /hiver|automne|شتا/i.test(sa) ? "hiver" : currentSeason();
  let all = (await loadCatalog(shopOrigin)).filter((p) => p.availableForSale);
  // Les jupes ne sont proposées que si la cliente demande une jupe (pas « pantalon jupe »)
  const veutJupe = /\bjupe\b/i.test(type) && !/pantalon\s+jupe/i.test(type);
  if (!veutJupe) all = all.filter((p) => !/^jupe\b/.test(cleanTitle(p.title)));
  if (style) {
    const sameStyle = all.filter((p) => styleOf(p) === style);
    if (sameStyle.length) all = sameStyle;
  }

  const fits = (p, useColor, useSize) => {
    const t = useSize ? sizeFor(p) : "";
    if (useSize && !t) return false;
    return p.variants.nodes.some(
      (v) =>
        v.availableForSale &&
        (!useColor || colorMatches(colorOf(v), couleur)) &&
        (!useSize || sizeMatches(sizeOf(v), t))
    );
  };

  // Classement : d'abord la correspondance avec la demande, puis les modèles de saison en premier
  const bySeason = (list) =>
    list.map((p) => ({ p, z: seasonScore(p, saisonVoulue) })).sort((a, b) => b.z - a.z).map((x) => x.p);
  const rank = (list) =>
    list
      .map((p) => ({ p, s: keywordScore(p, type), z: seasonScore(p, saisonVoulue) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.z - a.z)
      .map((x) => x.p);

  const saison = saisonVoulue === "hiver" ? "automne/hiver (modèles chauds proposés en premier)" : saisonVoulue === "demi" ? "demi-saison (modèles mi-saison proposés en premier)" : "printemps/été (modèles légers proposés en premier)";

  // 0bis) mesures incomplètes : il faut les DEUX (hanches + taille) pour décider la taille finale
  if (!taille && parMesures && !(mesures.tour_hanches && mesures.tour_taille)) {
    const manque = mesures.tour_hanches ? "tour_taille" : "tour_hanches";
    return { demande: { couleur, type, taille }, mesure_manquante: manque, rupture: false, similaires: false,
      note: `Il manque le ${manque === "tour_taille" ? "tour de taille" : "tour de hanches"} de la cliente : demande-le (en cm) avant de proposer des modèles.`, products: [] };
  }

  // 0) sans taille : on ne propose rien, Lina demande d'abord la taille
  if (!taille && !parMesures) {
    return { demande: { couleur, type, taille }, besoin_taille: true, similaires: false, rupture: false,
      note: "Taille inconnue : demande d'abord la taille de la cliente avant de proposer des modèles.", products: [] };
  }

  // 1) correspondance exacte : type + couleur + taille, en stock
  let found = rank(all.filter((p) => fits(p, true, true)));

  // 2) rupture : on ne montre rien, on donne les choix possibles (autre couleur du même modèle / autre modèle même couleur)
  if (!found.length) {
    const memeModele = type ? rank(all.filter((p) => fits(p, false, true))).filter((p) => keywordScore(p, type) >= 0.5) : bySeason(all.filter((p) => fits(p, false, true)));
    // couleurs de base (bleu, gris, marron…) disponibles dans sa taille, sans les nuances
    const FAM_LABEL = { noir: "Noir", blanc: "Blanc", beige: "Beige", marron: "Marron", "bleu marine": "Bleu", bleu: "Bleu", vert: "Vert", gris: "Gris", rose: "Rose", rouge: "Rouge", violet: "Violet", bordeaux: "Bordeaux", leopard: "Léopard" };
    const wanted = familyOf(couleur);
    const autresCouleurs = [...new Set(memeModele.flatMap((p) => p.variants.nodes
      .filter((v) => v.availableForSale && sizeMatches(sizeOf(v), sizeFor(p)))
      .map((v) => FAM_LABEL[familyOf(colorOf(v))] || "")))].filter((c) => c && FAM_LABEL[wanted] !== c).slice(0, 8);
    const memeCouleur = couleur ? bySeason(all.filter((p) => fits(p, true, true))) : [];
    const autresModeles = memeCouleur.length;
    // Modèles proches disponibles dans SA taille : même coupe (autres couleurs), sinon même couleur (autre coupe)
    let proches = memeModele, pourquoi = "meme_coupe";
    if (!proches.length) { proches = memeCouleur; pourquoi = "meme_couleur"; }
    if (!proches.length) { proches = bySeason(all.filter((p) => fits(p, false, true))); pourquoi = "taille"; }
    const alternatives = proches.slice(0, max).map((p) => ({
      ...shape(p, shopOrigin, pourquoi === "meme_couleur" ? couleur : "", sizeFor(p)),
      ...(parMesures ? { taille_conseillee: sizeFor(p) } : {}),
    }));
    return { demande: { couleur, type, taille }, rupture: true, similaires: alternatives.length > 0, proches: pourquoi, saison,
      note: "Rupture pour cette couleur dans sa taille. Les modèles affichés sont des modèles PROCHES disponibles dans sa taille ; propose aussi les autres couleurs.",
      autres_couleurs_meme_modele: autresCouleurs, autres_modeles_meme_couleur: autresModeles, products: alternatives };
  }
  const similaires = false;

  // Sans type précisé (classique/casual/sport) : on mélange les styles pour montrer de la variété
  if (!style && found.length > max) {
    const groups = new Map();
    for (const p of found) { const k = styleOf(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const mixed = [];
    while (mixed.length < found.length) {
      for (const g of groups.values()) if (g.length) mixed.push(g.shift());
    }
    found = mixed;
  }
  const products = found.slice(0, max).map((p) => ({
    ...shape(p, shopOrigin, couleur, sizeFor(p)),
    ...(parMesures ? { taille_conseillee: sizeFor(p) } : {}),
  }));
  return {
    demande: { couleur, type, taille },
    saison,
    similaires,
    rupture: false,
    note: "Modèles en stock dans sa taille correspondant à la demande.",
    products,
  };
}
