// Point de contrôle léger pour garder Lina éveillée (aucune donnée)
export function loader() {
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
}
