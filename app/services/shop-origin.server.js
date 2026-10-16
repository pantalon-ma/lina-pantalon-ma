import prisma from "../db.server";

const SHOPIFY_HOST = /^([a-z0-9-]+\.)*(myshopify\.com|shopify\.com)$/i;

/**
 * Resolves the request Origin to an installed shop, or null when the origin
 * is missing, malformed, or does not match any app installation.
 */
export async function resolveInstalledShopOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  let url;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const session = await prisma.session.findFirst({ where: { shop: shopDomainFor(url.hostname) } });
  return session ? url.origin : null;
}

/**
 * Domaines personnalisés → domaine .myshopify.com de la boutique.
 * Variable SHOP_DOMAIN_MAP="pantalon.ma=5a37b8-91.myshopify.com,www.pantalon.ma=5a37b8-91.myshopify.com"
 */
export function shopDomainFor(hostname) {
  const raw = process.env.SHOP_DOMAIN_MAP ||
    "pantalon.ma=5a37b8-91.myshopify.com,www.pantalon.ma=5a37b8-91.myshopify.com";
  for (const pair of raw.split(",")) {
    const [custom, shop] = pair.split("=").map((x) => x && x.trim().toLowerCase());
    if (custom && shop && custom === String(hostname).toLowerCase()) return shop;
  }
  return hostname;
}

export function isShopifyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SHOPIFY_HOST.test(url.hostname);
  } catch {
    return false;
  }
}
