// Point de contrôle léger pour garder Lina éveillée (aucune donnée) + préchauffage du catalogue
import { warmCatalog } from "../services/catalog.server";
export function loader() {
  warmCatalog();
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
}
