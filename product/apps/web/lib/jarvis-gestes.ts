import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  iterationProjetDepuisVariantes, dejaTesteesSurPub, etatLotSpatial, gestesContexteJarvis, parentDepuisPlan, reponseLisible, variablesDuPlan, variantesEssaiProjet,
  type CandidatIteration, type CandidatProjetJarvis, type ChoixVariablesIteration, type DemandeContexteJarvis, type GesteJarvis, type TestedVariable,
  type VarianteEssaiJarvis,
} from '@tiktrends/core';
import type { Session } from './auth';
import { effectiveAccess } from './access';
import { canAccess, FEATURES } from './rbac';
import { gardeStudio } from './studios/garde';
import { getActiveBrand } from './brands';
import { listerVariantes } from './studios/variantes/variantes';
import { chargerLots, type AdLue, type LotLu } from '../app/(spatial)/sp/adsmap/donnees';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';

/**
 * Jarvis qui AGIT, sans rien appliquer seul (lot 5 bis V5) · le côté serveur.
 * Les règles vivent au noyau (`C/spatial/jarvis/gestes.ts`).
 *
 * Deux lectures, jamais une écriture, aucun modèle :
 *  · la RÉPONSE désignée par une adresse (`?reponse=<uuid>`) · relue dans la
 *    portée de la session (espace, marque ACTIVE, personne, rôle « assistant »)
 *    · une réponse d'une autre marque, d'une autre personne, inconnue ou mal
 *    formée rend `null` · l'appelant dit `REFUS_GESTE_JARVIS` ;
 *  · le CONTEXTE (lot ou hypothèse) · la fonction `adsmap`, puis
 *    `chargerLots(espace, marque ACTIVE)`, la lecture des écrans Résultats ·
 *    un lot ou une ad d'une autre marque n'y figure pas.
 */

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLue = Pick<Session, 'workspaceId' | 'role' | 'plan' | 'user' | 'equipe'>;

/**
 * Le texte lisible d'une réponse de Jarvis, dans la portée · `null` hors portée.
 * `projectId` (lot 5 ter · panneau d'un projet) · la réponse doit en plus
 * appartenir au fil LIÉ à CE projet (sa conversation, même espace, marque et
 * personne) · une réponse du fil principal ou d'un autre projet est refusée.
 */
export async function lireReponseJarvis(s: SessionLue, brandId: string, id: string, o: { projectId?: string } = {}): Promise<string | null> {
  if (!db || !UUID.test(id)) return null;
  if (o.projectId !== undefined && !UUID.test(o.projectId)) return null;
  const M = schema.jarvisMessages;
  const C = schema.jarvisConversations;
  try {
    const portee = and(eq(M.id, id), eq(M.workspaceId, s.workspaceId), eq(M.brandId, brandId), eq(M.userId, s.user.id), eq(M.role, 'assistant'));
    const [m] = o.projectId === undefined
      ? await db.select({ content: M.content }).from(M).where(portee).limit(1)
      : await db.select({ content: M.content }).from(M)
        .innerJoin(C, eq(C.id, M.conversationId))
        .where(and(portee, eq(C.projectId, o.projectId), eq(C.workspaceId, s.workspaceId), eq(C.brandId, brandId), eq(C.userId, s.user.id)))
        .limit(1);
    return m ? reponseLisible(m.content).texte : null;
  } catch {
    return null;
  }
}

/** Le plan d'itération de la marque active, ce que la suite en lit · les variables admises et ce que la lignée a changé, par pub. */
export interface PlanLu { variables: Record<string, ChoixVariablesIteration>; lignees: Record<string, TestedVariable[]> }

/** Les lignes du plan (`iterationPlanAction`, ses gardes) → par pub · `null` plan illisible ou fermé. */
export function planDepuisLignes(rows: Parameters<typeof variablesDuPlan>[0]): PlanLu {
  const variables = variablesDuPlan(rows);
  const lignees = Object.fromEntries(Object.keys(variables).map((id) => [id, [...(parentDepuisPlan(rows, id)?.lignee ?? [])]]));
  return { variables, lignees };
}

export async function lirePlanIteration(): Promise<PlanLu | null> {
  try {
    const r = await iterationPlanAction();
    return r.view ? planDepuisLignes(r.view.rows) : null;
  } catch {
    return null;
  }
}

/**
 * Les candidates d'Itérer depuis une réponse · les pubs du contexte QUI SONT
 * dans le plan (liste fermée, lue dans la marque), leurs variables admises et
 * ce qui a déjà été testé sur chacune (sa variable testée, sa lignée).
 */
export function candidatsDuPlan(ads: ReadonlyArray<{ id: string; variante: string; variable: string | null; alias?: readonly string[] }>, plan: PlanLu): CandidatIteration[] {
  return ads.filter((a) => plan.variables[a.id]).map((a) => ({
    adId: a.id, variante: a.variante, variables: plan.variables[a.id]!,
    dejaTestees: dejaTesteesSurPub(a.variable, plan.lignees[a.id] ?? []),
    ...(a.alias ? { alias: a.alias } : {}),
  }));
}

/** Les codes des AUTRES pubs du contexte (hors des candidates) · nommée seule, l'une d'elles ne désigne aucune gagnante. */
export function exclusDuContexte(ads: ReadonlyArray<{ id: string; variante: string }>, candidats: readonly CandidatIteration[]): string[] {
  const pris = new Set(candidats.map((c) => c.adId));
  return ads.filter((a) => !pris.has(a.id)).map((a) => a.variante);
}

/**
 * Les variantes gagnantes d'un PROJET, relues dans la portée (garde studio ·
 * rôle, marques visibles) ET dans la marque active · `null` hors portée
 * (autre marque, autre espace, sans droit, inconnu) · aucune écriture.
 */
export async function lireCandidatsProjet(s: SessionLue, brandId: string, projectId: string): Promise<{ candidats: Array<CandidatProjetJarvis & { variable: string | null }>; autres: string[] } | null> {
  if (!db || !UUID.test(projectId)) return null;
  if (!canAccess(effectiveAccess(s), ADSMAP)) return null;
  try {
    const g = await gardeStudio('studio.read');
    if (!g.ok || g.ctx.workspaceId !== s.workspaceId || !g.ctx.marques.includes(brandId)) return null;
    const P = schema.studioProjects;
    const [p] = await db.select({ id: P.id }).from(P).where(and(eq(P.id, projectId), eq(P.workspaceId, s.workspaceId), eq(P.brandId, brandId))).limit(1);
    if (!p) return null;
    const r = await listerVariantes(g.ctx, { projectId }, { adsmapAcces: true, relecture: { disponible: false, raison: null, coutMaxUsd: null } });
    if (!r.ok) return null;
    const variables = new Map(r.donnees.variantes.flatMap((v) => (v.test ? [[v.test.adsmapAdId.toLowerCase(), v.test.variable] as const] : [])));
    const it = iterationProjetDepuisVariantes(r.donnees);
    return { candidats: it.candidats.map((c) => ({ ...c, variable: variables.get(c.adId) ?? null })), autres: it.autres };
  } catch {
    return null;
  }
}

export interface ContexteGestesLu {
  /** Les variantes du contexte · celles du lot, ou la seule ad de l'hypothèse. */
  ads: AdLue[];
  /** Le lot à conclure · le lot joint, ou celui de l'hypothèse. */
  lot: LotLu | null;
  etat: ReturnType<typeof etatLotSpatial> | null;
}

/** Le lot ou l'hypothèse, relu dans la marque active · `null` hors portée (autre marque, sans droit, inconnu). */
export async function lireContexteGestes(s: SessionLue, brandId: string, demande: DemandeContexteJarvis, maintenant: Date = new Date()): Promise<ContexteGestesLu | null> {
  if (demande.type !== 'lot' && demande.type !== 'hypothese') return null;
  if (!canAccess(effectiveAccess(s), ADSMAP)) return null;
  try {
    const d = await chargerLots(s.workspaceId, brandId, maintenant);
    if (demande.type === 'lot') {
      const lot = d.lots.find((l) => l.id === demande.id);
      return lot ? { ads: lot.ads, lot, etat: etatLotSpatial(lot, d.ctx) } : null;
    }
    const ad = [...d.lots.flatMap((l) => l.ads), ...d.horsLot].find((a) => a.id === demande.id);
    if (!ad) return null;
    const lot = ad.lotId ? d.lots.find((l) => l.id === ad.lotId) ?? null : null;
    return { ads: [ad], lot, etat: lot ? etatLotSpatial(lot, d.ctx) : null };
  } catch {
    return null;
  }
}

/**
 * Les gestes d'un contexte joint à `/jarvis` · `null` pour une page de Résultats, un projet, ou hors portée.
 * Lot 5 ter · `candidats` · les pubs du contexte dans le plan de la marque (leurs
 * variables admises, ce qui a été testé) · la règle de « Autre variable » et de
 * « Pourquoi ? » les lit sous CHAQUE réponse (`suiteReponseJarvis`, noyau) ·
 * vide quand le plan est illisible (aucune suite proposée, l'écran Itérer relit tout).
 */
export async function gestesPourContexte(s: SessionLue, brandId: string, demande: DemandeContexteJarvis, maintenant: Date = new Date()):
  Promise<{ iterer: GesteJarvis; conclure: GesteJarvis; candidats: CandidatIteration[]; exclus: string[] } | null> {
  const c = await lireContexteGestes(s, brandId, demande, maintenant);
  if (!c) return null;
  const g = gestesContexteJarvis({
    type: demande.type, id: demande.id, ads: c.ads,
    lot: c.lot && c.etat ? { id: c.lot.id, etat: c.etat, ads: c.lot.ads } : null,
  });
  if (!g) return null;
  const plan = g.iterer.cible ? await lirePlanIteration() : null;
  const candidats = plan ? candidatsDuPlan(c.ads, plan) : [];
  return { ...g, candidats, exclus: exclusDuContexte(c.ads, candidats) };
}

/* ───────────────────────── lot 5 quater · « Tester » et « Corriger le texte » ───────────────────────── */

/**
 * La liste FERMÉE des variantes Studio d'un contexte, relue dans la portée ·
 *  · un PROJET · ses variantes (garde studio, marque visible ET active,
 *    `listerVariantes`), nommées par leur libellé d'écran ;
 *  · un LOT ou une HYPOTHÈSE · ses pubs (relues dans la marque active,
 *    `lireContexteGestes`) qui viennent d'une variante Studio (`studio_test_links`
 *    de l'espace ET de la marque), nommées par leur code · les autres pubs du
 *    contexte sont des `exclus` (nommée seule, l'une d'elles ne désigne rien).
 * `null` hors portée (autre marque, autre espace, sans droit, inconnu) · aucune écriture.
 */
export async function lireVariantesEssai(s: SessionLue, brandId: string, demande: DemandeContexteJarvis, maintenant: Date = new Date()): Promise<{ variantes: VarianteEssaiJarvis[]; exclus: string[] } | null> {
  if (!db || !UUID.test(demande.id)) return null;
  try {
    if (demande.type === 'projet') {
      const g = await gardeStudio('studio.read');
      if (!g.ok || g.ctx.workspaceId !== s.workspaceId || !g.ctx.marques.includes(brandId)) return null;
      const P = schema.studioProjects;
      const [p] = await db.select({ id: P.id }).from(P).where(and(eq(P.id, demande.id), eq(P.workspaceId, s.workspaceId), eq(P.brandId, brandId))).limit(1);
      if (!p) return null;
      const r = await listerVariantes(g.ctx, { projectId: p.id }, { adsmapAcces: canAccess(effectiveAccess(s), ADSMAP), relecture: { disponible: false, raison: null, coutMaxUsd: null } });
      return r.ok ? { variantes: variantesEssaiProjet(p.id, r.donnees), exclus: [] } : null;
    }
    const c = await lireContexteGestes(s, brandId, demande, maintenant);
    if (!c) return null;
    const g = await gardeStudio('studio.read');
    const ids = c.ads.map((a) => a.id);
    const studio = g.ok && g.ctx.workspaceId === s.workspaceId && g.ctx.marques.includes(brandId);
    const L = schema.studioTestLinks;
    const V = schema.studioVariants;
    const liens = studio && ids.length
      ? await db.select({ adId: L.adsmapAdId, varianteId: L.variantId, projectId: V.projectId }).from(L)
        .innerJoin(V, and(eq(V.id, L.variantId), eq(V.workspaceId, L.workspaceId), eq(V.brandId, L.brandId)))
        .where(and(eq(L.workspaceId, s.workspaceId), eq(L.brandId, brandId), inArray(L.adsmapAdId, ids)))
      : [];
    const parAd = new Map(liens.map((l) => [l.adId.toLowerCase(), l]));
    const essai = g.ok && g.ctx.permissions.espace.has('studio.propose');
    const variantes: VarianteEssaiJarvis[] = c.ads.flatMap((a) => {
      const l = parAd.get(a.id.toLowerCase());
      return l ? [{ varianteId: l.varianteId.toLowerCase(), projectId: l.projectId.toLowerCase(), nom: a.variante, enTest: true, rattachable: false, essai }] : [];
    });
    return { variantes, exclus: c.ads.filter((a) => !parAd.has(a.id.toLowerCase())).map((a) => a.variante) };
  } catch {
    return null;
  }
}

/**
 * L'écran d'arrivée de « Tester » ou « Corriger le texte » · la réponse relue
 * dans la portée (espace, marque ACTIVE, personne · et le fil LIÉ au projet
 * quand le contexte est un projet), la liste fermée des variantes du contexte
 * relue de même · `null` · la phrase de refus (`REFUS_GESTE_JARVIS`), rien de
 * pré-rempli. Aucune écriture, aucun modèle.
 */
export async function lireGesteEssaiPourProjet(s: SessionLue, geste: { reponse: string; contexte: DemandeContexteJarvis }): Promise<{ texte: string; variantes: VarianteEssaiJarvis[]; exclus: string[] } | null> {
  const active = await getActiveBrand(s.workspaceId).catch(() => null);
  if (!active) return null;
  const [texte, l] = await Promise.all([
    lireReponseJarvis(s, active.id, geste.reponse, geste.contexte.type === 'projet' ? { projectId: geste.contexte.id } : {}),
    lireVariantesEssai(s, active.id, geste.contexte),
  ]);
  return texte && l ? { texte, ...l } : null;
}
