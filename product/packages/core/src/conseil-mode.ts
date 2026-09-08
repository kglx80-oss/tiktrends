/**
 * Quel MODE de fabrication proposer par défaut · entière, ou composée.
 *
 * ── Le levier qui manquait ───────────────────────────────────────────────────
 *
 * Le moteur suit déjà la mesure (`conseilMoteur`, `moteurRecommande`). Le MODE,
 * lui, partait toujours d'« entière » en dur. Or l'entière n'est pas viable pour
 * TOUTES les marques · un produit dont le modèle rate l'étiquette, ou dont il
 * réécrit sans cesse l'accroche, se fabrique mieux en composée, où le texte est
 * le nôtre et la mise en page prévisible. On le SAIT, marque par marque · les
 * relectures le mesurent. Il ne pilotait rien.
 *
 * Ici, quand la mesure montre l'entière peu fiable POUR CETTE MARQUE, le défaut
 * bascule en composée · annoncé, jamais en silence, et le clic reste seul à
 * changer ensuite. Sans mesure suffisante, le défaut reste l'entière · c'est le
 * mode que le lot de contrôle a montré viable, et une marque neuve y a droit.
 *
 * ── On ne bascule qu'à défaut ÉLIMINATOIRE installé ──────────────────────────
 *
 * Un écart éliminatoire (accroche réécrite, produit infidèle, texte illisible)
 * dont la borne BASSE de Wilson dépasse un seuil · on est alors confiant que
 * l'entière échoue VRAIMENT plus d'une fois sur cinq ici, pas qu'un raté isolé a
 * gonflé un taux. Minimum d'effectif d'abord. Comparer à un seuil, avec la borne
 * basse, plutôt qu'à zéro · l'entière se trompe parfois partout, et bacher au
 * moindre raté priverait des marques d'un mode qui marche pour elles.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { wilsonInterval } from './adsmap/stats';
import { MIN_RELECTURES } from './adsmap/bilan-copie';
import type { ProductionMode } from './production-mode';

/** Le niveau des intervalles · le même que partout ailleurs sur la carte. */
const NIVEAU = 0.8;

/**
 * Au-dessus de ce taux d'écart éliminatoire installé, l'entière est jugée peu
 * fiable pour la marque. Un cinquième · un lot où une pub sur cinq revient
 * cassée n'est pas utilisable tel quel. Provisoire, à mesurer une fois que
 * plusieurs marques auront accumulé des lots · la structure tient, le chiffre
 * s'affinera (le témoin de #267 donnera de quoi le régler).
 */
export const SEUIL_ENTIERE_FIABLE = 0.2;

/** Les écarts éliminatoires de l'entière, comptés sur leurs dénominateurs. */
export interface SignalFiabiliteEntiere {
  /** Relues · dénominateur de l'accroche. */
  relues: number;
  accroche: number;
  /** Relues avec référence produit · dénominateur de la fidélité. */
  avecReference: number;
  produitsInfideles: number;
  /** Relues avec texte à juger · dénominateur de la lisibilité. */
  avecTexte: number;
  illisibles: number;
}

export interface ConseilMode {
  defaut: ProductionMode;
  /** true quand la mesure a fait basculer vers composée · false = défaut éditorial (entière). */
  mesure: boolean;
  /** Pourquoi, en clair · pour l'annonce. Vide quand c'est le défaut. */
  motif: string;
}

/** Un défaut est-il installé · effectif suffisant ET borne basse au-dessus du seuil. */
function installe(mauvais: number, n: number): number | null {
  if (n < MIN_RELECTURES) return null;
  const iv = wilsonInterval(mauvais, n, NIVEAU);
  return iv.lo > SEUIL_ENTIERE_FIABLE ? mauvais / n : null;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function conseilMode(s: SignalFiabiliteEntiere): ConseilMode {
  // On regarde les trois écarts, on garde le PIRE installé pour l'annonce · c'est
  // celui qui justifie le mieux la bascule.
  const candidats: Array<{ taux: number; libelle: string }> = [];
  const acc = installe(s.accroche, s.relues);
  if (acc !== null) candidats.push({ taux: acc, libelle: `${pct(acc)} d’accroches réécrites` });
  const prod = installe(s.produitsInfideles, s.avecReference);
  if (prod !== null) candidats.push({ taux: prod, libelle: `${pct(prod)} de produits infidèles` });
  const lis = installe(s.illisibles, s.avecTexte);
  if (lis !== null) candidats.push({ taux: lis, libelle: `${pct(lis)} de texte illisible` });

  if (!candidats.length) return { defaut: 'entiere', mesure: false, motif: '' };
  const pire = candidats.sort((a, b) => b.taux - a.taux)[0]!;
  return {
    defaut: 'composee',
    mesure: true,
    motif: `Ta mesure montre l’entière peu fiable ici · ${pire.libelle}. La composée écrit le texte elle-même.`,
  };
}
