/**
 * Benchmark Studios · rapport de campagne et règle « un rapport simulé ne vaut
 * jamais évaluation réelle ».
 *
 * Le rapport porte son mode dans TROIS endroits indépendants : `mode`, la
 * bannière, et l'empreinte (calculée sur le tout). Un rapport simulé dont on
 * réécrit `mode` à la main perd son empreinte ; un rapport dont on recalcule
 * l'empreinte garde des traces d'exécution SIMULÉES en base, que le serveur
 * relit avant d'accepter quoi que ce soit (`runs` vérifiés).
 *
 * Pur.
 */

import { constatBench, type ConstatBench } from './cas';
import { empreinteContenu } from '../version';
import type { ModeCampagne, ResultatCas, VerdictCampagne } from './rubrique';

export const BANNIERE_SIMULE = 'SIMULÉ · exécution sur fournisseurs simulés, aucune évaluation réelle de la qualité';
export const BANNIERE_REEL = 'RÉEL · fournisseurs réels sous budget approuvé';
export const FORMAT_RAPPORT = 'tiktrends-benchmark-studios/1';

export interface RapportCampagne {
  format: typeof FORMAT_RAPPORT;
  mode: ModeCampagne;
  banniere: string;
  horodatage: string;
  release: { id: string; hash: string };
  modele: string | null;
  adaptateur: string;
  devis: { chiffrable: boolean; totalUsdMicros: number | null; empreinte: string | null; nonChiffrables: string[] };
  budget: { usdMicros: number | null; approbationId: string | null };
  depenseUsdMicros: number;
  arrete: string | null;
  cas: Array<Pick<ResultatCas, 'cas' | 'statut' | 'motif' | 'invariants'> & { fiche: boolean; runIds: string[]; dossier: string }>;
  verdict: VerdictCampagne;
  empreinte: string;
}

export function banniere(mode: ModeCampagne): string {
  return mode === 'reel' ? BANNIERE_REEL : BANNIERE_SIMULE;
}

export function empreinteRapport(r: Omit<RapportCampagne, 'empreinte'> | RapportCampagne): string {
  const { empreinte: _e, ...corps } = r as RapportCampagne;
  return empreinteContenu(corps);
}

export function sceller(r: Omit<RapportCampagne, 'empreinte'>): RapportCampagne {
  return { ...r, empreinte: empreinteRapport(r) };
}

/** Ce que le serveur a relu en base pour les `runIds` du rapport. */
export interface RunsVerifies { attendus: number; trouves: number; reels: number; autreRelease: number }

/**
 * Un rapport peut-il valoir ÉVALUATION RÉELLE de cette release ? Liste vide =
 * oui. Toute campagne simulée est refusée, quelle que soit sa note.
 */
export function refusEvaluationReelle(r: RapportCampagne, release: { id: string; hash: string }, runs: RunsVerifies): ConstatBench[] {
  const out: ConstatBench[] = [];
  if (r.format !== FORMAT_RAPPORT) out.push(constatBench('RAPPORT_ILLISIBLE', 'format', 'Format de rapport inconnu.'));
  if (r.empreinte !== empreinteRapport(r)) out.push(constatBench('RAPPORT_ALTERE', 'empreinte', 'Le rapport a été modifié après sa production.'));
  if (r.mode !== 'reel' || r.banniere !== BANNIERE_REEL || !r.verdict.evaluationReelle) out.push(constatBench('RAPPORT_SIMULE', 'mode', 'Campagne simulée · elle prouve la chaîne, jamais la qualité d’une release.'));
  if (r.release.id !== release.id || r.release.hash !== release.hash) out.push(constatBench('RELEASE_DIFFERENTE', 'release', 'Le rapport porte sur une autre release ou une autre empreinte.'));
  if (!r.verdict.approuvable) out.push(constatBench('VERDICT_NON_CONFORME', r.verdict.statut, `Verdict ${r.verdict.statut} · ${r.verdict.motifs.join(' ; ')}`));
  if (runs.attendus === 0 || runs.trouves !== runs.attendus) out.push(constatBench('TRACES_MANQUANTES', 'runIds', `${runs.trouves}/${runs.attendus} traces d’exécution retrouvées.`));
  if (runs.reels !== runs.trouves) out.push(constatBench('TRACES_SIMULEES', 'runIds', `${runs.trouves - runs.reels} trace(s) d’exécution simulée(s).`));
  if (runs.autreRelease > 0) out.push(constatBench('TRACES_AUTRE_RELEASE', 'runIds', `${runs.autreRelease} trace(s) servie(s) par une autre release.`));
  return out;
}
