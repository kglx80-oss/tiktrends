import 'server-only';
import { etatConnaissance } from '@tiktrends/core';
import { PROFILS_MODELE } from './noyau';
import * as depot from './depot-prompts';
import { listerRuns, lireRun } from './resolveur';
import { chargerSource } from './source';
import { champsAffiches, variablesDe, diffVersions } from './vue';
import { LIBELLE_TYPE, entierVersVersion, lireEntrees, lireEvaluation, lireRevocation, typeDe, type TypeEntree } from './correspondance';
import { expurgerRun, type EvaluationTrace, type LigneRun, type PieceTrace } from './traces';
import { PROFILS_ROUTES_ANTHROPIC, modeleTexte } from './adaptateur';
import { listerConnaissances } from '../../jarvis-connaissances';
import { planEtDevis } from '../benchmark/programme';
import { usdLisible } from '@tiktrends/core';

/**
 * Lectures du registre de prompts (écran « Registre IA », ancien « IA et Studios ») · rows → vues SÉRIALISABLES.
 * Appelées par la page APRÈS la garde plateforme ; aucune n'écrit.
 */

/* ─────────────── Les vues SÉRIALISABLES du registre (écran Spatial « Registre IA ») ─────────────── */

import type { ChampEditable } from './types-registre';
export type { ChampEditable } from './types-registre';

export interface VueVersion {
  id: string; version: string; statut: string; empreinte: string; origine: string; motif: string; creeLe: string; valideeLe: string | null; horsSource: boolean;
}

export interface VueCle { type: string; libelleType: string; cle: string; titre: string; versions: VueVersion[] }

export interface VueDetail {
  cle: VueCle; version: VueVersion; champs: Array<{ champ: string; libelle: string; texte: string; contrat: boolean }>;
  variables: string[]; schemas: { entree: string; sortie: string; profil: string } | null; exemples: string | null;
  editables: ChampEditable[]; diff: { avec: VueVersion; champs: Array<{ libelle: string; lignes: Array<{ op: string; texte: string }> }> } | null;
}

export interface VueRelease {
  id: string; statut: string; empreinte: string; packHash: string; creeLe: string; motif: string; pointee: boolean;
  tests: boolean | null; benchmark: boolean; recetteManuelle: boolean; versions: number; conversation: string | null;
  /** Motif de révocation · `null` si la release n'est pas révoquée. */
  revocation: string | null;
}

export interface VueEvaluation { id: string; cible: string; type: string; passe: boolean; creeLe: string; tests: Array<{ id: string; passe: boolean; detail: string }>; benchmark: Array<{ id: string; titre: string; motif: string }> }

export interface VueBenchmark {
  devis: {
    chiffrable: boolean; total: number | null; totalLisible: string; partielLisible: string | null; nonChiffrables: string[]; empreinte: string | null; refus: string[];
    /** R3 · « maximum » seulement si toutes les lignes sont des bornes ; sinon estimation, avec la raison. */
    qualification: { maximum: boolean; libelle: string; raison: string | null };
    cas: Array<{ cas: string; appels: number; medias: number; totalLisible: string; chiffrable: boolean; motif: string | null }>;
  };
  releases: Array<{ id: string; statut: string; empreinte: string; revoquee: boolean; benchmarkApprouve: boolean }>;
  approbations: Array<{ id: string; release: string; budgetLisible: string; devisLisible: string; le: string; expireLe: string; consommee: boolean; par: string }>;
  campagnes: Array<{ id: string; releaseId: string; release: string; mode: 'reel' | 'simule'; banniere: string; passe: boolean; verdict: string; invariants: string; refus: string[]; depenseLisible: string; le: string; empreinteRapport: string }>;
  fiches: Array<{ id: string; releaseId: string; release: string; passe: boolean; verdict: string; refus: string[]; le: string; fiches: number }>;
}

export interface VueRun {
  id: string; quand: string; templateKey: string; statut: string; modele: string; releaseId: string | null; releaseHash: string; version: string;
  compiledHash: string; contextSnapshotHash: string; outputHash: string | null; latenceMs: number | null; coutUsd: number | null;
  sources: Array<{ type: string; titre: string; version: string }>; couches: Array<{ couche: string; empreinte: string }>; constats: string[];
  espace: string; marque: string; traceId: string | null; budget: string | null;
  /** Exécution d'évaluation (release staged dans une campagne de benchmark) · `null` sinon. */
  evaluation: { mode: string; approbationId: string; releaseStatut: string } | null;
  /** Pièces natives réellement envoyées (vision) · identifiants et empreintes, jamais les octets. */
  pieces: Array<{ bindingId: string; assetId: string; assetVersion: string; sha256: string; nativeAttachmentIndex: number; mime: string; octets: number | null; largeur: number | null; hauteur: number | null; jetonsMax: number | null }>;
}

const date = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');

function empreintesSource(): Set<string> {
  const s = chargerSource();
  return new Set([...Object.values(s.empreintes.templates), ...Object.values(s.empreintes.recettes), s.empreintes.commonSystemHash, s.empreintes.rendering, ...s.complement.map((c) => c.contentHash)]);
}

export async function vueVersions(types: readonly TypeEntree[], cleChoisie: string | null, versionChoisie: string | null, comparer: string | null): Promise<{ cles: VueCle[]; detail: VueDetail | null; plan: { aCreer: number; deja: number } | null; brouillonsImportes: number }> {
  const lignes = await depot.listerVersions();
  const source = empreintesSource();
  const parCle = new Map<string, VueCle>();
  const lignesParId = new Map(lignes.map((l) => [l.id, l]));
  for (const l of lignes) {
    const type = typeDe(l.kind, l.key);
    if (!type || !types.includes(type)) continue;
    const k = `${type}:${l.key}`;
    const c = (l.content ?? {}) as Record<string, unknown>;
    if (!parCle.has(k)) parCle.set(k, { type, libelleType: LIBELLE_TYPE[type], cle: l.key, titre: String(c.title ?? LIBELLE_TYPE[type]), versions: [] });
    const v: VueVersion = { id: l.id, version: entierVersVersion(l.version), statut: l.status, empreinte: l.contentHash, origine: l.origin, motif: l.reason, creeLe: date(l.createdAt), valideeLe: l.validatedAt ? date(l.validatedAt) : null, horsSource: !source.has(l.contentHash) };
    parCle.get(k)!.versions.push(v);
  }
  const ORDRE: Record<string, number> = { template: 0, conversation: 1, socle: 2, rendu: 3, recette: 4 };
  const cles = [...parCle.values()].sort((a, b) => (ORDRE[a.type] ?? 9) - (ORDRE[b.type] ?? 9) || a.cle.localeCompare(b.cle));
  const plan = await depot.planImportPack();
  let detail: VueDetail | null = null;
  const choisie = cleChoisie ? parCle.get(cleChoisie) : undefined;
  if (choisie) {
    const v = choisie.versions.find((x) => x.id === versionChoisie) ?? choisie.versions[0]!;
    const ligne = lignesParId.get(v.id)!;
    const type = choisie.type as TypeEntree;
    const contenu = ligne.content as Record<string, unknown>;
    const s = chargerSource();
    const exemple = type === 'template' ? s.exemples.find((x) => x.templateKey === ligne.key) : undefined;
    const editables = depot.CHAMPS_EDITABLES[type].map((champ) => {
      const brut = champ.startsWith('sections.') ? (contenu.sections as Record<string, unknown> | undefined)?.[champ.slice(9)] : contenu[champ];
      const liste = Array.isArray(brut);
      const libelle = champsAffiches(type, contenu).find((c) => c.champ === champ)?.libelle ?? champ;
      return { champ, libelle, valeur: liste ? (brut as string[]).join('\n') : String(brut ?? ''), ...(liste ? { liste: true } : {}) };
    });
    const autre = comparer ? choisie.versions.find((x) => x.id === comparer) : undefined;
    detail = {
      cle: choisie, version: v, champs: champsAffiches(type, contenu), variables: variablesDe(contenu),
      schemas: type === 'template' ? { entree: String(contenu.inputSchemaRef ?? '').split('/').pop() ?? '', sortie: String(contenu.outputSchemaRef ?? '').split('/').pop() ?? '', profil: String(contenu.modelProfile ?? '') } : null,
      exemples: exemple ? JSON.stringify({ entree: exemple.inputExample, sortieReady: exemple.readyOutputShapeExample, sortieBlocked: exemple.blockedOutputExample }, null, 2) : null,
      editables,
      diff: autre ? { avec: autre, champs: diffVersions(type, lignesParId.get(autre.id)!.content, contenu).map((d) => ({ libelle: d.libelle, lignes: d.lignes })) } : null,
    };
  }
  const raisonImport = depot.raisonImportPack();
  const brouillonsImportes = lignes.filter((l) => l.status === 'draft' && l.reason === raisonImport).length;
  return { cles, detail, plan: plan.ok ? { aCreer: plan.aCreer.length, deja: plan.dejaPresentes.length } : null, brouillonsImportes };
}

export async function vueReleases(): Promise<{ releases: VueRelease[]; pointee: string | null; selection: Array<{ cle: string; version: string }> }> {
  const [lignes, pointeur, versions] = await Promise.all([depot.listerReleases(), depot.lirePointeur(), depot.listerVersions()]);
  const pointee = pointeur?.releaseId ?? null;
  const releases: VueRelease[] = lignes.map((l) => {
    const e = lireEntrees(l.entries);
    const ev = lireEvaluation(l.evaluation);
    const valide = ev && ev.releaseHash === l.releaseHash ? ev : null;
    const conv = e?.conversations.find((c) => c.cle === 'jarvis.conversation');
    return {
      id: l.id, statut: l.status, empreinte: l.releaseHash, packHash: e?.packHash ?? '', creeLe: date(l.createdAt), motif: l.reason, pointee: l.id === pointee,
      tests: valide ? valide.testsStructurels : null, benchmark: !!valide?.benchmarkApprouve, recetteManuelle: !!valide?.recetteManuelle,
      versions: e ? e.templates.length + e.recettes.length + e.conversations.length + 2 : 0, conversation: conv ? conv.version : null,
      revocation: lireRevocation(l.evaluation)?.motif ?? null,
    };
  });
  const selection = [...depot.selectionParDefaut(versions).entries()].map(([cle, l]) => ({ cle, version: entierVersVersion(l.version) })).sort((a, b) => a.cle.localeCompare(b.cle));
  return { releases, pointee, selection };
}

export async function vueEvaluations(): Promise<VueEvaluation[]> {
  const [evs, releases, versions] = await Promise.all([depot.listerEvaluations(), depot.listerReleases(), depot.listerVersions()]);
  const r = new Map(releases.map((x) => [x.id, x]));
  const v = new Map(versions.map((x) => [x.id, x]));
  // Les évaluations de benchmark (approbations, rapports, fiches) ont leur propre section (`vueBenchmark`).
  return evs.filter((e) => e.kind === 'structural').map((e) => {
    const res = (e.result ?? {}) as { tests?: Array<{ id: string; passe: boolean; detail: string }>; benchmark?: Array<{ id: string; titre: string; motif: string }> };
    const cible = e.releaseId ? `release ${r.get(e.releaseId)?.releaseHash.slice(0, 12) ?? e.releaseId.slice(0, 8)}…` : e.promptVersionId ? `version ${v.get(e.promptVersionId)?.key ?? ''}@${v.get(e.promptVersionId) ? entierVersVersion(v.get(e.promptVersionId)!.version) : ''}` : '·';
    return { id: e.id, cible, type: e.kind === 'structural' ? 'Structurelle' : e.kind === 'benchmark' ? 'Benchmark' : 'Manuelle', passe: e.passed, creeLe: date(e.createdAt), tests: res.tests ?? [], benchmark: res.benchmark ?? [] };
  });
}

export function vueRoutage(): Array<{ profil: string; fournisseur: string; statut: string; note: string }> {
  const cle = !!process.env.ANTHROPIC_API_KEY;
  return PROFILS_MODELE.map((p) => PROFILS_ROUTES_ANTHROPIC.includes(p)
    ? { profil: p, fournisseur: `Anthropic · ${modeleTexte()} · via la barrière de dépense`, statut: cle ? 'configuré' : 'absent', note: cle ? 'Servi par le résolveur (texte structuré, sans outil).' : 'Fournisseur non configuré · les tâches de ce profil sont refusées, sans repli.' }
    : { profil: p, fournisseur: 'Non branché dans ce lot', statut: 'non branché', note: 'Une tâche de ce profil est bloquée avant appel (UNSUPPORTED_CAPABILITY).' });
}

function versRun(l: LigneRun): VueRun {
  const x = expurgerRun(l);
  const cfg = x.config as Record<string, any>;
  const budget = cfg.budget ? `${cfg.budget.jetonsUtilises}/${cfg.budget.budgetJetons} jetons${cfg.budget.troncature ? ' · troncature signalée' : ''}` : null;
  return {
    id: x.id, quand: date(x.quand), templateKey: x.templateKey, statut: x.statut, modele: x.modele, releaseId: x.releaseId, releaseHash: String(cfg.releaseHash ?? ''),
    version: cfg.conversation ? `${cfg.conversation.cle}@${cfg.conversation.version}` : `${x.templateKey}@${cfg.templateVersion ?? '?'}`,
    compiledHash: x.compiledHash, contextSnapshotHash: x.contextSnapshotHash, outputHash: x.outputHash, latenceMs: x.latenceMs, coutUsd: x.coutUsd,
    sources: x.sources.map((s) => ({ type: s.type, titre: s.titre, version: s.version })),
    couches: Array.isArray(cfg.couches) ? cfg.couches.map((c: { couche: string; empreinte: string }) => ({ couche: c.couche, empreinte: c.empreinte })) : [],
    constats: Array.isArray(cfg.constats) ? cfg.constats.map((c: { code: string }) => c.code) : [],
    espace: x.espace, marque: x.marque, traceId: x.traceId, budget,
    // G-A · déjà expurgés par `expurgerRun` (listes blanches de `traces.ts`).
    evaluation: (cfg.evaluation as EvaluationTrace | null | undefined) ?? null,
    pieces: Array.isArray(cfg.mediaBindings) ? (cfg.mediaBindings as PieceTrace[]) : [],
  };
}

export async function vueExecutions(runId: string | null): Promise<{ runs: VueRun[]; detail: VueRun | null }> {
  const lignes = await listerRuns(60);
  const runs = lignes.map((l) => versRun(l as unknown as LigneRun));
  let detail = runId ? runs.find((r) => r.id === runId) ?? null : null;
  if (runId && !detail && depot.estUuid(runId)) {
    const l = await lireRun(runId);
    detail = l ? versRun(l as unknown as LigneRun) : null;
  }
  return { runs, detail };
}

export async function vueConnaissances(): Promise<{ publiees: number; retirees: number; brouillons: number }> {
  const liste = await listerConnaissances();
  let publiees = 0, retirees = 0, brouillons = 0;
  for (const c of liste) {
    const e = etatConnaissance(c);
    if (e.etat === 'publie') publiees++; else if (e.etat === 'retire') retirees++; else brouillons++;
  }
  return { publiees, retirees, brouillons };
}

/**
 * Onglet Évaluations · benchmark F01-F24 (lot F-D). Le devis est recalculé ici
 * (aucun appel, aucune écriture) ; approbations, rapports joints et fiches sont
 * relus dans `studio_prompt_evaluations`. Rien de ce qui est montré n'est
 * reçu du navigateur.
 */
export async function vueBenchmark(): Promise<VueBenchmark> {
  const [evs, releases] = await Promise.all([depot.listerEvaluations(), depot.listerReleases()]);
  const pd = planEtDevis(null);
  const devis: VueBenchmark['devis'] = !pd.ok
    ? { chiffrable: false, total: null, totalLisible: 'non chiffrable', partielLisible: null, nonChiffrables: [], empreinte: null, cas: [], refus: pd.refus.map((c) => `${c.code} · ${c.message}`), qualification: { maximum: false, libelle: 'non chiffrable', raison: null } }
    : {
      chiffrable: pd.devis.ok, total: pd.devis.ok ? pd.devis.totalUsdMicros : null, totalLisible: pd.devis.ok ? usdLisible(pd.devis.totalUsdMicros) : 'non chiffrable',
      partielLisible: pd.devis.ok ? null : usdLisible(pd.devis.totalPartielUsdMicros), nonChiffrables: pd.devis.ok ? [] : pd.devis.nonChiffrables,
      empreinte: pd.devis.ok ? pd.devis.empreinte : null, refus: [],
      qualification: { maximum: pd.devis.qualification.nature === 'borne', libelle: pd.devis.qualification.libelle, raison: pd.devis.qualification.raison },
      cas: pd.devis.cas.map((c) => ({ cas: c.cas, appels: c.appels, medias: c.medias, totalLisible: usdLisible(c.totalUsdMicros), chiffrable: c.chiffrable, motif: c.lignes.find((l) => l.motif)?.motif ?? null })),
    };
  const parRelease = new Map(releases.map((r) => [r.id, r]));
  const court = (id: string | null) => (id ? `${parRelease.get(id)?.releaseHash.slice(0, 12) ?? id.slice(0, 8)}…` : '·');
  const res = (r: unknown) => (r ?? {}) as Record<string, any>;
  const consommees = new Set(evs.filter((e) => e.kind === 'benchmark' && res(e.result).type === 'campagne_reelle_demarree').map((e) => String(res(e.result).approbationId)));
  return {
    devis,
    releases: releases.filter((r) => r.status === 'staged' || r.status === 'active').map((r) => {
      const ev = lireEvaluation(r.evaluation);
      return { id: r.id, statut: r.status, empreinte: r.releaseHash, revoquee: !!lireRevocation(r.evaluation), benchmarkApprouve: !!(ev && ev.releaseHash === r.releaseHash && ev.benchmarkApprouve) };
    }),
    approbations: evs.filter((e) => e.kind === 'manual' && res(e.result).type === 'approbation_budget_benchmark').map((e) => ({
      id: e.id, release: court(e.releaseId), budgetLisible: usdLisible(Number(res(e.result).budgetUsdMicros)), devisLisible: usdLisible(Number(res(e.result).devisTotalUsdMicros)),
      le: date(res(e.result).le), expireLe: date(res(e.result).expireLe), consommee: consommees.has(e.id), par: e.evaluatorId ?? '·',
    })),
    campagnes: evs.filter((e) => e.kind === 'benchmark' && res(e.result).type === 'campagne_benchmark').map((e) => {
      const r = res(e.result);
      return {
        id: e.id, releaseId: e.releaseId ?? '', release: court(e.releaseId), mode: r.mode === 'reel' ? 'reel' as const : 'simule' as const, banniere: String(r.banniere ?? ''), passe: e.passed,
        verdict: String(r.verdict?.statut ?? '·'), invariants: r.verdict?.invariants ? `${r.verdict.invariants.passes}/${r.verdict.invariants.total}` : '·',
        refus: Array.isArray(r.refus) ? r.refus.map(String) : [], depenseLisible: usdLisible(Number(r.depenseUsdMicros ?? 0)), le: date(e.createdAt), empreinteRapport: String(r.empreinteRapport ?? ''),
      };
    }),
    fiches: evs.filter((e) => e.kind === 'benchmark' && res(e.result).type === 'fiches_benchmark').map((e) => {
      const r = res(e.result);
      return { id: e.id, releaseId: e.releaseId ?? '', release: court(e.releaseId), passe: e.passed, verdict: String(r.verdict?.statut ?? '·'), refus: Array.isArray(r.refus) ? r.refus.map(String) : [], le: date(e.createdAt), fiches: Array.isArray(r.fiches) ? r.fiches.length : 0 };
    }),
  };
}
