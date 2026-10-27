import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { encartKpiJarvis, extraitConversation, iterationsRecentes, type IterationRecente } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../../../lib/jarvis-acces';
import { getActiveBrand } from '../../../../lib/brands';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { COUT_CONVERSATION_JARVIS } from '../../../../lib/veille-jarvis';
import { chatThreadAction } from '../../../actions/jarvis-chat';
import { Jarvis, type ConversationArchive } from '../../../../spatial/vues/jarvis/Jarvis';
import { RefusJarvis } from '../../../../spatial/vues/jarvis/RefusJarvis';

export const dynamic = 'force-dynamic';

const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * « Jarvis » Spatial · mêmes gardes que `/jarvis` (V5) : session, puis la
 * feature `jarvis` (rôle, offre, matrice d'équipe) AVANT toute lecture. Les
 * conversations viennent de l'action existante (`chatThreadAction`, portée
 * espace + marque + personne) · leur extrait est le dernier message, lu dans la
 * MÊME portée. « Dernières itérations » · les vrais lots de la marque, derrière
 * la feature Résultats (`adsmap`). « Chiffres clés » · état vide honnête
 * (`encartKpiJarvis(null)` · la dépense pub n'est pas agrégée).
 */
export default async function JarvisSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const refus = refusJarvis(s);
  if (refus) return <RefusJarvis raison={TEXTE_REFUS_JARVIS[refus]} plan={refus === 'plan'} proprietaire={s.role === 'owner'} />;

  const maintenant = new Date();
  const kpi = encartKpiJarvis(null);
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) {
    return <Jarvis marque={null} conversations={[]} iterations={null} measuredAds={0} kpi={kpi} cout={COUT_CONVERSATION_JARVIS} maintenant={maintenant.toISOString()} />;
  }

  const r = await chatThreadAction(null);
  const t = r.thread ?? null;
  const nommees = t?.conversations ?? [];
  const extraits = new Map<string, string>();
  if (db && nommees.length) {
    const M = schema.jarvisMessages;
    const rows = await db.select({ cid: M.conversationId, content: M.content }).from(M)
      .where(and(eq(M.workspaceId, s.workspaceId), eq(M.brandId, brand.id), eq(M.userId, s.user.id), inArray(M.conversationId, nommees.map((c) => c.id))))
      .orderBy(desc(M.createdAt)).limit(400);
    for (const m of rows) if (m.cid && !extraits.has(m.cid)) extraits.set(m.cid, extraitConversation(m.content));
  }
  const conversations: ConversationArchive[] = nommees.map((c) => ({ id: c.id, titre: c.titre, extrait: extraits.get(c.id) ?? '', majLe: c.majLe }));
  // Le fil principal (messages d'avant les conversations nommées) · listé s'il existe, jamais inventé.
  const dernier = t?.turns[t.turns.length - 1];
  if (dernier) conversations.push({ id: null, titre: 'Fil principal', extrait: extraitConversation(dernier.content), majLe: dernier.at });

  let iterations: IterationRecente[] | null = null;
  if (db && canAccess(effectiveAccess(s), RESULTATS)) {
    const B = schema.batches;
    const lots = await db.select({ id: B.id, number: B.number, goal: B.goal, status: B.status, createdAt: B.createdAt }).from(B)
      .where(and(eq(B.workspaceId, s.workspaceId), eq(B.brandId, brand.id))).orderBy(desc(B.createdAt)).limit(4);
    iterations = iterationsRecentes(lots.map((l) => ({ ...l, createdAt: (l.createdAt as Date).toISOString() })), maintenant);
  }

  return (
    <Jarvis
      marque={{ id: brand.id, nom: brand.name }}
      conversations={conversations}
      iterations={iterations}
      measuredAds={t?.measuredAds ?? 0}
      kpi={kpi}
      cout={COUT_CONVERSATION_JARVIS}
      maintenant={maintenant.toISOString()}
    />
  );
}
