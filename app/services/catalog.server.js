import prisma from "../db.server";
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

const QUERY = `query Catalogue($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle productType tags availableForSale
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
  const session = await prisma.session.findFirst({ where: { shop: new URL(shopOrigin).hostname } })
    || await prisma.session.findFirst();
  const shopDomain = session?.shop || new URL(shopOrigin).hostname;
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

function colorMatches(variantColor, wanted) {
  if (!wanted) return true;
  const c = norm(variantColor).replace(/\s?\d+$/, ""); // "vert 1" -> "vert"
  const w = norm(wanted);
  return c === w || c.startsWith(w + " ") || c.includes(w) || w.includes(c);
}

// Saison : octobre → mars = automne/hiver ; avril → septembre = printemps/été
const WARM = ["flanelle", "molleton", "chaud", "velours", "simili", "daim", "cuir", "gabardine", "jean", "milano", "serge", "drape"];
const LIGHT = ["lin", "viscose", "crepe", "crush", "rayonne", "tencel", "broderie", "leger", "legere", "twill"];
export function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  return m >= 10 || m <= 3 ? "hiver" : "ete";
}
function seasonScore(product, season = currentSeason()) {
  const hay = norm(`${product.title} ${(product.tags || []).join(" ")}`);
  const warm = WARM.some((w) => hay.includes(w));
  const light = LIGHT.some((w) => hay.split(" ").includes(w) || hay.includes(" " + w));
  if (season === "hiver") return warm ? 1 : light ? -1 : 0;
  return light ? 1 : warm ? -1 : 0;
}

function keywordScore(product, type) {
  const words = norm(type).split(" ").filter((x) => x.length > 1 && !STOP.has(x));
  if (!words.length) return 1;
  const hay = norm(`${product.title} ${product.productType} ${(product.tags || []).join(" ")}`);
  return words.filter((w) => hay.includes(w)).length / words.length;
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
  const { couleur = "", type = "", taille = "" } = args;
  const max = Math.min(Math.max(Number(args.max) || 4, 1), 8);
  const all = (await loadCatalog(shopOrigin)).filter((p) => p.availableForSale);

  const fits = (p, useColor, useSize) =>
    p.variants.nodes.some(
      (v) =>
        v.availableForSale &&
        (!useColor || colorMatches(colorOf(v), couleur)) &&
        (!useSize || sizeMatches(sizeOf(v), taille))
    );

  // Classement : d'abord la correspondance avec la demande, puis les modèles de saison en premier
  const bySeason = (list) =>
    list.map((p) => ({ p, z: seasonScore(p) })).sort((a, b) => b.z - a.z).map((x) => x.p);
  const rank = (list) =>
    list
      .map((p) => ({ p, s: keywordScore(p, type), z: seasonScore(p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.z - a.z)
      .map((x) => x.p);

  // 1) correspondance exacte : type + couleur + taille, en stock
  let found = rank(all.filter((p) => fits(p, true, true)));
  let similaires = false;
  let note = "";

  // 2) sinon, modèles similaires disponibles
  if (!found.length) {
    similaires = true;
    const steps = [
      [() => bySeason(all.filter((p) => fits(p, true, true))), "même couleur et même taille, autre coupe"],
      [() => rank(all.filter((p) => fits(p, false, true))), "même coupe et même taille, autre couleur"],
      // (jamais d'autre taille : on ne propose que des modèles disponibles dans SA taille)
      ...(taille ? [] : [[() => rank(all.filter((p) => fits(p, true, false))), "même coupe et même couleur"]]),
      [() => bySeason(all.filter((p) => fits(p, false, true))), "même taille, autres modèles"],
    ];
    for (const [get, why] of steps) {
      found = get();
      if (found.length) { note = why; break; }
    }
  }

  const products = found.slice(0, max).map((p) => shape(p, shopOrigin, couleur, taille));
  return {
    demande: { couleur, type, taille },
    saison: currentSeason() === "hiver" ? "automne/hiver (modèles chauds proposés en premier)" : "printemps/été (modèles légers proposés en premier)",
    similaires,
    note: similaires
      ? `Aucun modèle exact en stock. Modèles similaires disponibles : ${note || "aucun"}.`
      : "Modèles en stock correspondant à la demande.",
    products,
  };
}
