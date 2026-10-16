import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/** Tableau de bord Lina : demandes clientes, ruptures demandées, modèles cliqués */
export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("jours")) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const [demands, clicks, conversations] = await Promise.all([
    prisma.demandLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.clickLog.findMany({ where: { createdAt: { gte: since } }, take: 5000 }),
    prisma.conversation.count({ where: { createdAt: { gte: since } } }),
  ]);

  const top = (items, keyFn, n = 10) => {
    const m = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const label = (d) => [d.type, d.couleur, d.taille && `T${d.taille}`].filter(Boolean).join(" · ");

  return {
    days,
    totals: {
      conversations,
      recherches: demands.length,
      ruptures: demands.filter((d) => !d.exact).length,
      clics: clicks.length,
    },
    topDemandes: top(demands, label),
    topRuptures: top(demands.filter((d) => !d.exact), label),
    topCouleurs: top(demands, (d) => d.couleur),
    topCoupes: top(demands, (d) => d.type),
    topTailles: top(demands, (d) => d.taille),
    topClics: top(clicks, (c) => c.title.replace(/^Pantalon Femme - /, "")),
    langues: top(demands, (d) => d.langue, 5),
  };
}

function Table({ title, rows, empty = "Pas encore de données" }) {
  return (
    <s-section heading={title}>
      {rows.length === 0 ? (
        <s-paragraph>{empty}</s-paragraph>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px 4px" }}>{k}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </s-section>
  );
}

export default function Index() {
  const d = useLoaderData();
  const t = d.totals;
  return (
    <s-page>
      <ui-title-bar title="Lina · Rapport des demandes clientes" />

      <s-section>
        <s-stack gap="base">
          <s-heading>{`Les ${d.days} derniers jours`}</s-heading>
          <s-paragraph>
            {`${t.conversations} conversations · ${t.recherches} recherches de modèles · ${t.ruptures} demandes non disponibles en stock · ${t.clics} clics sur « Voir le modèle »`}
          </s-paragraph>
          <s-paragraph>
            <s-link href="?jours=7">7 jours</s-link>{" · "}
            <s-link href="?jours=30">30 jours</s-link>{" · "}
            <s-link href="?jours=90">90 jours</s-link>
          </s-paragraph>
        </s-stack>
      </s-section>

      <Table title="🚫 Demandes en rupture (à réassortir)" rows={d.topRuptures} empty="Aucune demande en rupture 🎉" />
      <Table title="🔎 Demandes les plus fréquentes" rows={d.topDemandes} />
      <Table title="👆 Modèles les plus cliqués" rows={d.topClics} />
      <Table title="🎨 Couleurs demandées" rows={d.topCouleurs} />
      <Table title="👖 Coupes demandées" rows={d.topCoupes} />
      <Table title="📏 Tailles demandées" rows={d.topTailles} />
      <Table title="🗣️ Langue des clientes" rows={d.langues} />
    </s-page>
  );
}
