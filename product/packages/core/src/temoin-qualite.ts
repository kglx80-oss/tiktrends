/**
 * Le durcissement et le repli MARCHENT-ils ? · le témoin par marque.
 *
 * ── Pourquoi ce module existe ────────────────────────────────────────────────
 *
 * On durcit la consigne d'entière sur les défauts mesurés (#264), et on replie
 * en composée ce qui reste cassé (#263). Deux boucles qui doivent RÉDUIRE les
 * défauts livrés. Mais rien ne mesurait leur EFFET · on agissait sans jamais
 * vérifier que la qualité montait. Une action non mesurée est une intention.
 *
 * Ce module compare les défauts d'une marque entre une fenêtre ANCIENNE et une
 * fenêtre RÉCENTE de ses relectures. Il ne prouve pas la CAUSE (durcissement vs
 * autre chose) · il constate la TENDANCE, ce qui est déjà ce qu'on veut savoir :
 * chez cette marque, ça s'améliore, ça se dégrade, ou c'est stable.
 *
 * ── On ne conclut qu'à séparation nette des intervalles ──────────────────────
 *
 * La discipline du reste de la carte · un minimum d'effectif par fenêtre, et une
 * amélioration n'est déclarée que si l'intervalle de Wilson RÉCENT est
 * entièrement sous l'ANCIEN (et l'inverse pour une dégradation). Deux taux qui se
 * chevauchent ne tranchent pas · le silence est la réponse la plus fréquente, et
 * la plus honnête sur des fenêtres de quelques dizaines de pubs.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { wilsonInterval } from './adsmap/stats';
import { MIN_RELECTURES } from './adsmap/bilan-copie';

/** Le niveau des intervalles · le même que partout ailleurs sur la carte. */
const NIVEAU = 0.8;

/** Les défauts comptés sur une fenêtre de relectures. */
export interface FenetreDefauts {
  /** Relues dans la fenêtre · dénominateur de l'accroche et des accents. */
  n: number;
  /** Accroches réécrites. */
  accroche: number;
  /** Accents perdus. */
  accents: number;
  /** Relues où il y avait du texte à juger · dénominateur de la lisibilité. */
  avecTexte: number;
  /** Textes illisibles. */
  illisibles: number;
}

export type SensEvolution = 'amelioration' | 'degradation';
export type DefautSuivi = 'accroche' | 'accents' | 'illisible';

const DEFAUT_LABEL: Record<DefautSuivi, string> = {
  accroche: 'accroches réécrites', accents: 'accents perdus', illisible: 'texte illisible',
};

export interface Evolution {
  defaut: DefautSuivi;
  /** Taux ancien et récent · pour l'afficher, jamais pour trancher (c'est l'intervalle qui tranche). */
  avant: number;
  apres: number;
  sens: SensEvolution;
}

export interface TemoinQualite {
  evolutions: Evolution[];
  /** Une phrase par évolution nette · vide quand rien ne bouge. */
  resume: string;
}

/** L'évolution d'un défaut entre deux fenêtres, ou `null` si rien ne tranche. */
function evolue(
  defaut: DefautSuivi,
  vieux: { mauvais: number; total: number },
  recent: { mauvais: number; total: number },
): Evolution | null {
  // Sous le minimum d'effectif dans l'une OU l'autre fenêtre, on ne compare pas ·
  // un intervalle sur cinq pubs couvre à peu près tout.
  if (vieux.total < MIN_RELECTURES || recent.total < MIN_RELECTURES) return null;
  const iv = wilsonInterval(vieux.mauvais, vieux.total, NIVEAU);
  const ir = wilsonInterval(recent.mauvais, recent.total, NIVEAU);
  const avant = vieux.mauvais / vieux.total;
  const apres = recent.mauvais / recent.total;
  // Séparation nette · les intervalles ne se chevauchent pas. Un simple écart de
  // taux ponctuel ne suffit pas · c'est du bruit tant que les intervalles se
  // recouvrent.
  if (ir.hi < iv.lo) return { defaut, avant, apres, sens: 'amelioration' };
  if (ir.lo > iv.hi) return { defaut, avant, apres, sens: 'degradation' };
  return null;
}

export function temoinQualite(ancienne: FenetreDefauts, recente: FenetreDefauts): TemoinQualite {
  const evolutions = [
    evolue('accroche', { mauvais: ancienne.accroche, total: ancienne.n }, { mauvais: recente.accroche, total: recente.n }),
    evolue('accents', { mauvais: ancienne.accents, total: ancienne.n }, { mauvais: recente.accents, total: recente.n }),
    evolue('illisible', { mauvais: ancienne.illisibles, total: ancienne.avecTexte }, { mauvais: recente.illisibles, total: recente.avecTexte }),
  ].filter((e): e is Evolution => e !== null);

  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const morceaux = evolutions.map((e) =>
    `${DEFAUT_LABEL[e.defaut]} ${pct(e.avant)} → ${pct(e.apres)} (${e.sens === 'amelioration' ? 'en amélioration' : 'en dégradation'})`,
  );
  const resume = morceaux.length ? `Depuis les premiers lots · ${morceaux.join(' · ')}.` : '';

  return { evolutions, resume };
}
