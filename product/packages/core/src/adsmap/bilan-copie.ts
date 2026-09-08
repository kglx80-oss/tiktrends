/**
 * Quel moteur écrit le français juste, et lequel invente ton produit.
 *
 * ── Ce qu'on enregistrait sans jamais le lire ────────────────────────────────
 *
 * Chaque publicité produite entière est relue à la génération : on sait, pour
 * chacune, si l'accroche est restée la nôtre et si le packaging est resté le
 * bon. Ces constats sont rangés en base, publicité par publicité.
 *
 * Et ils y restaient. La carte montrait le sien, la grille montrait le sien, et
 * personne ne faisait la somme. « Quel moteur se trompe le plus » est pourtant
 * exactement la question à laquelle cette matière répond, et c'est celle qui
 * décide du moteur qu'on choisit par défaut.
 *
 * ── Deux taux, deux dénominateurs ────────────────────────────────────────────
 *
 * **L'accroche réécrite** se compte sur toutes les publicités relues.
 *
 * **Le produit modifié** ne se compte QUE sur celles qui avaient une photo de
 * référence. Sans référence, la relecture ne conclut rien · faire entrer ces
 * publicités au dénominateur ferait baisser le taux à mesure qu'on ajoute des
 * marques sans photo produit, ce qui n'apprendrait rien sur les moteurs.
 *
 * C'est la même règle que les ratés de fabrication, qui ne se comptent que sur
 * les notes ayant vu l'image.
 *
 * ── On compare à la moyenne, jamais à zéro ───────────────────────────────────
 *
 * Tous les moteurs se trompent parfois. Dire « celui-ci a réécrit trois
 * accroches » ne signifie rien sans savoir ce que font les autres · un moteur
 * qui en réécrit trois sur cent est excellent, trois sur quatre est
 * inutilisable.
 *
 * Un groupe ne se détache donc que si son intervalle de Wilson exclut le taux
 * général. C'est la discipline déjà tenue par les essais et le bilan des notes,
 * et elle vaut ici pour la même raison.
 *
 * ── Ce que le seuil détecte vraiment, mesuré ─────────────────────────────────
 *
 * Deux groupes, taux de réécriture de chacun, et si l'écart se détache :
 *
 *   par groupe    0 % / 100 %   13 / 88   25 / 63   25 / 50   30 / 45
 *   ─────────────────────────────────────────────────────────────────
 *   8 pubs            oui         oui       oui       non       non
 *   12 pubs           oui         oui       oui       oui       non
 *   20 pubs           oui         oui       oui       oui       non
 *
 * Plus il y a de publicités, plus l'écart détectable est fin · c'est le
 * comportement attendu, et c'est ce qui justifie de ne rien afficher sous huit.
 *
 * J'avais supposé qu'un écart total à huit publicités ne trancherait pas.
 * L'intervalle avait raison : zéro sur huit contre huit sur huit n'est pas un
 * écart ordinaire, c'est une preuve.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { wilsonInterval, type Interval } from './stats';

/** Ce sur quoi on regroupe · fermé, donc comptable. */
export const DIMENSIONS_COPIE = ['moteur', 'direction'] as const;
export type DimensionCopie = typeof DIMENSIONS_COPIE[number];

export const DIMENSION_COPIE_LABEL: Record<DimensionCopie, string> = {
  moteur: 'Moteur d’image',
  direction: 'Direction artistique',
};

/** Une relecture, telle qu'elle a été consignée. */
export interface RelectureLue {
  /** L'accroche a été réécrite ou n'y est pas · le seul écart éliminatoire. */
  accrocheReecrite: boolean;
  /**
   * Le packaging correspond-il à la référence · `null` quand il n'y en avait pas.
   *
   * `null` n'est pas « conforme » · c'est « on n'a pas pu regarder », et les
   * deux ne se comptent pas de la même façon.
   */
  produitFidele: boolean | null;
  cles: Partial<Record<DimensionCopie, string>>;
}

export interface LigneCopie {
  cle: string;
  /** Publicités relues dans ce groupe. */
  n: number;
  /** Publicités dont l'accroche a été réécrite. */
  reecrites: number;
  tauxReecriture: number;
  intervalReecriture: Interval;
  /** Publicités du groupe qui avaient une référence produit · le dénominateur. */
  avecReference: number;
  produitsModifies: number;
  tauxProduit: number | null;
  intervalProduit: Interval | null;
  /**
   * Ce groupe se détache-t-il du taux général, et dans quel sens.
   *
   * `null` quand rien ne tranche · c'est la réponse la plus fréquente, et la
   * plus honnête quand on a vingt publicités.
   */
  verdict: 'meilleur' | 'pire' | null;
}

export interface BilanDimensionCopie {
  dimension: DimensionCopie;
  lignes: LigneCopie[];
  conclusif: boolean;
  resume: string;
}

export interface BilanCopie {
  /** Publicités relues, toutes dimensions confondues. */
  relues: number;
  tauxReecriture: number | null;
  /** Sur les seules publicités qui avaient une référence produit. */
  avecReference: number;
  tauxProduit: number | null;
  dimensions: BilanDimensionCopie[];
  resume: string;
}

/**
 * Combien de relectures avant qu'un groupe ait le droit de parler.
 *
 * Huit, et pas cinq comme pour les notes. Une note est une valeur continue :
 * cinq d'entre elles portent déjà de l'information. Un taux de réécriture est
 * une proportion, et sur cinq publicités l'intervalle de Wilson couvre à peu
 * près tout · le groupe ne trancherait jamais, mais sa ligne se lirait quand
 * même comme un classement.
 *
 * Afficher un classement qu'on sait muet est pire que ne rien afficher.
 */
export const MIN_RELECTURES = 8;

/** Niveau des intervalles · le même que partout ailleurs sur la carte. */
const NIVEAU = 0.8;

function ligneDe(cle: string, lot: readonly RelectureLue[], generalReecriture: number): LigneCopie {
  const n = lot.length;
  const reecrites = lot.filter((r) => r.accrocheReecrite).length;
  const intervalReecriture = wilsonInterval(reecrites, n, NIVEAU);

  // Seules les publicités qui avaient une référence entrent au dénominateur du
  // produit · les autres n'ont pas été regardées, elles ne sont pas conformes.
  const regardees = lot.filter((r) => r.produitFidele !== null);
  const modifies = regardees.filter((r) => r.produitFidele === false).length;

  // On compare à la moyenne, jamais à zéro · tous les moteurs se trompent
  // parfois, et c'est l'écart qui informe, pas le compte brut.
  const verdict = n < MIN_RELECTURES ? null
    : intervalReecriture.hi < generalReecriture ? 'meilleur'
      : intervalReecriture.lo > generalReecriture ? 'pire'
        : null;

  return {
    cle, n, reecrites,
    tauxReecriture: n ? reecrites / n : 0,
    intervalReecriture,
    avecReference: regardees.length,
    produitsModifies: modifies,
    tauxProduit: regardees.length ? modifies / regardees.length : null,
    intervalProduit: regardees.length ? wilsonInterval(modifies, regardees.length, NIVEAU) : null,
    verdict,
  };
}

function resumeDimension(dimension: DimensionCopie, lignes: readonly LigneCopie[]): string {
  const pire = lignes.filter((l) => l.verdict === 'pire');
  const bon = lignes.filter((l) => l.verdict === 'meilleur');
  if (!pire.length && !bon.length) return '';
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const quoi = dimension === 'moteur' ? 'moteur' : 'direction';
  const morceaux = [
    pire.length ? `${pire.map((l) => `${l.cle} (${pct(l.tauxReecriture)})`).join(', ')} réécrit plus souvent que la moyenne` : '',
    bon.length ? `${bon.map((l) => `${l.cle} (${pct(l.tauxReecriture)})`).join(', ')} tient mieux la copie` : '',
  ].filter(Boolean);
  return `Par ${quoi} · ${morceaux.join(' · ')}.`;
}

/**
 * De quel côté biaiser la rotation des directions d'entière.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * En entière, la direction porte la typographie et la disposition · c'est un
 * levier de qualité, et la rotation le tirait à l'horloge, aveugle à ce que la
 * relecture a mesuré. Une direction que le modèle rend en réécrivant l'accroche
 * ou en inventant le produit ne mérite pas d'être servie une fois sur quatorze
 * comme les autres.
 *
 * On ne fait que LIRE les verdicts déjà calculés · `pire` sort du vivier,
 * `meilleur` est ancrée en tête. La discipline (intervalle de Wilson, minimum
 * d'effectif) est celle du bilan · une direction n'est écartée que quand la
 * mesure a tranché, jamais sur un compte brut. Sans verdict, rien ne bouge · la
 * rotation reste égale, et c'est la réponse la plus fréquente.
 */
export function directionsBiais(lignes: readonly LigneCopie[]): { ecartees: string[]; favori: string | null } {
  const ecartees = lignes.filter((l) => l.verdict === 'pire').map((l) => l.cle);
  const meilleures = lignes
    .filter((l) => l.verdict === 'meilleur')
    .sort((a, b) => a.tauxReecriture - b.tauxReecriture);
  return { ecartees, favori: meilleures[0]?.cle ?? null };
}

/**
 * Ce que toutes les relectures disent ensemble.
 *
 * Le silence est une conclusion valable · sur vingt publicités, aucun moteur ne
 * se détache la plupart du temps, et l'écrire est plus utile qu'un classement
 * que le hasard aurait produit.
 */
export function bilanCopie(relectures: readonly RelectureLue[]): BilanCopie {
  const relues = relectures.length;
  const reecrites = relectures.filter((r) => r.accrocheReecrite).length;
  const tauxReecriture = relues ? reecrites / relues : null;

  const regardees = relectures.filter((r) => r.produitFidele !== null);
  const modifies = regardees.filter((r) => r.produitFidele === false).length;
  const tauxProduit = regardees.length ? modifies / regardees.length : null;

  const dimensions: BilanDimensionCopie[] = DIMENSIONS_COPIE.map((dimension) => {
    const par = new Map<string, RelectureLue[]>();
    for (const r of relectures) {
      const cle = r.cles[dimension];
      if (!cle) continue;
      const lot = par.get(cle) ?? [];
      lot.push(r);
      par.set(cle, lot);
    }
    const lignes = [...par.entries()]
      .map(([cle, lot]) => ligneDe(cle, lot, tauxReecriture ?? 0))
      .filter((l) => l.n >= MIN_RELECTURES)
      .sort((a, b) => a.tauxReecriture - b.tauxReecriture);
    return {
      dimension, lignes,
      conclusif: lignes.some((l) => l.verdict !== null),
      resume: resumeDimension(dimension, lignes),
    };
  });

  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const resume = !relues
    ? 'Aucune publicité relue pour l’instant · la relecture ne tourne que sur les pubs générées entièrement.'
    : [
        `${relues} publicité(s) relue(s) · ${pct(tauxReecriture ?? 0)} d’accroches réécrites`,
        regardees.length
          ? `${pct(tauxProduit ?? 0)} de produits modifiés sur ${regardees.length} avec photo de référence`
          : 'aucune n’avait de photo produit · la fidélité du packaging n’a pas pu être vérifiée',
      ].join(' · ') + '.';

  return { relues, tauxReecriture, avecReference: regardees.length, tauxProduit, dimensions, resume };
}
