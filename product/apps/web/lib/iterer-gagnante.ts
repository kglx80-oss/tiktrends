import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  etatPlanGagnante, gagnanteDeLHypothese, gagnantesDuLot, lotDeLaCarte, peutCreerIteration,
  type DemandeProvenanceGagnante, type GagnanteDuFil, type LignePlanSpatial, type PlanDesGagnantes, type SuiteNee,
} from '@tiktrends/core';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerLots, faitsHypotheses } from '../app/(spatial)/sp/adsmap/donnees';
import { gardeStudio } from './studios/garde';

/**
 * « Itérer depuis la gagnante » partout (fil, fiche d'un lot conclu, carte
 * d'une hypothèse confirmée) · le côté serveur · des LECTURES, jamais une
 * écriture. Les règles sont au noyau (`C/studios/activite/iterer-gagnante.ts`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La porte de l'écran Itérer, relue pour dire le geste ouvert ou fermé ·
 * l'écran (`studio.read`, capacité `projets`), puis créer l'itération
 * (`peutCreerIteration` · `studio.propose`, la marque dans la portée) · faux
 * sur tout refus (le geste dit alors la raison du rôle).
 */
export async function porteIterationGagnante(brandId: string): Promise<boolean> {
  try {
    const g = await gardeStudio('studio.read', 'projets');
    return g.ok && peutCreerIteration(g.ctx, brandId);
  } catch {
    return false;
  }
}

/** Les itérations nées de ces ads (arêtes de filiation existantes de l'espace) · leur code, et si leur verdict est ARBITRÉ. */
export async function lireSuitesNees(workspaceId: string, parents: readonly string[]): Promise<SuiteNee[]> {
  const ids = [...new Set(parents.filter((x) => UUID.test(x)).map((x) => x.toLowerCase()))];
  if (!db || !ids.length) return [];
  const E = schema.iterationEdges;
  const lignes = await db.select({ parent: E.parentAdId, variante: schema.ads.variantCode, statut: schema.verdicts.status })
    .from(E)
    .innerJoin(schema.ads, and(eq(schema.ads.id, E.childAdId), eq(schema.ads.workspaceId, workspaceId)))
    .leftJoin(schema.verdicts, eq(schema.verdicts.adId, E.childAdId))
    .where(and(eq(E.workspaceId, workspaceId), inArray(E.parentAdId, ids)));
  return lignes.map((l) => ({ parentAdId: l.parent, variante: l.variante, arbitree: l.statut === 'validated' }));
}

/**
 * Ce que le plan d'itération RÉEL de la marque active (`iterationPlanAction`,
 * déjà lu par l'appelant quand il l'a) et la lignée disent de ces gagnantes ·
 * `null` sans gagnante, ou quand le plan ne se lit pas (rien n'est alors
 * signalé · un plan illisible n'exclut personne).
 */
export async function planDesGagnantes(workspaceId: string, gagnantes: readonly string[], plan?: readonly LignePlanSpatial[] | null): Promise<PlanDesGagnantes | null> {
  if (!gagnantes.length) return null;
  try {
    const [rows, suites] = await Promise.all([
      plan ? Promise.resolve(plan) : iterationPlanAction().then((r) => (r.error || !r.view ? null : r.view.rows)),
      lireSuitesNees(workspaceId, gagnantes),
    ]);
    if (!rows) return null;
    return (adId) => etatPlanGagnante(adId, { plan: rows, suites });
  } catch {
    return null;
  }
}

/**
 * Les gagnantes ADMISES d'un départ, relues dans la marque · un lot · ses
 * variantes arbitrées gagnantes s'il est conclu (`gagnantesDuLot`) · une
 * carte · la gagnante du lot qui l'a confirmée (`gagnanteDeLHypothese`) · la
 * lecture des pages (`chargerLots`, `faitsHypotheses` · le lot de la marque,
 * sa conclusion contre les autres lots) · `null` · introuvable dans la marque.
 */
export async function lireGagnantesDepuis(workspaceId: string, brandId: string, d: DemandeProvenanceGagnante): Promise<{ lot: { id: string; numero: number }; gagnantes: GagnanteDuFil[] } | null> {
  if (!db || !UUID.test(d.id)) return null;
  try {
    const dl = await chargerLots(workspaceId, brandId);
    const faits = faitsHypotheses(dl);
    const adsDuLot = (lotId: string) => dl.lots.find((l) => l.id === lotId)?.ads ?? [];
    const id = d.id.toLowerCase();
    const f = d.source === 'lot' ? faits.find((x) => x.lot?.id.toLowerCase() === id) : faits.find((x) => x.ad.id.toLowerCase() === id);
    const lot = f ? lotDeLaCarte(f, adsDuLot) : null;
    if (!lot) return null;
    const g = d.source === 'lot' ? gagnantesDuLot(lot) : [gagnanteDeLHypothese(id, lot)].filter((x): x is GagnanteDuFil => !!x);
    return { lot: { id: lot.id, numero: lot.numero }, gagnantes: g };
  } catch {
    return null;
  }
}

/**
 * Le plan des gagnantes dont le geste est OUVERT dans ces gestes déjà calculés
 * (sans plan) · lu une fois, seulement s'il y en a une · `null` sinon.
 */
export async function planPourGestes(workspaceId: string, gestes: ReadonlyArray<Readonly<Record<string, { href: string | null }>>>, plan?: readonly LignePlanSpatial[] | null): Promise<PlanDesGagnantes | null> {
  const ouvertes = gestes.flatMap((g) => Object.entries(g).filter(([, x]) => !!x.href).map(([adId]) => adId));
  return ouvertes.length ? planDesGagnantes(workspaceId, ouvertes, plan) : null;
}
