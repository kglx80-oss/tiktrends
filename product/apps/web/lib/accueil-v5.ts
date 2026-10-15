import 'server-only';
import { and, count, countDistinct, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  chosesQuiAttendent, completudeFicheMarque, etatProchainesIterations, gagnantsProuves, kpiAccueil, tuilesAccueil,
  type ContexteGagnante, type EtatProchainesIterations, type KpiAccueil, type PhraseAttente, type TuileAccueil,
} from '@tiktrends/core';
import type { Session } from './auth';
import { effectiveAccess } from './access';
import { canAccess, denyReason, FEATURES, roleAtLeast } from './rbac';
import { iterationPlanAction, type IterationRow } from '../app/actions/adsmap-iterate';
import { LIMITE_CARTES_DEFAUT } from './studios/sources/projet';

/**
 * UX V5 · l'Accueil · LECTURE SEULE des sources réelles.
 *
 * Chaque source est lue sous son droit (rôle ET offre, comme la page qui la
 * montre) et dans sa portée (espace, marque active, personne). Une source
 * fermée ou en panne vaut `null` · la règle du noyau la tait au lieu d'afficher
 * « 0 » (`chosesQuiAttendent`, `kpiAccueil`). Rien n'est écrit, rien n'est
 * généré, rien n'est débité.
 *
 * Les gagnantes viennent de l'action du plan d'itération
 * (`iterationPlanAction` · garde Adsmap, verdicts ARBITRÉS seulement) · le
 * noyau n'en garde que les victoires prouvées (`gagnantsProuves`).
 */

const F = (cle: string) => FEATURES.find((f) => f.key === cle)!;

/** La fenêtre des nouveautés des concurrents · la même que la relance de veille (une semaine). */
export const JOURS_NOUVEAUTES = 7;

export interface AccueilV5 {
  iterations: EtatProchainesIterations;
  attente: PhraseAttente | null;
  tuiles: TuileAccueil[];
  kpi: KpiAccueil[];
}

/** Une lecture qui échoue rend `null` · la source se tait, l'Accueil reste. */
async function lire<T>(etiquette: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.warn(`[accueil] ${etiquette} illisible`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function chargerAccueilV5(
  s: Session,
  p: { marque: { id: string } | null; nouveauProjet: string | null; nbProjets: number | null },
): Promise<AccueilV5> {
  const a = effectiveAccess(s);
  const refusAdsmap = denyReason(a, F('adsmap'));
  const adsmapOuvert = refusAdsmap === null && !!p.marque;
  const veilleOuverte = canAccess(a, F('saved'));

  // ── Prochaines itérations · le plan réel, gagnantes prouvées ─────────────
  let rows: IterationRow[] | null = null;
  let lecture: { ok: true; rows: IterationRow[] } | { ok: false; message: string } | null = null;
  if (adsmapOuvert && db) {
    const r = await lire('plan d’itération', () => iterationPlanAction());
    if (!r || r.error || !r.view) lecture = { ok: false, message: r?.error ?? 'Les prochaines itérations n’ont pas pu être lues · recharge la page pour réessayer.' };
    else { rows = r.view.rows; lecture = { ok: true, rows }; }
  }
  const prouves = rows ? gagnantsProuves(rows) : [];
  const contexte = new Map<string, ContexteGagnante>();
  if (prouves.length && db) {
    const ids = prouves.slice(0, 2).map((r) => r.adId);
    const lus = await lire('contexte des gagnantes', async () => {
      const lignes = await db!.select({
        adId: schema.ads.id, plateforme: schema.ads.platform, metricsAgg: schema.verdicts.metricsAgg,
        lotNumero: schema.batches.number, lotStatut: schema.batches.status,
      }).from(schema.ads)
        .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
        .leftJoin(schema.batches, and(eq(schema.batches.id, schema.ads.batchId), eq(schema.batches.workspaceId, s.workspaceId)))
        .where(and(eq(schema.ads.workspaceId, s.workspaceId), inArray(schema.ads.id, ids)));
      const appris = await db!.selectDistinct({ adId: schema.learnings.adId }).from(schema.learnings)
        .where(and(
          eq(schema.learnings.workspaceId, s.workspaceId), inArray(schema.learnings.adId, ids),
          eq(schema.learnings.status, 'validated'), eq(schema.learnings.refuted, false),
        ));
      return { lignes, appris: new Set(appris.map((x) => x.adId)) };
    });
    for (const l of lus?.lignes ?? []) {
      contexte.set(l.adId, {
        metricsAgg: l.metricsAgg, plateforme: l.plateforme,
        lot: l.lotNumero != null && l.lotStatut ? { numero: l.lotNumero, statut: l.lotStatut } : null,
        apprentissageValide: lus!.appris.has(l.adId),
      });
    }
  }
  const iterations = etatProchainesIterations({
    refus: refusAdsmap, marqueActive: !!p.marque, lecture,
    contexte: (id) => contexte.get(id), peutIterer: !!p.nouveauProjet,
  });

  // ── Les autres sources · chacune sous son droit ───────────────────────────
  const [veilleNonVue, notifications, sauvegardees, nouveautes, enTest, fiche] = await Promise.all([
    veilleOuverte && db
      ? lire('nouveautés non vues', async () => Number((await db!.select({ n: count() }).from(schema.brandTrackerEvents)
        .where(and(eq(schema.brandTrackerEvents.workspaceId, s.workspaceId), isNull(schema.brandTrackerEvents.seenAt))))[0]?.n ?? 0))
      : null,
    db
      ? lire('notifications', async () => Number((await db!.select({ n: count() }).from(schema.notifications)
        .where(and(
          eq(schema.notifications.userId, s.user.id), eq(schema.notifications.workspaceId, s.workspaceId),
          isNull(schema.notifications.readAt), ne(schema.notifications.type, 'tracker'),
        )))[0]?.n ?? 0))
      : null,
    veilleOuverte && db
      ? lire('sauvegardes', async () => {
        const ou = p.marque
          ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, p.marque.id))
          : eq(schema.savedAds.workspaceId, s.workspaceId);
        const [r] = await db!.select({ n: count(), dossiers: countDistinct(schema.savedAds.folder) }).from(schema.savedAds).where(ou);
        return { n: Number(r?.n ?? 0), dossiers: Number(r?.dossiers ?? 0) };
      })
      : null,
    veilleOuverte && db
      ? lire('nouveautés des concurrents', async () => {
        const depuis = new Date(Date.now() - JOURS_NOUVEAUTES * 86_400_000);
        const [[ev], [fb]] = await Promise.all([
          db!.select({ n: count() }).from(schema.brandTrackerEvents)
            .where(and(eq(schema.brandTrackerEvents.workspaceId, s.workspaceId), gte(schema.brandTrackerEvents.createdAt, depuis))),
          db!.select({ n: count() }).from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, s.workspaceId)),
        ]);
        return { n: Number(ev?.n ?? 0), jours: JOURS_NOUVEAUTES, suivies: Number(fb?.n ?? 0) };
      })
      : null,
    adsmapOuvert && db
      ? lire('variantes en test', async () => {
        const lots = await db!.select({ numero: schema.batches.number, n: count(schema.ads.id) }).from(schema.batches)
          .leftJoin(schema.ads, and(eq(schema.ads.batchId, schema.batches.id), eq(schema.ads.workspaceId, s.workspaceId)))
          .where(and(eq(schema.batches.workspaceId, s.workspaceId), eq(schema.batches.brandId, p.marque!.id), eq(schema.batches.status, 'testing')))
          .groupBy(schema.batches.number);
        return { n: lots.reduce((t, l) => t + Number(l.n), 0), lots: lots.map((l) => l.numero) };
      })
      : null,
    // La fiche s'ouvre aux admins (`/brands/[id]`) · on ne propose pas une page qui renverrait à l'Accueil.
    p.marque && roleAtLeast(s.role, 'admin') && db
      ? lire('fiche marque', async () => {
        const id = p.marque!.id;
        const [b] = await db!.select({
          description: schema.brands.description, usp: schema.brands.usp, audience: schema.brands.audience,
          category: schema.brands.category, categoryNeeds: schema.brands.categoryNeeds, tone: schema.brands.tone,
          industryTags: sql<number>`coalesce(cardinality(${schema.brands.industryTags}), 0)`,
          colors: sql<number>`coalesce(cardinality(${schema.brands.colors}), 0)`,
          concurrents: sql<number>`coalesce(cardinality(${schema.brands.competitors}), 0)`,
        }).from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
        if (!b) return null;
        const n = async (t: typeof schema.personas | typeof schema.scenarios | typeof schema.products) =>
          Number((await db!.select({ n: count() }).from(t).where(eq(t.brandId, id)))[0]?.n ?? 0);
        const [personas, scenarios, produits] = await Promise.all([n(schema.personas), n(schema.scenarios), n(schema.products)]);
        const c = completudeFicheMarque({
          ...b, industryTags: Number(b.industryTags), colors: Number(b.colors), concurrents: Number(b.concurrents), personas, scenarios, produits,
        });
        return { href: `/brands/${id}?tab=overview#profil`, manques: c.manques };
      })
      : null,
  ]);

  const attente = chosesQuiAttendent({
    iterations: lecture?.ok ? prouves.length : null,
    veille: veilleNonVue,
    notifications,
  });

  const tuiles = tuilesAccueil({
    nouveauProjet: p.nouveauProjet,
    veille: canAccess(a, F('inspo')),
    jarvis: canAccess(a, F('jarvis')),
    importer: canAccess(a, F('import')),
    fiche,
  });

  const kpi = kpiAccueil({
    projets: p.nbProjets === null ? null : { n: p.nbProjets, plafond: LIMITE_CARTES_DEFAUT },
    sauvegardees, nouveautes, enTest,
  });

  return { iterations, attente, tuiles, kpi };
}
