/**
 * Benchmark Studios · F-D · évaluer une release NON publiée, joindre les fiches
 * humaines, décider « benchmark approuvé ».
 *
 * ── Le verrou levé, et ce qui le garde ───────────────────────────────────────
 *
 * Publier exige (en production) un benchmark approuvé ; le registre n'exécutait
 * qu'une release publiée. Une release `staged` ne pouvait donc jamais être
 * évaluée. Le mode évaluation l'ouvre, et SEULEMENT dans ce cadre :
 *
 *  - la release est `staged`, non révoquée (une release `active` passe par le
 *    chemin normal ; une release retirée n'est jamais exécutée) ;
 *  - une campagne de benchmark AUTORISÉE est ouverte sur elle : une approbation
 *    ADMIN de budget sur CETTE release et CETTE empreinte, CONSOMMÉE par le
 *    lancement réel (ligne `campagne_reelle_demarree`), campagne non close (son
 *    rapport n'est pas encore joint) et pas plus vieille que la validité d'une
 *    approbation ;
 *  - la tâche tourne dans la portée SYNTHÉTIQUE du benchmark : jamais pour un
 *    utilisateur, jamais pour Jarvis, jamais pour un devis studio (qui épinglent
 *    le pointeur et refusent une release non publiée).
 *
 * ── Fiches humaines et décision ──────────────────────────────────────────────
 *
 * Une campagne réelle se termine forcément en « revue humaine requise » : les
 * fiches naissent vides. Le verdict n'est recalculé qu'avec les fiches remplies,
 * sur le rapport RÉEL scellé (mêmes invariants, mêmes statuts). Le geste
 * « benchmark approuvé » est séparé : il exige une évaluation réelle passée ET
 * des fiches remplies par des relecteurs nommés, et il ne publie rien.
 *
 * Pur.
 */

import { constatBench, RUBRIQUE_REFERENCE, type ConstatBench } from './cas';
import type { PlanCas } from './plan';
import { validerFiche, verdictCampagne, type FicheRevue, type ResultatCas, type VerdictCampagne } from './rubrique';
import { VALIDITE_APPROBATION_MS } from './reel';
import type { RapportCampagne } from './rapport';

/** Espace, marque et personne SYNTHÉTIQUES du benchmark · identifiants fixes, semis rejouable. */
export const PORTEE_BENCHMARK = {
  workspaceId: 'b3c00000-0000-4000-8000-00000000f0c1',
  brandId: 'b3c00000-0000-4000-8000-00000000f0c2',
  userId: 'b3c00000-0000-4000-8000-00000000f0c3',
} as const;

export const estPorteeBenchmark = (p: { workspaceId: string; brandId: string }) =>
  p.workspaceId === PORTEE_BENCHMARK.workspaceId && p.brandId === PORTEE_BENCHMARK.brandId;

/** Ce que le serveur a relu en base pour l'approbation que la demande cite. */
export interface CampagneRelue {
  approbationId: string;
  releaseId: string;
  releaseHash: string;
  /** Horodatage de la consommation par le lancement réel · `null` = jamais consommée. */
  consommeeLe: string | null;
  /** Un rapport de campagne est-il déjà joint pour cette approbation ? */
  close: boolean;
}

export interface DemandeEvaluation { releaseId: string; approbationId: string }

/** Liste vide = la tâche peut s'exécuter sur cette release `staged`, dans cette campagne. */
export function admissibiliteEvaluation(e: {
  release: { id: string; statut: string; hash: string; revoquee: boolean } | null;
  demande: DemandeEvaluation;
  campagne: CampagneRelue | null;
  portee: { workspaceId: string; brandId: string };
  maintenant: Date;
}): ConstatBench[] {
  const out: ConstatBench[] = [];
  const r = e.release;
  if (!r || r.id !== e.demande.releaseId) out.push(constatBench('RELEASE_INTROUVABLE', e.demande.releaseId, 'Release à évaluer introuvable.'));
  else {
    if (r.statut !== 'staged') out.push(constatBench('RELEASE_NON_EVALUABLE', r.id, `Le mode évaluation ne sert qu’une release staged (statut ${r.statut}).`));
    if (r.revoquee) out.push(constatBench('RELEASE_REVOQUEE', r.id, 'Release révoquée · jamais exécutée.'));
  }
  if (!estPorteeBenchmark(e.portee)) out.push(constatBench('PORTEE_NON_SYNTHETIQUE', e.portee.workspaceId, 'Une release non publiée ne sert jamais un espace réel · portée synthétique du benchmark seulement.'));
  const c = e.campagne;
  if (!c || c.approbationId !== e.demande.approbationId) out.push(constatBench('CAMPAGNE_ABSENTE', e.demande.approbationId, 'Aucune approbation ADMIN de benchmark sous cet identifiant.'));
  else {
    if (!r || c.releaseId !== r.id || c.releaseHash !== r.hash) out.push(constatBench('CAMPAGNE_AUTRE_RELEASE', c.approbationId, 'L’approbation vise une autre release ou une autre empreinte.'));
    if (!c.consommeeLe) out.push(constatBench('CAMPAGNE_NON_DEMARREE', c.approbationId, 'Approbation non consommée · aucune campagne réelle autorisée n’est en cours.'));
    else if (!(Date.parse(c.consommeeLe) + VALIDITE_APPROBATION_MS > e.maintenant.getTime())) out.push(constatBench('CAMPAGNE_EXPIREE', c.approbationId, 'Campagne démarrée il y a plus de 24 h · une nouvelle approbation est requise.'));
    if (c.close) out.push(constatBench('CAMPAGNE_CLOSE', c.approbationId, 'Le rapport de cette campagne est déjà joint · plus aucune tâche sur cette approbation.'));
  }
  return out;
}

/* ─────────────────────────────── fiches ─────────────────────────────────── */

export function ficheRemplie(f: FicheRevue): boolean {
  return f.sorties.length > 0 && f.sorties.every((s) => RUBRIQUE_REFERENCE.dimensions.every((d) => s.notes[d] !== null && s.notes[d] !== undefined) && !!s.relecteur?.trim());
}

/**
 * Le verdict d'une campagne RÉELLE recalculé avec les fiches remplies. Les
 * invariants et statuts viennent du rapport scellé, jamais d'une saisie.
 */
export function verdictAvecFiches(rapport: RapportCampagne, fiches: readonly FicheRevue[], plans: readonly PlanCas[]): { verdict: VerdictCampagne; constats: ConstatBench[] } {
  const constats: ConstatBench[] = [];
  if (rapport.mode !== 'reel') constats.push(constatBench('RAPPORT_SIMULE', 'mode', 'Des fiches ne se joignent qu’à une campagne RÉELLE.'));
  const parCas = new Map<string, FicheRevue>();
  for (const f of fiches) {
    if (parCas.has(f.cas)) constats.push(constatBench('FICHE_DOUBLON', f.cas, 'Deux fiches pour le même cas.'));
    parCas.set(f.cas, f);
  }
  const attendus = new Map(plans.filter((p) => p.revueHumaine.length > 0).map((p) => [p.id, p] as const));
  for (const [id, p] of attendus) {
    const f = parCas.get(id);
    if (!f) { constats.push(constatBench('FICHE_ABSENTE', id, 'Fiche de revue attendue pour ce cas.')); continue; }
    if (f.mode !== 'reel') constats.push(constatBench('FICHE_SIMULEE', id, 'Fiche d’une campagne simulée.'));
    if (f.sorties.length !== p.sorties || f.sorties.some((s, i) => s.sortie !== i)) constats.push(constatBench('FICHE_SORTIES', id, `${f.sorties.length} sortie(s) notée(s) · ${p.sorties} attendue(s).`));
    constats.push(...validerFiche(f, RUBRIQUE_REFERENCE));
  }
  for (const id of parCas.keys()) if (!attendus.has(id)) constats.push(constatBench('FICHE_EN_TROP', id, 'Ce cas n’a pas de revue humaine.'));
  const resultats: ResultatCas[] = rapport.cas.map((c) => ({ cas: c.cas, statut: c.statut, motif: c.motif, invariants: c.invariants, fiche: attendus.has(c.cas) ? parCas.get(c.cas) ?? null : null }));
  return { verdict: verdictCampagne({ mode: rapport.mode, rubrique: RUBRIQUE_REFERENCE, resultats }), constats };
}

/* ──────────────────────────── benchmark approuvé ────────────────────────── */

/** Ce que la jonction des fiches écrit (`studio_prompt_evaluations.result`, `kind = 'benchmark'`). */
export interface ResultatFichesBenchmark {
  type: 'fiches_benchmark';
  mode: 'reel' | 'simule';
  releaseHash: string;
  empreinteRapport: string;
  evaluationReelle: boolean;
  refus: string[];
  verdict: { statut: string; approuvable: boolean; moyenne: number | null };
  fiches: FicheRevue[];
}

export const estResultatFiches = (r: unknown): r is ResultatFichesBenchmark =>
  typeof r === 'object' && r !== null && (r as { type?: unknown }).type === 'fiches_benchmark' && Array.isArray((r as { fiches?: unknown }).fiches);

/**
 * Le geste « benchmark approuvé » · liste vide = permis. Exige une évaluation
 * benchmark RÉELLE passée sur CETTE empreinte, avec ses fiches remplies par des
 * relecteurs nommés, une release `staged` non révoquée et une personne nommée.
 */
export function controlerBenchmarkApprouve(e: {
  release: { id: string; statut: string; hash: string; revoquee: boolean; testsStructurels: boolean };
  evaluation: { id: string; releaseId: string | null; kind: string; passed: boolean; result: unknown } | null;
  approbateur: string | null;
  plans: readonly PlanCas[];
}): ConstatBench[] {
  const out: ConstatBench[] = [];
  const r = e.release;
  if (!e.approbateur) out.push(constatBench('APPROBATEUR_ANONYME', 'acteur', 'Une approbation de benchmark porte le nom d’une personne.'));
  if (r.statut !== 'staged') out.push(constatBench('RELEASE_NON_STAGED', r.id, `Seule une release en attente reçoit un benchmark approuvé (statut ${r.statut}).`));
  if (r.revoquee) out.push(constatBench('RELEASE_REVOQUEE', r.id, 'Release révoquée.'));
  if (!r.testsStructurels) out.push(constatBench('TESTS_STRUCTURELS_ABSENTS', r.id, 'Tests structurels non réussis sur cette empreinte.'));
  const ev = e.evaluation;
  if (!ev || ev.releaseId !== r.id || ev.kind !== 'benchmark') { out.push(constatBench('EVALUATION_ABSENTE', ev?.id ?? '', 'Aucune évaluation benchmark de cette release sous cet identifiant.')); return out; }
  const res = ev.result;
  if (!estResultatFiches(res)) { out.push(constatBench('FICHES_ABSENTES', ev.id, 'Évaluation sans fiches humaines jointes (rapport de campagne seul).')); return out; }
  if (res.mode !== 'reel' || !res.evaluationReelle) out.push(constatBench('EVALUATION_NON_REELLE', ev.id, 'Évaluation simulée ou non réelle · jamais un benchmark approuvé.'));
  if (!ev.passed || res.refus.length > 0 || !res.verdict.approuvable) out.push(constatBench('EVALUATION_NON_PASSEE', ev.id, `Évaluation non passée · ${res.refus.join(', ') || res.verdict.statut}.`));
  if (res.releaseHash !== r.hash) out.push(constatBench('EVALUATION_AUTRE_EMPREINTE', ev.id, 'Évaluation faite sur une autre empreinte de release.'));
  const attendus = e.plans.filter((p) => p.revueHumaine.length > 0).map((p) => p.id);
  const vides = attendus.filter((id) => { const f = res.fiches.find((x) => x.cas === id); return !f || !ficheRemplie(f); });
  if (vides.length) out.push(constatBench('FICHES_NON_REMPLIES', vides.join(','), `Fiches non remplies ou sans relecteur : ${vides.join(', ')}.`));
  return out;
}
