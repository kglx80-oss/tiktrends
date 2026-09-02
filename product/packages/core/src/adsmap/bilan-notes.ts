/**
 * Ce que vingt notes disent ensemble.
 *
 * ── Ce qu'on payait sans le lire ─────────────────────────────────────────────
 *
 * Le Score Jarvis coûte deux crédits et regarde une créa. Vingt notes, c'est
 * quarante crédits, et rien nulle part n'en faisait la somme. Chaque note
 * servait une fois, à la carte qui l'avait demandée.
 *
 * La matière existe pourtant pour répondre à des questions qu'on n'avait aucun
 * autre moyen de trancher : **d'où viennent tes ratés de fabrication**, et
 * **quelle mise en page tient le mieux chez toi**.
 *
 * ── Pourquoi les deux ne se calculent pas pareil ─────────────────────────────
 *
 * Un raté est un OUI/NON · la proportion de notes qui en portent un est une
 * vraie proportion, et Wilson s'y applique.
 *
 * Une note est une valeur continue. Sa moyenne n'est pas une proportion, et lui
 * coller un intervalle de Wilson serait faux. On passe donc par l'erreur type
 * de la moyenne, et on ne conclut que si l'intervalle d'un groupe exclut la
 * moyenne générale.
 *
 * ── Ce qu'on ne prétend pas ──────────────────────────────────────────────────
 *
 * Ce n'est pas de la performance. La note est un pronostic, pas un résultat ·
 * elle dit ce qu'un directeur créatif pense de la créa, pas ce que le marché en
 * a fait. Confondre les deux transformerait un avis en preuve. Les vraies
 * performances vivent dans les verdicts, et le fichier le rappelle.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { normalQuantile, wilsonInterval, type Interval } from './stats';
import type { SceneDefect } from '../scene-defects';

/** Ce sur quoi on regroupe · le vocabulaire est fermé, donc comptable. */
export const DIMENSIONS_NOTE = ['gabarit', 'coquille', 'ambiance', 'moteur'] as const;
export type DimensionNote = typeof DIMENSIONS_NOTE[number];

export const DIMENSION_LABEL: Record<DimensionNote, string> = {
  gabarit: 'Gabarit',
  coquille: 'Mise en page',
  ambiance: 'Ambiance',
  moteur: 'Moteur d’image',
};

/** Une note lue, avec ce qui l'entoure. */
export interface NoteLue {
  score: number;
  /** Ratés observés · vide quand la note a regardé l'image et n'a rien trouvé. */
  defauts: readonly SceneDefect[];
  /** La note a-t-elle vu l'image · celles d'avant ne comptent pas pour les ratés. */
  vu: boolean;
  cles: Partial<Record<DimensionNote, string>>;
}

export interface LigneBilan {
  cle: string;
  n: number;
  moyenne: number;
  /** Intervalle sur la MOYENNE · pas sur une proportion. */
  interval: Interval | null;
  /** Écart à la moyenne générale, en points. */
  ecart: number;
  /** L'écart tient · l'intervalle exclut la moyenne générale. */
  tranche: boolean;
}

export interface BilanDimension {
  dimension: DimensionNote;
  lignes: LigneBilan[];
  /** Au moins une ligne se détache. */
  conclusif: boolean;
  resume: string;
}

export interface BilanDefauts {
  /** Notes ayant regardé l'image · les seules qui peuvent constater un raté. */
  vues: number;
  /** Notes portant au moins un raté. */
  avecDefaut: number;
  taux: number | null;
  interval: Interval | null;
  /** Combien de fois chaque raté a été vu · trié du plus fréquent au moins. */
  parType: Array<{ defaut: SceneDefect; n: number }>;
  /** Là d'où ils viennent le plus, quand une dimension se détache. */
  suspects: Array<{ dimension: DimensionNote; cle: string; n: number; sur: number; taux: number }>;
  resume: string;
}

export interface BilanNotes {
  notes: number;
  moyenne: number | null;
  dimensions: BilanDimension[];
  defauts: BilanDefauts;
}

/**
 * Combien de notes avant qu'un groupe ait le droit de parler.
 *
 * Cinq est peu. Mais l'intervalle sur la moyenne fait le travail : avec cinq
 * notes il est si large qu'il n'exclut presque jamais la moyenne générale. Le
 * seuil sert surtout à ne pas afficher une ligne à une seule note, qui se lit
 * comme un classement alors qu'elle n'en est pas un.
 */
export const MIN_NOTES = 5;

/** Niveau des intervalles · le même que celui du reste de la carte. */
const NIVEAU = 0.8;

function moyenneDe(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Intervalle sur une moyenne · `null` sous deux valeurs.
 *
 * L'écart type d'un seul nombre n'existe pas, et en fabriquer un (zéro) rendrait
 * un intervalle de largeur nulle, donc un groupe déclaré tranchant sur une
 * unique note.
 */
export function intervalleMoyenne(xs: readonly number[], niveau = NIVEAU): Interval | null {
  if (xs.length < 2) return null;
  const m = moyenneDe(xs);
  // Écart type d'échantillon · le dénominateur n-1, pas n.
  const variance = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1);
  const se = Math.sqrt(variance / xs.length);
  const z = normalQuantile(niveau);
  return { lo: m - z * se, hi: m + z * se };
}

function bilanDimension(notes: readonly NoteLue[], dimension: DimensionNote, general: number): BilanDimension {
  const par = new Map<string, number[]>();
  for (const n of notes) {
    const cle = n.cles[dimension];
    if (!cle) continue;
    const l = par.get(cle);
    if (l) l.push(n.score); else par.set(cle, [n.score]);
  }

  const lignes: LigneBilan[] = [...par.entries()]
    .map(([cle, scores]) => {
      const moyenne = moyenneDe(scores);
      const interval = scores.length >= MIN_NOTES ? intervalleMoyenne(scores) : null;
      return {
        cle, n: scores.length, moyenne, interval,
        ecart: moyenne - general,
        // L'intervalle exclut la moyenne générale · un écart ponctuel ne veut
        // rien dire quand il repose sur six notes très dispersées.
        tranche: !!interval && (interval.lo > general || interval.hi < general),
      };
    })
    .sort((a, b) => b.moyenne - a.moyenne);

  const dessus = lignes.filter((l) => l.tranche && l.ecart > 0);
  const dessous = lignes.filter((l) => l.tranche && l.ecart < 0);
  return {
    dimension, lignes,
    conclusif: dessus.length > 0 || dessous.length > 0,
    resume: resumeDimension(lignes.length, dessus, dessous),
  };
}

function resumeDimension(total: number, dessus: LigneBilan[], dessous: LigneBilan[]): string {
  if (!total) return 'Rien de noté sur cette dimension.';
  if (!dessus.length && !dessous.length) {
    return `Aucun écart ne tient · il faut au moins ${MIN_NOTES} notes par ligne, et un écart plus net que la dispersion.`;
  }
  const bouts: string[] = [];
  if (dessus.length) bouts.push(`${dessus.map((l) => `${l.cle} (+${Math.round(l.ecart)})`).join(', ')} au-dessus`);
  if (dessous.length) bouts.push(`${dessous.map((l) => `${l.cle} (${Math.round(l.ecart)})`).join(', ')} en dessous`);
  return `${bouts.join(', ')} de ta moyenne.`;
}

function bilanDefauts(notes: readonly NoteLue[]): BilanDefauts {
  // Seules les notes qui ont VU l'image peuvent constater un raté · compter les
  // autres comme « sans défaut » diluerait le taux avec des notes aveugles.
  const vues = notes.filter((n) => n.vu);
  const avec = vues.filter((n) => n.defauts.length > 0);

  const compte = new Map<SceneDefect, number>();
  for (const n of vues) for (const d of n.defauts) compte.set(d, (compte.get(d) ?? 0) + 1);

  const suspects: BilanDefauts['suspects'] = [];
  for (const dimension of DIMENSIONS_NOTE) {
    const par = new Map<string, { n: number; sur: number }>();
    for (const note of vues) {
      const cle = note.cles[dimension];
      if (!cle) continue;
      const e = par.get(cle) ?? { n: 0, sur: 0 };
      e.sur += 1;
      if (note.defauts.length) e.n += 1;
      par.set(cle, e);
    }
    for (const [cle, e] of par) {
      // Un seul raté sur deux images ne désigne personne · on veut assez
      // d'images ET une majorité de ratés avant de nommer un coupable.
      if (e.sur >= MIN_NOTES && e.n * 2 > e.sur) {
        suspects.push({ dimension, cle, n: e.n, sur: e.sur, taux: e.n / e.sur });
      }
    }
  }
  suspects.sort((a, b) => b.taux - a.taux || b.sur - a.sur);

  return {
    vues: vues.length,
    avecDefaut: avec.length,
    taux: vues.length ? avec.length / vues.length : null,
    interval: vues.length ? wilsonInterval(avec.length, vues.length, NIVEAU) : null,
    parType: [...compte.entries()].map(([defaut, n]) => ({ defaut, n })).sort((a, b) => b.n - a.n),
    suspects,
    resume: resumeDefauts(vues.length, avec.length, suspects),
  };
}

function resumeDefauts(vues: number, avec: number, suspects: BilanDefauts['suspects']): string {
  if (!vues) return 'Aucune note n’a encore regardé l’image · les ratés de fabrication ne peuvent pas être comptés.';
  if (!avec) return `${vues} image(s) notée(s), aucun raté de fabrication vu. C’est le résultat qu’on veut.`;
  const part = Math.round((avec / vues) * 100);
  if (!suspects.length) return `${avec} image(s) sur ${vues} portent un raté de fabrication (${part} %), sans qu’une origine se détache.`;
  const s = suspects[0]!;
  return `${avec} image(s) sur ${vues} portent un raté (${part} %) · ${s.cle} en produit ${Math.round(s.taux * 100)} % (${s.n}/${s.sur}).`;
}

export function bilanNotes(notes: readonly NoteLue[]): BilanNotes {
  const general = notes.length ? moyenneDe(notes.map((n) => n.score)) : null;
  return {
    notes: notes.length,
    moyenne: general,
    dimensions: general === null ? [] : DIMENSIONS_NOTE.map((d) => bilanDimension(notes, d, general)),
    defauts: bilanDefauts(notes),
  };
}
