/**
 * Le Score Jarvis prédit-il vraiment ? · la calibration du pronostic contre le marché.
 *
 * ── La question qu'on payait sans jamais y répondre ──────────────────────────
 *
 * Le Score Jarvis coûte des crédits · c'est un PRONOSTIC, ce qu'on pense d'une
 * créa avant qu'elle tourne. Le verdict ADSMAP, lui, est le RÉSULTAT, une fois
 * lancée et mesurée. On les gardait séparés à dessein — un avis n'est pas un
 * résultat — mais du coup personne ne vérifiait jamais si l'avis PRÉDIT le
 * résultat. Un score de prédiction qu'on ne confronte pas à ce qui arrive est
 * un score dont on ignore s'il vaut ses crédits.
 *
 * Ce module ne confond pas les deux · il les CONFRONTE. C'est une validation,
 * pas un cumul : « les créas que tu as notées au-dessus de ta médiane gagnent-
 * elles plus souvent que celles en-dessous ? »
 *
 * ── Pourquoi une médiane, et pas un seuil ────────────────────────────────────
 *
 * Couper à « 70/100 » serait un seuil posé d'instinct · la maison ne pose pas de
 * seuils, elle les mesure. On coupe donc à la MÉDIANE des scores observés : la
 * moitié haute contre la moitié basse, relatif à cette marque. Aucun nombre
 * magique, et le partage suit la distribution réelle.
 *
 * ── La discipline habituelle ─────────────────────────────────────────────────
 *
 * • On ne parle qu'avec assez de paires CONCLUSIVES (un verdict tranché) dans
 *   CHAQUE moitié · sous le plancher, « à confirmer ».
 * • On ne déclare le score prédictif que si la borne basse de Wilson de la
 *   moitié haute dépasse le taux de la moitié basse · un écart ponctuel sur
 *   quelques créas ne prouve rien. Le silence est une conclusion valable, et la
 *   plus fréquente tant que peu de créas notées ont été mesurées.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { wilsonInterval, type Interval } from './stats';
import type { VerdictValue } from './types';

const GAGNANTS: ReadonlySet<VerdictValue> = new Set(['winner', 'baby_winner', 'relative_winner']);
const CONCLUSIFS: ReadonlySet<VerdictValue> = new Set(['winner', 'baby_winner', 'relative_winner', 'loser']);

/** Une créa notée ET mesurée · le score prédit, le verdict tranche. */
export interface PaireScoreVerdict {
  score: number;
  verdict: VerdictValue | null;
}

export interface Calibration {
  /** Paires au verdict CONCLUSIF · l'effectif qui parle. */
  conclusifs: number;
  /** La médiane de score qui a servi de coupe · `null` si rien à couper. */
  mediane: number | null;
  /** Taux de gagnants de la moitié HAUTE (score ≥ médiane). */
  tauxHaut: number | null;
  /** Taux de gagnants de la moitié BASSE (score < médiane). */
  tauxBas: number | null;
  nHaut: number;
  nBas: number;
  /**
   * Le score DISCRIMINE-t-il · la moitié haute gagne-t-elle nettement plus.
   * `null` tant qu'on n'a pas de quoi trancher (effectif, ou écart non prouvé).
   */
  predictif: boolean | null;
  intervalleHaut: Interval | null;
  resume: string;
}

/** Sous ce nombre de paires conclusives PAR MOITIÉ, la calibration attend. */
export const MIN_PAR_MOITIE = 5;

function mediane(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * La calibration du score contre le verdict · muette tant qu'elle ne sait rien.
 *
 * La coupe se fait à la médiane · une créa PILE sur la médiane compte en HAUT
 * (score ≥ médiane), pour que le partage soit défini même quand beaucoup de
 * scores sont égaux.
 */
export function calibrationScore(paires: readonly PaireScoreVerdict[]): Calibration {
  const conclusives = paires.filter((p) => p.verdict !== null && CONCLUSIFS.has(p.verdict) && Number.isFinite(p.score));
  const vide: Calibration = {
    conclusifs: conclusives.length, mediane: null, tauxHaut: null, tauxBas: null,
    nHaut: 0, nBas: 0, predictif: null, intervalleHaut: null,
    resume: conclusives.length
      ? `${conclusives.length} créa(s) notée(s) ET mesurée(s) · il en faut plus, réparties de part et d'autre de ta médiane, pour dire si le score prédit.`
      : 'Aucune créa à la fois notée et mesurée · le score ne peut pas encore être confronté au marché.',
  };

  const med = mediane(conclusives.map((p) => p.score));
  if (med === null) return vide;

  const haut = conclusives.filter((p) => p.score >= med);
  const bas = conclusives.filter((p) => p.score < med);
  if (haut.length < MIN_PAR_MOITIE || bas.length < MIN_PAR_MOITIE) return { ...vide, mediane: med };

  const gagnants = (lot: PaireScoreVerdict[]) => lot.filter((p) => p.verdict && GAGNANTS.has(p.verdict)).length;
  const kHaut = gagnants(haut);
  const kBas = gagnants(bas);
  const tauxHaut = kHaut / haut.length;
  const tauxBas = kBas / bas.length;
  const intervalleHaut = wilsonInterval(kHaut, haut.length);

  // Prédictif quand la borne BASSE de la moitié haute dépasse le taux de la
  // moitié basse · même discipline que le reste de la carte (on compare à une
  // référence, jamais à zéro, et un écart ponctuel ne suffit pas).
  const predictif = intervalleHaut.lo > tauxBas;

  const resume = predictif
    ? `Le score prédit · au-dessus de ta médiane (${med}/100), ${pct(tauxHaut)} de gagnantes contre ${pct(tauxBas)} en-dessous.`
    : `Le score ne se détache pas encore · ${pct(tauxHaut)} de gagnantes au-dessus de ta médiane contre ${pct(tauxBas)} en-dessous, l'écart peut être du hasard.`;

  return {
    conclusifs: conclusives.length, mediane: med, tauxHaut, tauxBas,
    nHaut: haut.length, nBas: bas.length, predictif, intervalleHaut, resume,
  };
}
