// Point de contrôle léger pour garder Lina éveillée (aucune donnée) + préchauffage du catalogue
import { warmCatalog } from "../services/catalog.server";
import { warmSiteKnowledge } from "../services/site-knowledge.server";
export function loader() {
  warmCatalog();
  warmSiteKnowledge();
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
}
