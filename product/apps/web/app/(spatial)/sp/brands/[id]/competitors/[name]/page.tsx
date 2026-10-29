import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { costFor, formatCredits, initialeNom, lienNouveauProjet, messagesRetourRapport, ONGLETS_RAPPORT_CONCURRENT, ongletRapport, repartitionMedias } from '@tiktrends/core';
import { getSession } from '../../../../../../../lib/auth';
import { roleAtLeast } from '../../../../../../../lib/rbac';
import { unlimitedCredits } from '../../../../../../../lib/credits';
import { analyzeCompetitorAction, getCompetitorReport } from '../../../../../../actions/competitor';
import { RapportConcurrent } from '../../../../../../../spatial/vues/veille/RapportConcurrent';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le rapport d'un concurrent (vague 2) · MÊMES gardes que l'écran V5 : session,
 * administrateur de l'espace, marque de l'espace de la session. Lit le rapport
 * conservé (`getCompetitorReport`) · consulter ne relance jamais l'IA.
 */
export default async function RapportConcurrentSpatial({ params, searchParams }: {
  params: Promise<{ id: string; name: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { id, name: brut } = await params;
  const nom = decodeURIComponent(brut);
  const { tab } = await searchParams;
  if (!db || !UUID.test(id)) notFound();
  const [b] = await db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands)
    .where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (!b) notFound();

  const report = await getCompetitorReport(id, nom);
  const actif = ongletRapport(tab);
  const base = `/brands/${encodeURIComponent(id)}/competitors/${encodeURIComponent(nom)}`;
  const a = report?.aggregates;
  const ins = report?.insights ?? null;
  const items = actif.champ && ins ? (ins[actif.champ] ?? []) : [];

  return (
    <RapportConcurrent
      brandId={b.id} marque={b.name} nom={nom} initiale={initialeNom(nom)}
      prix={unlimitedCredits(s.user.email) ? 'Illimité · aucun crédit débité' : formatCredits(costFor('report'))}
      analyser={analyzeCompetitorAction}
      rapport={report && a ? {
        detail: `Concurrent analysé · ${a.adCount} créa${a.adCount > 1 ? 's' : ''} · mis à jour le ${new Date(report.analyzedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`,
        note: report.note ?? null,
        onglets: ONGLETS_RAPPORT_CONCURRENT.map((o) => ({ cle: o.cle, libelle: o.libelle, href: `${base}?tab=${o.cle}` })),
        actif,
        synthese: ins?.summary?.trim() || null,
        stats: [['Créas analysées', String(a.adCount)], ['Jours actifs (moy.)', String(a.avgDaysRunning)], ['Plus longue (jours)', String(a.longestRunning)], ['Plateformes', String(Object.keys(a.byPlatform).length)]],
        medias: repartitionMedias(a.byMedia),
        ctas: a.topCtas.map((c) => ({ libelle: c.label, n: c.n })),
        pages: a.landingDomains.map((c) => ({ libelle: c.label, n: c.n })),
        creas: report.ads.map((ad) => ({ id: String(ad.id), image: ad.thumbnailUrl ?? null, texte: ad.body ?? null, cta: ad.callToAction ?? null, jours: ad.daysRunning ?? null })),
        insights: items.map((texte) => ({ texte, tester: actif.testable ? lienNouveauProjet({ type: 'ads', angle: texte }) : null })),
      } : null}
      retours={messagesRetourRapport()}
    />
  );
}
