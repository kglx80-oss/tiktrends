/**
 * Appliquer ce que les essais ont tranché.
 *
 * ── Le maillon qui manquait ──────────────────────────────────────────────────
 *
 * On sait poser un essai, le tenir, le relire, et cumuler ses répétitions
 * jusqu'à ce qu'un bras se détache du hasard. Puis rien. La rotation continue
 * de servir les quatre coquilles à parts égales, exactement comme avant.
 *
 * Mesurer et ne pas appliquer, c'est produire un rapport que personne ne suit.
 *
 * ── Pourquoi les essais l'emportent sur les taux ─────────────────────────────
 *
 * `layoutsToDrop` existait déjà, et lisait des taux de réussite par coquille.
 * Ces taux sont NON APPARIÉS · une coquille a pu tomber sur de meilleures
 * scènes, de meilleures accroches, de meilleures offres. On compare des
 * coquilles et on mesure tout ce qui les accompagnait.
 *
 * Un essai, lui, tient tout le reste. Quand il a parlé, il parle plus fort. Les
 * taux restent le repli quand aucun essai n'a tranché · ils valent mieux que
 * rien, et ils le disent.
 *
 * ── Appliquer n'est pas figer ────────────────────────────────────────────────
 *
 * Une coquille gagnante ne prend PAS tout le lot. Un lot entièrement composé de
 * la gagnante ne produirait plus aucune comparaison · on ne saurait jamais
 * qu'elle a cessé de gagner, et le marché change.
 *
 * Elle prend donc la MOITIÉ du lot, jamais plus, et jamais la dernière place.
 * C'est un arbitrage assumé entre exploiter ce qu'on sait et continuer
 * d'apprendre.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { AD_LAYOUTS, layoutsForBatch, layoutsToDrop, type AdLayout } from './ad-layouts';
import type { CumulEssais } from './adsmap/essai-resultat';

export interface DecisionCoquilles {
  /** Retirées de la rotation. */
  ecartees: AdLayout[];
  /** Celle qui reçoit la moitié du lot · `null` quand rien n'a tranché. */
  favori: AdLayout | null;
  /** D'où vient la décision · le dire est ce qui la rend contestable. */
  source: 'essais' | 'taux' | 'aucune';
  /** Ce qu'on affiche · vide quand il n'y a rien à dire. */
  resume: string;
}

export function appliquerEssais(input: {
  /** Le cumul des essais de mise en page · `null` quand il n'y en a pas. */
  cumul?: CumulEssais | null;
  /** Taux par coquille · le repli, non apparié. */
  rates?: Array<{ layout: string; nConclusive: number; hitRate: number | null }>;
  globalRate?: number | null;
}): DecisionCoquilles {
  const cumul = input.cumul ?? null;

  // 1 · Les essais, quand ils ont parlé.
  if (cumul && cumul.variable === 'mise_en_page' && cumul.conclusif) {
    const gagnantes = cumul.lignes.filter((l) => l.gagne).map((l) => l.valeur).filter(estCoquille);
    const favori = gagnantes[0] ?? null;

    // On n'écarte que ce qui a VRAIMENT perdu · pas une seule victoire, sur
    // assez d'essais. Une coquille écartée ne produit plus de tests, donc ne
    // peut plus se racheter : le seuil reste sévère même quand la preuve est
    // meilleure.
    const perdantes = cumul.lignes
      .filter((l) => l.victoires === 0 && l.participations >= cumul.essais && cumul.essais >= 5)
      .map((l) => l.valeur)
      .filter(estCoquille)
      .filter((l) => l !== favori);

    const ecartees = borner(perdantes, favori);
    return {
      ecartees, favori, source: 'essais',
      resume: resumeEssais(favori, ecartees, cumul.essais),
    };
  }

  // 2 · Le repli sur les taux · non appariés, et c'est dit.
  const ecartees = layoutsToDrop({
    rates: input.rates ?? [],
    globalRate: input.globalRate ?? null,
  });
  if (ecartees.length) {
    return {
      ecartees, favori: null, source: 'taux',
      resume: `${liste(ecartees)} ${ecartees.length > 1 ? 'sortent' : 'sort'} de la rotation · nettement sous ton taux moyen. Mesure non appariée : lance un essai de mises en page pour trancher pour de bon.`,
    };
  }

  return { ecartees: [], favori: null, source: 'aucune', resume: '' };
}

function estCoquille(v: string): v is AdLayout {
  return (AD_LAYOUTS as readonly string[]).includes(v);
}

/**
 * Jamais moins de deux coquilles en lice.
 *
 * Sinon le lot redevient quatre fois la même image · exactement ce que toute
 * cette mécanique existe pour éviter, et cette fois au nom d'une mesure, ce qui
 * la rendrait plus difficile à contester.
 */
function borner(perdantes: AdLayout[], favori: AdLayout | null): AdLayout[] {
  const restant = AD_LAYOUTS.length - perdantes.length;
  if (restant >= 2) return perdantes;
  const garde = AD_LAYOUTS.length - 2;
  // Ordre du catalogue · le résultat ne doit pas dépendre de l'ordre des lignes
  // reçues, sinon deux lectures de la même mesure ne rendent pas la même chose.
  return AD_LAYOUTS.filter((l) => perdantes.includes(l) && l !== favori).slice(0, Math.max(0, garde));
}

function liste(xs: readonly string[]): string {
  return xs.join(', ');
}

function resumeEssais(favori: AdLayout | null, ecartees: AdLayout[], essais: number): string {
  if (!favori) return '';
  const bouts = [`Tes essais désignent « ${favori} » sur ${essais} lots tranchés · elle prend la moitié de chaque lot.`];
  if (ecartees.length) bouts.push(`${liste(ecartees)} n'${ecartees.length > 1 ? 'ont' : 'a'} jamais gagné et sort${ecartees.length > 1 ? 'ent' : ''} de la rotation.`);
  bouts.push('Elle ne prend pas tout le lot · un lot uniforme ne comparerait plus rien, et on ne saurait jamais qu’elle a cessé de gagner.');
  return bouts.join(' ');
}

/* -------------------------------------------------------------------------- */
/*  La rotation qui tient compte du favori                                     */
/* -------------------------------------------------------------------------- */

/**
 * Les mises en page d'un lot, avec une coquille privilégiée.
 *
 * ── La règle, et l'erreur qu'elle corrige ────────────────────────────────────
 *
 * La première version posait le favori en tête et laissait la rotation remplir
 * le reste, en supposant qu'elle repasserait par lui. Elle ne repasse pas :
 * avec quatre coquilles et trois places restantes, le tour ne boucle jamais. Le
 * favori gardait donc UNE place, exactement comme avant, et « appliquer ce qui
 * a gagné » ne s'appliquait pas. Un test l'a montré au premier passage.
 *
 * La règle est donc explicite : **le favori prend la moitié du lot, jamais
 * plus, et jamais la dernière place.** Le reste tourne sur les AUTRES coquilles,
 * pour que la comparaison continue.
 *
 * Sur un lot de quatre, il passe de 25 % à 50 % · c'est visible, et il reste
 * deux places pour découvrir qu'il a cessé de gagner.
 *
 * Sans favori, ou quand il ne survit pas au vivier, on retombe exactement sur
 * la rotation d'avant · aucune décision non prise ne doit changer un rendu.
 */
export function layoutsForBatchFavori(
  n: number,
  seed: number,
  pool: readonly AdLayout[],
  favori: AdLayout | null,
): AdLayout[] {
  const dispo = pool.length ? pool : AD_LAYOUTS;
  const total = Math.max(0, Math.trunc(n));
  if (!favori || !dispo.includes(favori) || total < 2 || dispo.length < 2) {
    return layoutsForBatch(total, seed, dispo);
  }
  // La moitié, bornée à `total - 1` · la dernière place revient toujours à une
  // autre coquille, sinon le lot devient uniforme et ne compare plus rien.
  const parts = Math.min(total - 1, Math.max(1, Math.round(total / 2)));
  const autres = dispo.filter((l) => l !== favori);
  return [
    ...Array.from({ length: parts }, () => favori),
    ...layoutsForBatch(total - parts, seed, autres.length ? autres : dispo),
  ];
}
