/**
 * Benchmark Studios · programme serveur : plan et devis, approbation ADMIN,
 * lancements simulé et réel, rattachement à l'évaluation d'une release.
 *
 * ── Support de l'approbation (aucune migration) ──────────────────────────────
 *
 * L'approbation d'un budget de benchmark est une ÉVALUATION de release
 * (`studio_prompt_evaluations`, `kind = 'manual'`), écrite sous la permission
 * plateforme `prompt.evaluate` de l'ADMIN « IA et Studios » (accès total
 * d'équipe seulement, SEC-09). Elle vise UNE release (identifiant et
 * empreinte), UN devis (empreinte calculée par le serveur, jamais reçue du
 * client) et un budget maximal ; elle expire (24 h) et ne sert qu'UNE fois :
 * la campagne qui la consomme écrit une ligne `kind = 'benchmark'`
 * (`campagne_reelle_demarree`) sous verrou consultatif, AVANT tout appel.
 *
 * Le devis approuvé L3 (`studio_quotes` / `studio_approvals`) a été écarté :
 * il est lié à un projet, une version et une marque, et son approbation
 * déclenche un job du worker ; le benchmark évalue une release de la
 * plateforme, sans projet.
 *
 * ── Rattachement ─────────────────────────────────────────────────────────────
 *
 * Le rapport d'une campagne (même simulée) se joint à la release comme
 * évaluation `kind = 'benchmark'`. `passed` n'est vrai que pour un rapport
 * RÉEL, conforme, scellé, dont toutes les traces relues en base sont réelles
 * et servies par cette release. Rien d'autre n'est touché : ni le pointeur,
 * ni le statut, ni `evaluation.benchmarkApprouve` de la release. Aucune
 * publication automatique.
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  autoriserCampagneReelle, constatBench, devisAgrege, empreinteContenu, empreinteRapport, lireBenchmark, lireBudgetUsd, planCampagne, refusEvaluationReelle, tarifsDuProduit,
  verdictAvecFiches, PERMISSIONS_PLATEFORME, PORTEE_BENCHMARK, VALIDITE_APPROBATION_MS,
  type ApprobationBudget, type BenchmarkLu, type ConstatBench, type DevisAgrege, type FicheRevue, type PlanCas, type RapportCampagne, type ResultatFichesBenchmark,
} from '@tiktrends/core';
import { autorise } from '../prompts/noyau';
import { PACK_EMBARQUE } from '../prompts/pack-embarque';
import { chargerSource } from '../prompts/source';
import { PROFILS_ROUTES_ANTHROPIC, modeleTexte, type AdaptateurModele } from '../prompts/adaptateur';
import * as depot from '../prompts/depot-prompts';
import { environnementPrompts, type EnvironnementPrompts } from '../prompts/environnement';
import { spendStatus } from '../../spend-guard';
import { executerCampagne, type ExecuteurMedias, type ResultatCampagne } from './campagne';
import { genererJeu } from './jeu-synthetique';
import type { Jeu } from './scenarios';

type Acteur = depot.Acteur;
const PLATEFORME = { niveau: 'plateforme' } as const;
const E = schema.studioPromptEvaluations;

export type Res<T> = ({ ok: true } & T) | { ok: false; refus: ConstatBench[] };
const refus = (code: string, cible: string, message: string) => ({ ok: false as const, refus: [constatBench(code, cible, message)] });

/* ───────────────────────────── plan et devis ────────────────────────────── */

export function benchmarkEmbarque(): BenchmarkLu {
  const r = lireBenchmark(PACK_EMBARQUE.benchmark.texte, new Set(chargerSource().pack.templates.map((t) => t.key)));
  if (!r.ok) throw new Error(`09-BENCHMARK embarqué invalide · ${r.constats.map((c) => `${c.code} ${c.cible}`).join(' ; ')}`);
  return r.benchmark;
}

/** Le routage de PRODUCTION · celui qu'un appel réel prendrait (seul `reasoning_structured` est routé). */
export function routageProduction(): Record<string, string | null> {
  const profils = new Set(chargerSource().pack.templates.map((t) => t.modelProfile));
  return Object.fromEntries([...profils].map((p) => [p, PROFILS_ROUTES_ANTHROPIC.includes(p) ? modeleTexte() : null]));
}

export function planEtDevis(cas?: readonly string[] | null): Res<{ plans: PlanCas[]; devis: DevisAgrege }> {
  const b = benchmarkEmbarque();
  const p = planCampagne(b, cas ?? null);
  if (!p.ok) return { ok: false, refus: p.constats };
  const profils = Object.fromEntries(chargerSource().pack.templates.map((t) => [t.key, t.modelProfile]));
  return { ok: true, plans: p.plans, devis: devisAgrege(p.plans, tarifsDuProduit({ profils, routage: routageProduction() })) };
}

/* ─────────────────────────────── portée ─────────────────────────────────── */

/** Espace, marque et personne SYNTHÉTIQUES du benchmark · définis dans le noyau (le résolveur les exige en mode évaluation). */
export { PORTEE_BENCHMARK };

export async function semerPorteeBenchmark(): Promise<void> {
  await db.insert(schema.workspaces).values({ id: PORTEE_BENCHMARK.workspaceId, name: 'Benchmark Studios (synthétique)', plan: 'core' }).onConflictDoNothing();
  await db.insert(schema.users).values({ id: PORTEE_BENCHMARK.userId, email: 'benchmark-studios@local.invalid' }).onConflictDoNothing();
  await db.insert(schema.brands).values({ id: PORTEE_BENCHMARK.brandId, workspaceId: PORTEE_BENCHMARK.workspaceId, name: 'Marque synthétique du benchmark' }).onConflictDoNothing();
}

/** Acteur du script en RECETTE LOCALE seulement (environnement « test »). */
export function acteurScriptLocal(): Acteur {
  return { userId: null, roleEffectif: 'script:bench-studios(recette-locale)', traceId: `st_${randomUUID()}`, octrois: PERMISSIONS_PLATEFORME.map((permission) => ({ permission, portee: PLATEFORME })) };
}

/* ─────────────────────────────── release ────────────────────────────────── */

export interface EtatRelease { id: string; hash: string; executable: boolean; motif: string | null; epinglee: boolean; evaluation: boolean }

/**
 * La release que la campagne exécute. Sans identifiant : celle du pointeur.
 * Avec un identifiant : une release PUBLIÉE (épinglée, comme un job), ou une
 * release `staged` en MODE ÉVALUATION (lot F-D) : le résolveur ne l'exécute
 * que dans la campagne dont l'approbation vient d'être consommée, dans la
 * portée synthétique. Une release retirée ou révoquée n'est jamais exécutée.
 */
export async function etatRelease(releaseId?: string | null): Promise<EtatRelease | null> {
  if (releaseId) {
    if (!depot.estUuid(releaseId)) return null;
    const c = await depot.releaseChargee(releaseId);
    if (!c) return null;
    const statutOk = c.ligne.status === 'active' || c.ligne.status === 'staged';
    const executable = statutOk && !c.noyau.revocation;
    return {
      id: c.ligne.id, hash: c.ligne.releaseHash, executable, epinglee: c.ligne.status === 'active', evaluation: c.ligne.status === 'staged',
      motif: executable ? null : c.noyau.revocation ? `Release révoquée · ${c.noyau.revocation.motif}` : `Release ${c.ligne.status} · jamais exécutée (seules une release publiée ou une release staged en évaluation le sont).`,
    };
  }
  const c = await depot.releaseActive();
  if (!c) return null;
  return { id: c.ligne.id, hash: c.ligne.releaseHash, executable: !c.noyau.revocation, epinglee: false, evaluation: false, motif: c.noyau.revocation ? `Release révoquée · ${c.noyau.revocation.motif}` : null };
}

/** Recette locale : la release pointée, sinon import → validation → release → évaluation → publication en « test ». */
export async function preparerReleaseLocale(env: EnvironnementPrompts): Promise<EtatRelease> {
  if (env !== 'test') throw new Error('Préparation d’une release réservée à la recette locale (environnement « test »).');
  const deja = await etatRelease(null);
  if (deja?.executable) return deja;
  const a = acteurScriptLocal();
  const imp = await depot.importerPack(a);
  if (!imp.ok) throw new Error(`import · ${JSON.stringify(imp.constats)}`);
  for (const l of await depot.listerVersions()) {
    if (l.status !== 'draft') continue;
    const v = await depot.validerVersion(a, { id: l.id });
    if (!v.ok) throw new Error(`validation ${l.key} · ${JSON.stringify(v.constats)}`);
  }
  const r = await depot.creerRelease(a, { motif: 'Benchmark Studios · recette locale' });
  if (!r.ok) throw new Error(`release · ${JSON.stringify(r.constats)}`);
  const ev = await depot.evaluerRelease(a, { releaseId: r.id });
  if (!ev.ok) throw new Error(`évaluation · ${JSON.stringify(ev.constats)}`);
  const p = await depot.lirePointeur();
  const pub = await depot.publierRelease(a, { releaseId: r.id, attendue: p?.releaseId ?? null, environnement: 'test' });
  if (!pub.ok) throw new Error(`publication · ${JSON.stringify(pub.constats)}`);
  const e = await etatRelease(null);
  if (!e) throw new Error('Release publiée introuvable.');
  return e;
}

/* ─────────────────────────────── audit ──────────────────────────────────── */

async function auditer(ex: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0], a: Acteur, action: string, cible: string, details: Record<string, unknown>, raison = '') {
  await ex.insert(schema.studioAuditEvents).values({
    actorId: a.userId, effectiveRole: a.roleEffectif, workspaceId: null, brandId: null, action, targetType: 'prompt_release', targetId: cible,
    versionBefore: null, versionAfter: null, reason: raison.slice(0, 2000), traceId: a.traceId, details,
  });
}

/* ─────────────────────────────── approbation ────────────────────────────── */

interface ResultatApprobation {
  type: 'approbation_budget_benchmark'; releaseHash: string; devisEmpreinte: string; devisTotalUsdMicros: number; budgetUsdMicros: number;
  cas: string[]; motif: string; le: string; expireLe: string;
}

/**
 * Approbation ADMIN d'un budget de benchmark · `prompt.evaluate` (plateforme).
 * Le devis est RECALCULÉ ici : l'ADMIN approuve ce que le serveur chiffre.
 */
export async function approuverBudgetBenchmark(a: Acteur, e: { releaseId: unknown; cas?: unknown; budgetUsd: unknown; motif: unknown }, maintenant = new Date()): Promise<Res<{ approbationId: string; devisEmpreinte: string; budgetUsdMicros: number; expireLe: string }>> {
  if (!autorise(a.octrois, 'prompt.evaluate', PLATEFORME)) return refus('FORBIDDEN', 'prompt.evaluate', 'Réservé à l’ADMIN « IA et Studios » (prompt.evaluate).');
  if (!a.userId) return refus('FORBIDDEN', 'acteur', 'Une approbation de dépense porte le nom d’une personne.');
  const motif = typeof e.motif === 'string' ? e.motif.trim().slice(0, 2000) : '';
  if (!motif) return refus('INVALID_SCHEMA', 'motif', 'Indique pourquoi ce budget est approuvé.');
  if (typeof e.releaseId !== 'string' || !depot.estUuid(e.releaseId)) return refus('NOT_FOUND', 'release', 'Release introuvable.');
  const cas = Array.isArray(e.cas) && e.cas.every((x) => typeof x === 'string') ? (e.cas as string[]) : null;
  const pd = planEtDevis(cas);
  if (!pd.ok) return pd;
  if (!pd.devis.ok) return refus('DEVIS_NON_CHIFFRABLE', pd.devis.nonChiffrables.join(','), `Aucune approbation d’un devis non chiffrable · cas : ${pd.devis.nonChiffrables.join(', ')}.`);
  const b = lireBudgetUsd(typeof e.budgetUsd === 'number' ? String(e.budgetUsd) : typeof e.budgetUsd === 'string' ? e.budgetUsd : undefined);
  if (!b.ok) return refus(b.code, 'budgetUsd', 'Budget absent ou illisible.');
  if (b.micros < pd.devis.totalUsdMicros) return refus('BUDGET_INFERIEUR_AU_DEVIS', 'budgetUsd', `Budget ${b.micros} µ$ < devis ${pd.devis.totalUsdMicros} µ$.`);
  const ligne = await depot.lireReleaseParId(e.releaseId);
  if (!ligne) return refus('NOT_FOUND', 'release', 'Release introuvable.');
  if ((ligne.evaluation as { revocation?: unknown } | null)?.revocation) return refus('RELEASE_REVOQUEE', ligne.id, 'Release révoquée.');
  if (ligne.status !== 'staged' && ligne.status !== 'active') return refus('RELEASE_NON_EVALUABLE', ligne.id, `Release ${ligne.status} · seules une release en attente ou publiée s’évaluent.`);
  const expireLe = new Date(maintenant.getTime() + VALIDITE_APPROBATION_MS).toISOString();
  const result: ResultatApprobation = {
    type: 'approbation_budget_benchmark', releaseHash: ligne.releaseHash, devisEmpreinte: pd.devis.empreinte, devisTotalUsdMicros: pd.devis.totalUsdMicros,
    budgetUsdMicros: b.micros, cas: pd.plans.map((p) => p.id), motif, le: maintenant.toISOString(), expireLe,
  };
  return db.transaction(async (tx) => {
    const [l] = await tx.insert(E).values({ releaseId: ligne.id, kind: 'manual', passed: true, evaluatorId: a.userId, result }).returning({ id: E.id });
    await auditer(tx, a, 'prompt.benchmark.approuver_budget', ligne.id, { approbationId: l!.id, devisEmpreinte: result.devisEmpreinte, budgetUsdMicros: b.micros, cas: result.cas }, motif);
    return { ok: true as const, approbationId: l!.id, devisEmpreinte: result.devisEmpreinte, budgetUsdMicros: b.micros, expireLe };
  });
}

const estApprobation = (r: unknown): r is ResultatApprobation => typeof r === 'object' && r !== null && (r as { type?: unknown }).type === 'approbation_budget_benchmark';
const approbationConsommee = (r: unknown, id: string) => typeof r === 'object' && r !== null && (r as { type?: unknown }).type === 'campagne_reelle_demarree' && (r as { approbationId?: unknown }).approbationId === id;

/** La dernière approbation de CE devis sur CETTE release · lecture seule. */
export async function lireApprobation(releaseId: string, devisEmpreinte: string | null): Promise<ApprobationBudget | null> {
  if (!devisEmpreinte) return null;
  const lignes = await db.select().from(E).where(and(eq(E.releaseId, releaseId), inArray(E.kind, ['manual', 'benchmark']))).orderBy(desc(E.createdAt));
  const a = lignes.find((l) => l.kind === 'manual' && estApprobation(l.result) && l.result.devisEmpreinte === devisEmpreinte);
  if (!a || !estApprobation(a.result)) return null;
  return {
    id: a.id, releaseId, releaseHash: a.result.releaseHash, devisEmpreinte: a.result.devisEmpreinte, budgetUsdMicros: a.result.budgetUsdMicros,
    approuvePar: a.evaluatorId, le: a.result.le, expireLe: a.result.expireLe, consommee: lignes.some((l) => l.kind === 'benchmark' && approbationConsommee(l.result, a.id)),
  };
}

/** Consomme l'approbation UNE fois (verrou consultatif) · faux si une autre campagne l'a déjà prise. */
export async function consommerApprobation(ap: ApprobationBudget, budgetUsdMicros: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bench-approbation:${ap.id}`}))`);
    const lignes = await tx.select({ result: E.result }).from(E).where(and(eq(E.releaseId, ap.releaseId), eq(E.kind, 'benchmark')));
    if (lignes.some((l) => approbationConsommee(l.result, ap.id))) return false;
    await tx.insert(E).values({ releaseId: ap.releaseId, kind: 'benchmark', passed: false, evaluatorId: ap.approuvePar, result: { type: 'campagne_reelle_demarree', approbationId: ap.id, budgetUsdMicros, le: new Date().toISOString() } });
    return true;
  });
}

/* ─────────────────────────────── rattachement ───────────────────────────── */

async function tracesVerifiees(rapport: RapportCampagne, releaseId: string) {
  const runIds = [...new Set(rapport.cas.flatMap((c) => c.runIds))].filter(depot.estUuid);
  const runs = runIds.length ? await db.select({ id: schema.studioPromptRuns.id, release: schema.studioPromptRuns.promptReleaseId, config: schema.studioPromptRuns.config }).from(schema.studioPromptRuns).where(inArray(schema.studioPromptRuns.id, runIds)) : [];
  return {
    attendus: runIds.length, trouves: runs.length,
    reels: runs.filter((r) => (r.config as { simule?: unknown } | null)?.simule === false).length,
    autreRelease: runs.filter((r) => r.release !== releaseId).length,
  };
}

export async function joindreCampagne(a: Acteur, e: { releaseId: string; rapport: RapportCampagne }): Promise<Res<{ evaluationId: string; evaluationReelle: boolean; motifs: string[] }>> {
  if (!autorise(a.octrois, 'prompt.evaluate', PLATEFORME)) return refus('FORBIDDEN', 'prompt.evaluate', 'Réservé à l’ADMIN « IA et Studios » (prompt.evaluate).');
  const ligne = depot.estUuid(e.releaseId) ? await depot.lireReleaseParId(e.releaseId) : null;
  if (!ligne) return refus('NOT_FOUND', 'release', 'Release introuvable.');
  const verifies = await tracesVerifiees(e.rapport, ligne.id);
  const motifs = refusEvaluationReelle(e.rapport, { id: ligne.id, hash: ligne.releaseHash }, verifies);
  const evaluationReelle = motifs.length === 0;
  const result = {
    type: 'campagne_benchmark', mode: e.rapport.mode, approbationId: e.rapport.budget.approbationId, banniere: e.rapport.banniere, empreinteRapport: e.rapport.empreinte, horodatage: e.rapport.horodatage,
    evaluationReelle, refus: motifs.map((m) => m.code), traces: verifies,
    verdict: { statut: e.rapport.verdict.statut, approuvable: e.rapport.verdict.approuvable, invariants: e.rapport.verdict.invariants, moyenne: e.rapport.verdict.moyenne },
    cas: e.rapport.cas.map((c) => ({ cas: c.cas, statut: c.statut, invariantsPasses: c.invariants.filter((i) => i.passe === true).length, invariants: c.invariants.length })),
    devis: e.rapport.devis, depenseUsdMicros: e.rapport.depenseUsdMicros,
  };
  return db.transaction(async (tx) => {
    const [l] = await tx.insert(E).values({ releaseId: ligne.id, kind: 'benchmark', passed: evaluationReelle, evaluatorId: a.userId, result }).returning({ id: E.id });
    await auditer(tx, a, 'prompt.benchmark.joindre', ligne.id, { evaluationId: l!.id, mode: e.rapport.mode, evaluationReelle, refus: result.refus });
    return { ok: true as const, evaluationId: l!.id, evaluationReelle, motifs: motifs.map((m) => `${m.code} · ${m.message}`) };
  });
}

/* ─────────────────────────────── fiches humaines ─────────────────────────── */

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Lecture prudente des fiches reçues · forme seulement, les notes sont jugées par le noyau. */
function lireFiches(x: unknown): FicheRevue[] | null {
  if (!Array.isArray(x) || x.length > 50) return null;
  const out: FicheRevue[] = [];
  for (const f of x) {
    if (!estObjet(f) || typeof f.cas !== 'string' || !Array.isArray(f.sorties) || f.sorties.length > 10) return null;
    const sorties = [];
    for (const s of f.sorties) {
      if (!estObjet(s) || typeof s.sortie !== 'number' || !estObjet(s.notes)) return null;
      const notes = Object.fromEntries(Object.entries(s.notes).map(([k, v]) => [k, typeof v === 'number' ? v : null]));
      const defauts = Array.isArray(s.defautsCritiques) ? s.defautsCritiques.filter(estObjet).map((d) => ({ description: String(d.description ?? '').slice(0, 500), accepte: d.accepte === true })) : [];
      sorties.push({ sortie: s.sortie, notes: notes as FicheRevue['sorties'][number]['notes'], defautsCritiques: defauts, relecteur: typeof s.relecteur === 'string' && s.relecteur.trim() ? s.relecteur.trim().slice(0, 160) : null, commentaire: String(s.commentaire ?? '').slice(0, 2000) });
    }
    out.push({
      cas: f.cas, titre: String(f.titre ?? ''), mode: f.mode === 'reel' ? 'reel' : 'simule', criteres: Array.isArray(f.criteres) ? f.criteres.map(String) : [],
      oracleAttendu: String(f.oracleAttendu ?? ''), dimensions: Array.isArray(f.dimensions) ? (f.dimensions.map(String) as FicheRevue['dimensions'][number][]) : [],
      echelle: Array.isArray(f.echelle) ? f.echelle.map(Number) : [], sorties,
    });
  }
  return out;
}

/**
 * Joint les fiches de revue HUMAINE remplies à une campagne RÉELLE déjà jointe
 * (même rapport scellé, mêmes traces relues en base) et recalcule le verdict.
 * `passed` n'est vrai que si plus rien ne s'y oppose : rapport réel intègre,
 * traces réelles de cette release, fiches complètes et nommées, verdict
 * CONFORME et approuvable. Rien d'autre ne bouge (ni pointeur, ni statut, ni
 * `benchmarkApprouve`) : la décision reste le geste « Benchmark approuvé ».
 */
export async function joindreFichesRevue(a: Acteur, e: { releaseId: unknown; rapport: unknown; fiches: unknown }): Promise<Res<{ evaluationId: string; passed: boolean; motifs: string[] }>> {
  if (!autorise(a.octrois, 'prompt.evaluate', PLATEFORME)) return refus('FORBIDDEN', 'prompt.evaluate', 'Réservé à l’ADMIN « IA et Studios » (prompt.evaluate).');
  if (!a.userId) return refus('FORBIDDEN', 'acteur', 'Des fiches de revue portent le nom d’une personne.');
  const ligne = typeof e.releaseId === 'string' && depot.estUuid(e.releaseId) ? await depot.lireReleaseParId(e.releaseId) : null;
  if (!ligne) return refus('NOT_FOUND', 'release', 'Release introuvable.');
  const rapport = e.rapport as RapportCampagne;
  if (!estObjet(e.rapport) || !Array.isArray(rapport.cas) || !estObjet(rapport.verdict) || !estObjet(rapport.release) || !estObjet(rapport.budget)) return refus('RAPPORT_ILLISIBLE', 'rapport', 'Rapport de campagne illisible (rapport.json attendu).');
  if (empreinteRapport(rapport) !== rapport.empreinte) return refus('RAPPORT_ALTERE', 'rapport', 'Le rapport a été modifié après sa production (empreinte recalculée différente).');
  const fiches = lireFiches(e.fiches);
  if (!fiches) return refus('FICHES_ILLISIBLES', 'fiches', 'Fiches illisibles (liste des fiche-revue.json attendue).');
  const jointes = await db.select({ result: E.result }).from(E).where(and(eq(E.releaseId, ligne.id), eq(E.kind, 'benchmark')));
  const campagne = jointes.find((l) => (l.result as { type?: unknown; empreinteRapport?: unknown } | null)?.type === 'campagne_benchmark' && (l.result as { empreinteRapport?: unknown }).empreinteRapport === rapport.empreinte);
  if (!campagne) return refus('RAPPORT_NON_JOINT', 'rapport', 'Ce rapport n’a pas été joint à cette release par une campagne.');
  const verifies = await tracesVerifiees(rapport, ligne.id);
  const motifsRapport = refusEvaluationReelle(rapport, { id: ligne.id, hash: ligne.releaseHash }, verifies).filter((m) => m.code !== 'VERDICT_NON_CONFORME');
  const pd = planEtDevis(null);
  if (!pd.ok) return pd;
  const { verdict, constats } = verdictAvecFiches(rapport, fiches, pd.plans);
  const motifs: ConstatBench[] = [...motifsRapport, ...constats, ...(verdict.approuvable ? [] : [constatBench('VERDICT_NON_CONFORME', verdict.statut, verdict.motifs.join(' ; '))])];
  const passed = motifs.length === 0;
  const result: ResultatFichesBenchmark & { empreinteFiches: string; par: string; traces: typeof verifies } = {
    type: 'fiches_benchmark', mode: rapport.mode, releaseHash: ligne.releaseHash, empreinteRapport: rapport.empreinte, evaluationReelle: motifsRapport.length === 0,
    refus: motifs.map((m) => m.code), verdict: { statut: verdict.statut, approuvable: verdict.approuvable, moyenne: verdict.moyenne }, fiches,
    empreinteFiches: empreinteContenu({ fiches }), par: a.userId, traces: verifies,
  };
  return db.transaction(async (tx) => {
    const [l] = await tx.insert(E).values({ releaseId: ligne.id, kind: 'benchmark', passed, evaluatorId: a.userId, result }).returning({ id: E.id });
    await auditer(tx, a, 'prompt.benchmark.joindre_fiches', ligne.id, { evaluationId: l!.id, passed, refus: result.refus, empreinteRapport: rapport.empreinte });
    return { ok: true as const, evaluationId: l!.id, passed, motifs: motifs.map((m) => `${m.code} · ${m.message}`) };
  });
}

/* ─────────────────────────────── lancements ─────────────────────────────── */

export async function lancerCampagneSimulee(e: { cas?: readonly string[] | null; racine: string | null; env?: Readonly<Record<string, string | undefined>>; jeu?: Jeu; maintenant?: Date }): Promise<Res<{ resultat: ResultatCampagne; evaluationId: string; release: EtatRelease }>> {
  const environnement = environnementPrompts(e.env ?? process.env);
  if (environnement !== 'test') return refus('SIMULE_HORS_RECETTE', 'environnement', 'La campagne simulée ne tourne qu’en recette locale : STUDIOS_PROMPTS_RECETTE_LOCALE=1 et une base locale. Un fournisseur simulé ne sert jamais ailleurs.');
  const pd = planEtDevis(e.cas);
  if (!pd.ok) return pd;
  await semerPorteeBenchmark();
  const release = await preparerReleaseLocale(environnement);
  const resultat = await executerCampagne({
    mode: 'simule', plans: pd.plans, devis: pd.devis, release, portee: { workspaceId: PORTEE_BENCHMARK.workspaceId, brandId: PORTEE_BENCHMARK.brandId },
    userId: PORTEE_BENCHMARK.userId, adaptateur: 'simule', medias: null, environnement, budgetUsdMicros: null, approbationId: null,
    jeu: e.jeu ?? await genererJeu(), racine: e.racine, maintenant: e.maintenant,
  });
  const j = await joindreCampagne(acteurScriptLocal(), { releaseId: release.id, rapport: resultat.rapport });
  if (!j.ok) return j;
  return { ok: true, resultat, evaluationId: j.evaluationId, release };
}

export interface EntreeReelle {
  budgetBrut: string | undefined | null;
  releaseId?: string | null;
  cas?: readonly string[] | null;
  /** Adaptateur texte RÉEL (barrière de dépense) · `null` si non configuré. */
  adaptateur: AdaptateurModele | null;
  /** Exécuteur média RÉEL (lot F-A, branché à l'intégration) · `null` sinon. */
  medias: ExecuteurMedias | null;
  racine: string | null;
  jeu?: Jeu;
  maintenant?: Date;
  /** Variables lues (environnement du registre) · défaut `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Campagne RÉELLE · toutes les conditions sont vérifiées AVANT la moindre
 * écriture et le moindre appel. Un refus ne laisse aucune ligne.
 */
export async function lancerCampagneReelle(e: EntreeReelle): Promise<Res<{ resultat: ResultatCampagne; evaluationId: string; evaluationReelle: boolean }>> {
  const maintenant = e.maintenant ?? new Date();
  const pd = planEtDevis(e.cas);
  if (!pd.ok) return pd;
  const release = await etatRelease(e.releaseId ?? null);
  const s = await spendStatus();
  const approbation = release ? await lireApprobation(release.id, pd.devis.ok ? pd.devis.empreinte : null) : null;
  const manques: string[] = [];
  if (!e.adaptateur) manques.push('texte (adaptateur réel non configuré)');
  else if (e.adaptateur.simule) manques.push('texte (adaptateur simulé interdit en réel)');
  const profils = [...new Set(pd.plans.flatMap((p) => p.medias.map((m) => m.profil)))];
  for (const p of profils) if (!e.medias || !e.medias.profils.includes(p)) manques.push(p);
  const aut = autoriserCampagneReelle({
    budgetBrut: e.budgetBrut, devis: pd.devis, plafond: { capUsd: s.capUsd, depenseUsd: s.spentUsd, bloque: s.blocked }, approbation,
    release, executeurs: { manques }, maintenant,
  });
  if (!aut.ok) return { ok: false, refus: aut.refus };
  if (!approbation || !release || !e.adaptateur) return refus('ETAT_INCOHERENT', '', 'État incohérent après autorisation.');
  if (!(await consommerApprobation(approbation, aut.budgetUsdMicros))) return refus('APPROBATION_CONSOMMEE', approbation.id, 'Approbation déjà utilisée par une campagne.');
  await semerPorteeBenchmark();
  const resultat = await executerCampagne({
    mode: 'reel', plans: pd.plans, devis: pd.devis, release, portee: { workspaceId: PORTEE_BENCHMARK.workspaceId, brandId: PORTEE_BENCHMARK.brandId },
    userId: approbation.approuvePar, adaptateur: e.adaptateur, medias: e.medias, environnement: environnementPrompts(e.env ?? process.env),
    budgetUsdMicros: aut.budgetUsdMicros, approbationId: approbation.id, jeu: e.jeu ?? await genererJeu(), racine: e.racine, maintenant,
  });
  const acteur: Acteur = { userId: approbation.approuvePar, roleEffectif: `script:bench-studios(approbation ${approbation.id})`, traceId: `st_${randomUUID()}`, octrois: [{ permission: 'prompt.evaluate', portee: PLATEFORME }] };
  const j = await joindreCampagne(acteur, { releaseId: release.id, rapport: resultat.rapport });
  if (!j.ok) return j;
  return { ok: true, resultat, evaluationId: j.evaluationId, evaluationReelle: j.evaluationReelle };
}
