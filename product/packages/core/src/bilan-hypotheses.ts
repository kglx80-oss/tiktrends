/**
 * Le bilan des hypothèses · relier la créa générée à son résultat.
 *
 * ── La boucle qu'on ferme ────────────────────────────────────────────────────
 *
 * On génère des créas depuis un angle (« l'angle qui domine chez X »), et le
 * client juge chacune PERTINENTE (👍) ou non (👎). Entre les deux, rien ne
 * reliait l'hypothèse au résultat · impossible de dire « les créas issues de
 * l'angle X ont convaincu, celles de l'angle Y non ». Une itération qu'on ne
 * mesure pas n'est pas une itération, c'est un tirage.
 *
 * Ce module regroupe les créas générées PAR ANGLE et calcule leur taux de
 * pertinence · le cap produit, rendu lisible : « gérer les hypothèses ».
 *
 * ── Deux règles de la doctrine ───────────────────────────────────────────────
 *
 * • Comparer à la référence, jamais à zéro · le taux d'un angle n'a de sens
 *   qu'à côté du taux GÉNÉRAL. On rend les deux.
 * • Minimum d'effectif JUGÉ avant qu'un angle ait le droit de parler · sous le
 *   plancher, on le marque « à confirmer » plutôt que d'annoncer un verdict sur
 *   deux créas. Le silence est une conclusion valable.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/** Une créa générée · son angle d'origine et le jugement du client. */
export interface CreaJugee {
  angle?: string | null;
  rating?: 'up' | 'down' | null;
}

export interface LigneHypothese {
  angle: string;
  /** Créas générées sous cet angle (jugées ou non). */
  total: number;
  /** Créas JUGÉES (👍 ou 👎) · c'est l'effectif qui a le droit de parler. */
  jugees: number;
  pertinentes: number;
  /** Taux de pertinence sur les jugées · null si aucune n'a été jugée. */
  tauxPertinence: number | null;
  /** Sous le plancher de jugées · le verdict attend, il ne s'annonce pas. */
  aConfirmer: boolean;
}

export interface BilanHypotheses {
  lignes: LigneHypothese[];
  /** Le taux général, la référence · null si rien n'a été jugé. */
  tauxGeneral: number | null;
  jugeesTotal: number;
}

/** Sous ce nombre de créas JUGÉES, un angle ne tranche pas · il « attend ». */
export const JUGEES_PLANCHER = 5;

const CONNU = (a?: string | null) => a?.trim() || null;

export function bilanHypotheses(creas: CreaJugee[]): BilanHypotheses {
  const parAngle = new Map<string, { total: number; jugees: number; pertinentes: number }>();
  let jugeesTotal = 0;
  let pertinentesTotal = 0;

  for (const c of creas) {
    const angle = CONNU(c.angle);
    if (!angle) continue; // sans hypothèse, rien à attribuer
    const e = parAngle.get(angle) ?? { total: 0, jugees: 0, pertinentes: 0 };
    e.total += 1;
    if (c.rating === 'up' || c.rating === 'down') {
      e.jugees += 1;
      jugeesTotal += 1;
      if (c.rating === 'up') { e.pertinentes += 1; pertinentesTotal += 1; }
    }
    parAngle.set(angle, e);
  }

  const lignes: LigneHypothese[] = [...parAngle.entries()]
    .map(([angle, e]) => ({
      angle,
      total: e.total,
      jugees: e.jugees,
      pertinentes: e.pertinentes,
      tauxPertinence: e.jugees ? e.pertinentes / e.jugees : null,
      aConfirmer: e.jugees < JUGEES_PLANCHER,
    }))
    // Les hypothèses qui ont le droit de parler d'abord, puis par pertinence.
    .sort((a, b) => Number(a.aConfirmer) - Number(b.aConfirmer)
      || (b.tauxPertinence ?? -1) - (a.tauxPertinence ?? -1)
      || b.total - a.total);

  return {
    lignes,
    tauxGeneral: jugeesTotal ? pertinentesTotal / jugeesTotal : null,
    jugeesTotal,
  };
}

/**
 * La consigne qui fait PILOTER la génération par le bilan · de la mesure à
 * l'action.
 *
 * On ne liste que les angles qui ont le DROIT de parler (assez jugés) ET qui
 * convainquent au moins autant que la référence · c'est ce qui distingue « cet
 * angle marche » de « cet angle a eu de la chance sur deux créas ». Rien ne
 * qualifie → `null` · on n'oriente pas la génération sur du bruit.
 */
export function consigneAnglesGagnants(bilan: BilanHypotheses): string | null {
  if (bilan.tauxGeneral == null) return null;
  const gagnants = bilan.lignes
    .filter((l) => !l.aConfirmer && l.tauxPertinence != null && l.tauxPertinence >= bilan.tauxGeneral!)
    .sort((a, b) => (b.tauxPertinence ?? 0) - (a.tauxPertinence ?? 0))
    .slice(0, 5);
  if (!gagnants.length) return null;
  const liste = gagnants.map((l) => `« ${l.angle} » (${Math.round(l.tauxPertinence! * 100)} %)`).join(', ');
  return `Angles déjà MESURÉS au-dessus de la moyenne chez cette marque (le client les a jugés pertinents · privilégie-les, reprends leur esprit) : ${liste}.`;
}
