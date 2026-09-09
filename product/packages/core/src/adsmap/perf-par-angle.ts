/**
 * La performance RÉELLE par hypothèse d'angle · le pendant objectif de #300.
 *
 * ── Ce que ça mesure, et ce que ça ne mesure pas ─────────────────────────────
 *
 * #300 relie chaque créa générée à son angle et au jugement SUBJECTIF du client
 * (👍/👎). Ici, on relie le même angle au vote OBJECTIF : la créa a-t-elle été
 * GAGNANTE une fois lancée, d'après le verdict ADSMAP calculé sur ses métriques
 * réelles (spend, CTR…). « Le client a aimé » et « le marché a payé » sont deux
 * choses · c'est la seconde.
 *
 * Ce module ne fait que de l'arithmétique sur des lignes déjà attribuées (angle
 * + verdict + métriques). Il reste pur · l'écran fait la jointure et lui passe
 * les lignes. La jointure ads → génération → angle vit côté appelant et n'est PAS
 * garantie exacte tant qu'elle n'a pas tourné sur des données réelles · d'où le
 * cadre prudent : on ne parle qu'au-dessus d'un plancher de créas CONCLUSIVES.
 *
 * ── Doctrine ─────────────────────────────────────────────────────────────────
 *
 * • Comparer à la référence, jamais à zéro · le taux de gagnants d'un angle n'a
 *   de sens qu'à côté du taux GÉNÉRAL.
 * • Minimum d'effectif CONCLUSIF avant de trancher · sous le plancher, « à
 *   confirmer ». Le silence est une conclusion valable.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import type { VerdictValue } from './types';

/** Taxonomie canonique (identique à `attribution`/`brand-stats`). */
const GAGNANTS: ReadonlySet<VerdictValue> = new Set(['winner', 'baby_winner', 'relative_winner']);
const CONCLUSIFS: ReadonlySet<VerdictValue> = new Set(['winner', 'baby_winner', 'relative_winner', 'loser']);

/** Une créa lancée, attribuée à un angle · verdict réel + métriques. */
export interface CreaLancee {
  angle?: string | null;
  verdict?: VerdictValue | null;
  spend?: number | null;
  ctr?: number | null;
}

export interface LignePerfAngle {
  angle: string;
  /** Créas lancées attribuées à cet angle. */
  total: number;
  /** Créas au verdict CONCLUSIF (gagnant ou perdant) · l'effectif qui parle. */
  conclusifs: number;
  gagnants: number;
  /** Part de gagnants sur les conclusifs · null si aucun conclusif. */
  tauxGagnant: number | null;
  /** Dépense cumulée réelle attribuée à cet angle. */
  spend: number;
  /** CTR moyen des créas qui en portent un · null sinon. */
  ctrMoyen: number | null;
  /** Sous le plancher de conclusifs · le verdict attend. */
  aConfirmer: boolean;
}

export interface PerfParAngle {
  lignes: LignePerfAngle[];
  /** La référence · taux de gagnants général sur les conclusifs. null si aucun. */
  tauxGeneral: number | null;
  conclusifsTotal: number;
}

/** Sous ce nombre de créas CONCLUSIVES, un angle ne tranche pas. */
export const CONCLUSIFS_PLANCHER = 5;

const CONNU = (a?: string | null) => a?.trim() || null;

export function perfParAngle(creas: CreaLancee[]): PerfParAngle {
  const parAngle = new Map<string, { total: number; conclusifs: number; gagnants: number; spend: number; ctrs: number[] }>();
  let conclusifsTotal = 0;
  let gagnantsTotal = 0;

  for (const c of creas) {
    const angle = CONNU(c.angle);
    if (!angle) continue;
    const e = parAngle.get(angle) ?? { total: 0, conclusifs: 0, gagnants: 0, spend: 0, ctrs: [] };
    e.total += 1;
    e.spend += c.spend ?? 0;
    if (c.ctr != null && Number.isFinite(c.ctr)) e.ctrs.push(c.ctr);
    if (c.verdict && CONCLUSIFS.has(c.verdict)) {
      e.conclusifs += 1;
      conclusifsTotal += 1;
      if (GAGNANTS.has(c.verdict)) { e.gagnants += 1; gagnantsTotal += 1; }
    }
    parAngle.set(angle, e);
  }

  const lignes: LignePerfAngle[] = [...parAngle.entries()]
    .map(([angle, e]) => ({
      angle,
      total: e.total,
      conclusifs: e.conclusifs,
      gagnants: e.gagnants,
      tauxGagnant: e.conclusifs ? e.gagnants / e.conclusifs : null,
      spend: Math.round(e.spend),
      ctrMoyen: e.ctrs.length ? e.ctrs.reduce((s, x) => s + x, 0) / e.ctrs.length : null,
      aConfirmer: e.conclusifs < CONCLUSIFS_PLANCHER,
    }))
    .sort((a, b) => Number(a.aConfirmer) - Number(b.aConfirmer)
      || (b.tauxGagnant ?? -1) - (a.tauxGagnant ?? -1)
      || b.total - a.total);

  return {
    lignes,
    tauxGeneral: conclusifsTotal ? gagnantsTotal / conclusifsTotal : null,
    conclusifsTotal,
  };
}
