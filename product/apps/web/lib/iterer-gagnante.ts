import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  etatPlanGagnante, gagnanteDeLHypothese, gagnantesDuLot, lotDeLaCarte, peutCreerIteration,
  gagnantesDeLaLignee, gestesParAdDeLaLignee, lireNaissanceGagnante,
  type AdRelueGagnante, type DemandeProvenanceGagnante, type GagnanteDuFil, type GagnanteDuNoeud, type LignePlanSpatial, type LotPourGagnante,
  type NaissanceGagnante, type PlanDesGagnantes, type ResultatDeLignee, type SuiteNee,
} from '@tiktrends/core';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerLots, faitsHypotheses, gardeResultats } from '../app/(spatial)/sp/adsmap/donnees';
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

/**
 * La CARTE DE LIGNÉE d'un projet · « née de la gagnante V7 » sur le nœud d'une
 * itération partie d'une gagnante, « Itérer depuis la gagnante » sur le nœud
 * d'une variante arbitrée gagnante d'un lot conclu (règles ·
 * `C/studios/activite/gagnante-lignee.ts`). Des LECTURES, jamais une écriture ·
 *  · Résultats fermé à la session · rien (comme sous le fil, #1083) ;
 *  · la provenance des pubs de test de la lignée (`source_ref_json`, l'espace) ·
 *    lue seulement s'il y a un nœud « Résultat » ;
 *  · les lots de la MARQUE DU PROJET (`chargerLots`, la lecture des pages) ·
 *    seulement si une pub est née d'une gagnante ou est dans un lot de test ·
 *    la gagnante y est relue, une ad d'ailleurs n'y est pas ;
 *  · la porte de l'écran Itérer (`porteIterationGagnante`), puis le plan des
 *    gestes OUVERTS (`planPourGestes`) · une fois, seulement s'il y en a ;
 *  · la marque active · celle du projet, sinon le geste est fermé et le dit.
 * `{}` · rien à ajouter (le rendu reste celui d'avant).
 */
export async function lireGagnantesLignee(workspaceId: string, projet: { id: string; brandId: string }, resultats: readonly ResultatDeLignee[]): Promise<Record<string, GagnanteDuNoeud>> {
  if (!db || !resultats.length) return {};
  const g = await gardeResultats();
  if (!g.ok) return {};
  const ids = [...new Set(resultats.map((r) => r.adId).filter((x) => UUID.test(x)))];
  if (!ids.length) return {};
  const A = schema.ads;
  const lignes = await db.select({ id: A.id, sourceRef: A.sourceRef }).from(A).where(and(eq(A.workspaceId, workspaceId), inArray(A.id, ids)));
  const naissances = new Map<string, NaissanceGagnante>();
  for (const l of lignes) {
    const n = lireNaissanceGagnante(l.sourceRef);
    if (n) naissances.set(l.id.toLowerCase(), n);
  }
  if (!naissances.size && !resultats.some((r) => r.enLot)) return {};
  const dl = await chargerLots(workspaceId, projet.brandId);
  const parAd = new Map<string, AdRelueGagnante>([...dl.lots.flatMap((l) => l.ads), ...dl.horsLot].map((a) => [a.id.toLowerCase(), a]));
  const faits = faitsHypotheses(dl);
  const adsDuLot = (lotId: string) => dl.lots.find((l) => l.id === lotId)?.ads ?? [];
  const lots = [...new Map(faits.flatMap((f) => (f.lot ? [[f.lot.id, f] as const] : []))).values()]
    .map((f) => lotDeLaCarte(f, adsDuLot)).filter((x): x is LotPourGagnante => !!x);
  const base = { naissances, relue: (adId: string) => parAd.get(adId), lots };
  const enLot = resultats.some((r) => r.enLot);
  const o = { marqueActive: g.marque.id === projet.brandId, peutIterer: enLot ? await porteIterationGagnante(projet.brandId) : false };
  const sans = gagnantesDeLaLignee(resultats, { ...base, o });
  const plan = await planPourGestes(workspaceId, [gestesParAdDeLaLignee(resultats, sans)]).catch(() => null);
  return plan ? gagnantesDeLaLignee(resultats, { ...base, o: { ...o, plan } }) : sans;
}
