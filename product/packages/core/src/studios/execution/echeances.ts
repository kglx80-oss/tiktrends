/**
 * Studios · L3 · échéances du worker · AUCUN job sans issue (C1, I2).
 *
 * Pur · ni base, ni réseau, ni horloge (l'heure est passée par l'appelant).
 *
 * Avant, quatre états n'avaient pas de fin : `running` sondé à l'infini quand
 * fal répond 500/429 (lu « transitoire »), `cancel_requested` idem,
 * `persisting` retenté tous les 2 s sans borne (jusqu'à 64 Mio retéléchargés
 * par tour), et `reconciliation_required` sans identifiant de requête,
 * simplement « examiné » · « Vérification en cours… » infini, crédits jamais
 * rendus. Ici, chaque état actif a une ÉCHÉANCE, mesurée depuis l'entrée dans
 * l'état, et une issue au-delà :
 *
 *   running, cancel_requested · `reconciliation_required` (worker) · le coût
 *                               reste incertain, JAMAIS une resoumission ; la
 *                               réconciliation continue de lire le fournisseur ;
 *   reconciliation_required   · `failed` en `facture_sans_livrable`
 *                               (réconciliateur) · crédits du client rendus,
 *                               coût fournisseur retenu (le plafond devisé, la
 *                               ligne `ai_spend` gardée) ;
 *   persisting                · recul exponentiel borné entre deux essais,
 *                               puis `failed` en `facture_sans_livrable`
 *                               (finaliseur) · crédits rendus.
 *
 * ── Les durées connues, et d'où elles viennent ───────────────────────────────
 *
 * | profil        | durée mesurée                         | plus longue durée connue                                   | échéance = 4 × |
 * | ------------- | ------------------------------------- | ---------------------------------------------------------- | -------------- |
 * | image         | 12 à 22 s (Nano Banana 2, GPT Image 2, étude des studios) | 300 s · `IMAGE_MODELS` (GPT Image 2 · Haute), délai où l'ancien chemin ABANDONNAIT, file fal comprise | **20 min** |
 * | clip          | Kling 5 s ≈ 1 à 2 min, Veo 8 s ≈ 1 à 3 min (étude)        | 15 min · `DELAI_VIDEO_HISTORIQUE_MS`, où l'ancien studio vidéo coupait un clip Kling de la file fal | **60 min** |
 * | transcription | aucune mesure au dépôt                | aucune · on prend la plus longue des mesurées (clip)        | **60 min** |
 *
 * Marge 4 · une tâche saine n'en approche pas · l'échéance image est 54 fois
 * la plus longue durée mesurée (22 s), 4 fois le délai d'abandon de l'ancien
 * chemin · l'échéance clip 20 fois les 3 min de Veo, 4 fois la coupure de
 * l'ancien studio. Une échéance trop courte ferait échouer une tâche saine
 * (le client perd son média, nous payons) · trop longue, elle ne fait que
 * retarder l'issue · le doute penche vers la longueur. Le seuil « bloquée »
 * de `/admin/taches` (30 min dérivées, puis mesuré par modèle) reste l'alerte
 * humaine ; ces échéances sont la borne du worker.
 *
 * Persistance · le pire des téléchargements d'une tâche (4 sorties × 3 essais ×
 * 60 s, `IMAGES_PAR_APPEL_MAX` × `TELECHARGEMENTS_MEDIA_MAX` ×
 * `DELAI_TELECHARGEMENT_FAL_MS`, même cumul que `PHASES_DUREE_TACHE`) vaut
 * 720 s · fois 4 · **48 min**, pour tout profil.
 *
 * Recul entre deux essais de persistance · 20 s (le délai de relecture S3 du
 * worker et celui d'une lecture fal, `DELAI_LECTURE_FAL_MS` · un essai ne
 * repart jamais avant qu'une lecture ait pu expirer), doublé à chaque échec,
 * plafonné à 10 min · 20, 40, 80, 160, 320, 600, 600… s · 8 à 9 essais dans les
 * 48 min au lieu d'un tous les 2 s (≈ 1 440 retéléchargements).
 *
 * ── L'entrée dans l'état ─────────────────────────────────────────────────────
 *
 * Chaque transition du worker pose `result.etatDepuis = { etat, a }` (même
 * écriture que l'état, même horloge que la décision). Une marque d'un AUTRE
 * état (transition écrite ailleurs · l'annulation du site) ou absente (job
 * antérieur) se replie sur `updated_at` · aucune colonne, aucune migration.
 */

import type { ActeurJob, EtatJob } from '../machines';
import type { IssueFinanciere } from './registre';
import { IMAGE_MODELS } from '../../economics';
import { DELAI_VIDEO_HISTORIQUE_MS } from '../creations-historiques';
import { IMAGES_PAR_APPEL_MAX } from '../fournisseurs/fal-image';
import { TELECHARGEMENTS_MEDIA_MAX } from './media';

const MIN = 60_000;

export type ProfilEcheance = 'image' | 'clip' | 'transcription';

export interface DureeConnue {
  /** Fourchette mesurée (ms) · `null` quand aucune mesure n'existe. */
  mesureeMs: readonly [number, number] | null;
  /** Plus longue durée connue (ms) · la base de l'échéance. */
  hauteMs: number;
  source: string;
}

const DELAI_IMAGE_MAX_MS = Math.max(...IMAGE_MODELS.map((m) => m.timeoutMs ?? 0));

/** Le tableau de l'en-tête, lu par le code (une valeur qui change fait bouger l'échéance, et tomber sa garde). */
export const DUREES_CONNUES_TRAVAIL: Readonly<Record<ProfilEcheance, DureeConnue>> = {
  image: { mesureeMs: [12_000, 22_000], hauteMs: DELAI_IMAGE_MAX_MS, source: 'étude 12 à 22 s · IMAGE_MODELS timeoutMs max' },
  clip: { mesureeMs: [MIN, 3 * MIN], hauteMs: DELAI_VIDEO_HISTORIQUE_MS, source: 'étude Kling 1 à 2 min, Veo 1 à 3 min · DELAI_VIDEO_HISTORIQUE_MS' },
  transcription: { mesureeMs: null, hauteMs: DELAI_VIDEO_HISTORIQUE_MS, source: 'aucune mesure · la plus longue des mesurées (clip)' },
};

export const MARGE_ECHEANCE = 4;

const minuteSup = (ms: number) => Math.ceil(ms / MIN) * MIN;

/** L'échéance du travail chez le fournisseur, par profil · 20 min, 60 min, 60 min. */
export const ECHEANCES_TRAVAIL_MS: Readonly<Record<ProfilEcheance, number>> = {
  image: minuteSup(MARGE_ECHEANCE * DUREES_CONNUES_TRAVAIL.image.hauteMs),
  clip: minuteSup(MARGE_ECHEANCE * DUREES_CONNUES_TRAVAIL.clip.hauteMs),
  transcription: minuteSup(MARGE_ECHEANCE * DUREES_CONNUES_TRAVAIL.transcription.hauteMs),
};

/** Délai de téléchargement d'une sortie · `DELAI_TELECHARGEMENT_FAL_MS` (l'intégration), recopié et vérifié par la garde du worker. */
export const DELAI_TELECHARGEMENT_SORTIE_MS = 60_000;
/** 4 × (4 sorties × 3 essais × 60 s) = 48 min. */
export const ECHEANCE_PERSISTANCE_MS = minuteSup(MARGE_ECHEANCE * IMAGES_PAR_APPEL_MAX * TELECHARGEMENTS_MEDIA_MAX * DELAI_TELECHARGEMENT_SORTIE_MS);

export const RECUL_PERSISTANCE_BASE_MS = 20_000;
export const RECUL_PERSISTANCE_MAX_MS = 10 * MIN;

export const ETATS_A_ECHEANCE: readonly EtatJob[] = ['running', 'cancel_requested', 'persisting', 'reconciliation_required'];

/** Le profil d'une tâche · la ligne de l'instantané dont l'échéance est la plus longue. */
export function profilEcheance(lignes: ReadonlyArray<{ operation?: unknown; profil?: unknown }> | null | undefined): ProfilEcheance {
  const rang: Readonly<Record<ProfilEcheance, number>> = { image: 0, transcription: 1, clip: 2 };
  let p: ProfilEcheance = 'image';
  for (const l of lignes ?? []) {
    const op = String(l?.operation ?? '');
    const q: ProfilEcheance = l?.profil === 'animation' || /^clip:|video|vidéo/i.test(op) ? 'clip'
      : l?.profil === 'speech' || /transcri|sous.?titre|scribe/i.test(op) ? 'transcription'
        : 'image';
    if (rang[q] > rang[p]) p = q;
  }
  return p;
}

/** L'échéance d'un état pour un profil · `null` quand l'état n'en a pas. */
export function echeanceEtat(etat: EtatJob, profil: ProfilEcheance): number | null {
  if (etat === 'persisting') return ECHEANCE_PERSISTANCE_MS;
  if (etat === 'running' || etat === 'cancel_requested' || etat === 'reconciliation_required') return ECHEANCES_TRAVAIL_MS[profil];
  return null;
}

const libelleMin = (ms: number) => `${Math.round(ms / MIN)} min`;

export type SuiteEcheance =
  | { echu: false }
  | { echu: true; vers: 'reconciliation_required' | 'failed'; acteur: ActeurJob; issue: IssueFinanciere | null; motif: string };

/** Échu · STRICTEMENT au-delà de l'échéance, comptée depuis l'entrée dans l'état. */
export function decisionEcheance(e: { etat: EtatJob; profil: ProfilEcheance; entreeLe: Date; maintenant: Date }): SuiteEcheance {
  const ms = echeanceEtat(e.etat, e.profil);
  if (ms === null || !(e.maintenant.getTime() - e.entreeLe.getTime() > ms)) return { echu: false };
  const duree = libelleMin(ms);
  switch (e.etat) {
    case 'running':
      return { echu: true, vers: 'reconciliation_required', acteur: 'worker', issue: null, motif: `échéance dépassée · aucune issue du fournisseur en ${duree} (${e.profil}) · coût à rapprocher, rien n’est resoumis` };
    case 'cancel_requested':
      return { echu: true, vers: 'reconciliation_required', acteur: 'worker', issue: null, motif: `échéance dépassée · annulation sans issue du fournisseur en ${duree} (${e.profil}) · coût à rapprocher` };
    case 'reconciliation_required':
      return { echu: true, vers: 'failed', acteur: 'reconciliateur', issue: 'facture_sans_livrable', motif: `rapprochement clos à l’échéance · aucune preuve du fournisseur en ${duree} · crédits rendus, coût fournisseur retenu` };
    case 'persisting':
      return { echu: true, vers: 'failed', acteur: 'finaliseur', issue: 'facture_sans_livrable', motif: `enregistrement impossible en ${duree} · crédits rendus, coût fournisseur retenu` };
    default:
      return { echu: false };
  }
}

/* ───────────────────────────── Entrée dans l'état ───────────────────────────── */

export const CLE_ENTREE_ETAT = 'etatDepuis' as const;

export function marqueEntreeEtat(etat: EtatJob, le: Date): { etat: EtatJob; a: string } {
  return { etat, a: le.toISOString() };
}

const date = (x: unknown): Date | null => {
  const d = typeof x === 'string' ? new Date(x) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};

/**
 * Depuis quand le job est dans son état · la marque du worker si elle le
 * désigne ; sinon, en `persisting`, l'entrée notée au premier échec
 * (`error.depuis`, stable d'un échec à l'autre) ; sinon `updated_at`.
 */
export function entreeDansEtat(job: { state: string; result: unknown; updatedAt: Date; error?: unknown }): Date {
  const m = job.result && typeof job.result === 'object' ? (job.result as Record<string, unknown>)[CLE_ENTREE_ETAT] : null;
  if (m && typeof m === 'object') {
    const { etat, a } = m as { etat?: unknown; a?: unknown };
    const d = date(a);
    if (etat === job.state && d) return d;
  }
  if (job.state === 'persisting' && job.error && typeof job.error === 'object') {
    const e = job.error as { code?: unknown; depuis?: unknown };
    const d = e.code === CODE_ECHEC_PERSISTANCE ? date(e.depuis) : null;
    if (d) return d;
  }
  return job.updatedAt;
}

/* ───────────────────────────── Recul de persistance ───────────────────────────── */

/** Le délai avant l'essai qui suit le `n`-ième échec (n ≥ 1) · 20 s × 2ⁿ⁻¹, plafonné à 10 min. */
export function reculPersistanceMs(n: number): number {
  const k = Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1;
  return Math.min(RECUL_PERSISTANCE_MAX_MS, RECUL_PERSISTANCE_BASE_MS * 2 ** Math.min(k - 1, 30));
}

export const CODE_ECHEC_PERSISTANCE = 'PERSISTENCE_FAILED' as const;

/** Le compteur d'échecs consécutifs et le prochain essai, lus dans `studio_jobs.error`. */
export function lireEchecsPersistance(erreur: unknown): { echecs: number; prochainEssai: Date | null } {
  if (!erreur || typeof erreur !== 'object') return { echecs: 0, prochainEssai: null };
  const e = erreur as { code?: unknown; echecsPersistance?: unknown; prochainEssai?: unknown };
  if (e.code !== CODE_ECHEC_PERSISTANCE) return { echecs: 0, prochainEssai: null };
  const echecs = typeof e.echecsPersistance === 'number' && Number.isFinite(e.echecsPersistance) ? Math.max(0, Math.trunc(e.echecsPersistance)) : 0;
  return { echecs, prochainEssai: date(e.prochainEssai) };
}

export type SuitePersistance =
  | { suite: 'reessayer'; echecs: number; prochainEssai: Date }
  | { suite: 'echec'; echecs: number; motif: string };

/** Un échec de persistance de plus · retenter après le recul, ou conclure à l'échéance. */
export function suitePersistance(e: { erreur: unknown; entreeLe: Date; maintenant: Date; profil: ProfilEcheance }): SuitePersistance {
  const echecs = lireEchecsPersistance(e.erreur).echecs + 1;
  const d = decisionEcheance({ etat: 'persisting', profil: e.profil, entreeLe: e.entreeLe, maintenant: e.maintenant });
  if (d.echu) return { suite: 'echec', echecs, motif: `${d.motif} · ${echecs} essais` };
  // Le dernier essai tombe à l'échéance, pas un recul plus tard · l'issue n'attend jamais 10 min de trop.
  const fin = e.entreeLe.getTime() + ECHEANCE_PERSISTANCE_MS + 1;
  return { suite: 'reessayer', echecs, prochainEssai: new Date(Math.min(e.maintenant.getTime() + reculPersistanceMs(echecs), fin)) };
}

/* ───────────────────────────── Clore le rapprochement ───────────────────────────── */

/**
 * Le geste de l'administration · « Clore le rapprochement » d'un job en
 * `reconciliation_required` dont on SAIT qu'aucun livrable ne viendra (fal
 * confirme, facture lue). Le site ne règle rien lui-même : il pose la demande
 * (`error.clotureDemandee`, auteur, raison, date) et son audit ; le worker la
 * lit au tour suivant et clôt par le MÊME chemin que l'échéance · `failed` en
 * `facture_sans_livrable` par le réconciliateur, un seul règlement. Une issue
 * prouvée par le fournisseur (succès, échec) passe AVANT la demande.
 */
/** L'action d'audit du geste · sensible (dépense · des crédits sont rendus, un coût est retenu). */
export const ACTION_CLORE_RAPPROCHEMENT = 'studios.rapprochement.clore';
export const RAISON_CLOTURE_MIN = 10;
export const RAISON_CLOTURE_MAX = 500;

export type VerdictRaisonCloture = { ok: true; raison: string } | { ok: false; message: string };

export function validerRaisonCloture(x: unknown): VerdictRaisonCloture {
  const r = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
  if (r.length < RAISON_CLOTURE_MIN) return { ok: false, message: `Écris pourquoi aucun livrable ne viendra (au moins ${RAISON_CLOTURE_MIN} signes) · rien n’a été clos.` };
  if (r.length > RAISON_CLOTURE_MAX) return { ok: false, message: `Raison trop longue (${RAISON_CLOTURE_MAX} signes au plus) · rien n’a été clos.` };
  return { ok: true, raison: r };
}

export interface ClotureDemandee { par: string | null; raison: string; a: Date }

export function demandeCloture(par: string, raison: string, le: Date): { par: string; raison: string; a: string } {
  return { par, raison, a: le.toISOString() };
}

export function lireClotureDemandee(erreur: unknown): ClotureDemandee | null {
  if (!erreur || typeof erreur !== 'object') return null;
  const c = (erreur as { clotureDemandee?: unknown }).clotureDemandee;
  if (!c || typeof c !== 'object') return null;
  const { par, raison, a } = c as { par?: unknown; raison?: unknown; a?: unknown };
  const v = validerRaisonCloture(raison);
  const d = date(a);
  if (!v.ok || !d) return null;
  return { par: typeof par === 'string' ? par : null, raison: v.raison, a: d };
}

/** Le motif écrit sur le job clos par la demande. */
export const motifClotureDemandee = (raison: string) => `rapprochement clos par l’administration · ${raison} · crédits rendus, coût fournisseur retenu`;
