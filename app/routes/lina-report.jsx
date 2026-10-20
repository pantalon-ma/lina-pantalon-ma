import crypto from "node:crypto";
import prisma from "../db.server";
import { faqReport, unansweredReport, anonymise } from "../services/faq.server";

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
    prisma.clickLog.count({ where: { createdAt: { gte: since } } }),
    prisma.conversation.count({ where: { createdAt: { gte: since } } }),
  ]);
  const userMsgs = msgs.filter((m) => m.role === "user").map((m) => ({ content: anonymise(m.content) }));
  const faq = faqReport(userMsgs, 12);
  const sansReponse = unansweredReport(msgs, 40);
  const ruptures = {};
  for (const d of demands.filter((d) => !d.exact)) { const k = [d.type, d.couleur, d.taille && "T" + d.taille].filter(Boolean).join(" · "); ruptures[k] = (ruptures[k] || 0) + 1; }
  return Response.json({
    periode_jours: days,
    conversations, recherches: demands.length, clics_voir_modele: clicks,
    questions_par_theme: faq.themes, autres_questions: faq.autres,
    questions_sans_reponse: sansReponse,
    ruptures_demandees: Object.entries(ruptures).sort((a, b) => b[1] - a[1]).slice(0, 10),
  });
}
