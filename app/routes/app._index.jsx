import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { faqReport, unansweredReport } from "../services/faq.server";

/** Tableau de bord Lina : demandes clientes, ruptures demandées, modèles cliqués */
export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("jours")) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const [demands, clicks, conversations, userMsgs, allMsgs] = await Promise.all([
    prisma.demandLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.clickLog.findMany({ where: { createdAt: { gte: since } }, take: 5000 }),
    prisma.conversation.count({ where: { createdAt: { gte: since } } }),
    prisma.message.findMany({ where: { role: "user", createdAt: { gte: since } }, select: { content: true }, orderBy: { createdAt: "asc" }, take: 20000 }),
    prisma.message.findMany({ where: { createdAt: { gte: since } }, select: { conversationId: true, role: true, content: true }, orderBy: [{ conversationId: "asc" }, { createdAt: "asc" }], take: 40000 }),
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
    faq: faqReport(userMsgs),
    sansReponse: unansweredReport(allMsgs, 30),
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

      <s-section heading="❓ Questions les plus posées (à mettre dans la FAQ)">
        {d.faq.themes.length === 0 ? (
          <s-paragraph>Pas encore de questions</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {d.faq.themes.map((f) => (
                <tr key={f.theme} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 4px" }}>
                    <strong>{f.theme}</strong>
                    <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                      {f.exemples.map((e, i) => (<div key={i}>« {e} »</div>))}
                    </div>
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d.faq.autres.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#444" }}>
            <strong>Autres questions récentes :</strong>
            {d.faq.autres.map((e, i) => (<div key={i}>« {e} »</div>))}
          </div>
        )}
      </s-section>

      <s-section heading="🤔 Questions auxquelles Lina n'a pas su répondre (à ajouter à sa base)">
        {d.sansReponse.length === 0 ? (
          <s-paragraph>Aucune 🎉</s-paragraph>
        ) : (
          <div style={{ fontSize: 14 }}>
            {d.sansReponse.map((q, i) => (
              <div key={i} style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}>
                « {q.question} » <span style={{ color: "#888", fontSize: 12 }}>— {q.raison}</span>
              </div>
            ))}
          </div>
        )}
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
