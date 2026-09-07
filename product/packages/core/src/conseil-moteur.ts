/**
 * Quel moteur conseiller, d'après ce qu'on a mesuré chez cette marque.
 *
 * ── Ce qui recommandait jusqu'ici ────────────────────────────────────────────
 *
 * Un drapeau `recommended` dans le catalogue des moteurs. C'est un avis
 * éditorial, écrit une fois, identique pour toutes les marques, et qui ne sait
 * rien de ce que le moteur a produit ici.
 *
 * Ce n'est pas une mauvaise chose · il faut bien un défaut pour une marque
 * neuve qui n'a rien mesuré. Mais dès qu'on a des relectures, l'avis figé doit
 * pouvoir être contredit par ce qui s'est réellement passé.
 *
 * ── Quand la mesure parle, et quand elle se tait ─────────────────────────────
 *
 * Elle ne parle QUE si un moteur se détache du taux général · c'est la
 * discipline du bilan, et elle vaut ici davantage encore : remplacer un défaut
 * éditorial par un classement que le hasard a produit serait pire que de garder
 * le défaut, parce que ça aurait l'air fondé.
 *
 * Le silence est donc la réponse la plus fréquente, et elle est correcte.
 *
 * ── On ne remplace pas en douce ──────────────────────────────────────────────
 *
 * Quand la mesure désigne un autre moteur que le catalogue, on le DIT. Un
 * réglage qui change tout seul entre deux visites se lit comme un bug, et la
 * fois d'après on ne fait plus confiance à l'écran.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { BilanCopie } from './adsmap/bilan-copie';

export interface LigneConseil {
  /** Ce qu'on affiche sous le moteur · une phrase, pas un tableau. */
  texte: string;
  verdict: 'meilleur' | 'pire' | null;
}

export interface ConseilMoteur {
  /** Le moteur que la MESURE recommande · `null` quand rien ne tranche. */
  recommande: string | null;
  /** Ceux qui réécrivent plus souvent que la moyenne. */
  deconseilles: string[];
  /** Une ligne par moteur mesuré · les autres n'en ont pas. */
  lignes: Record<string, LigneConseil>;
  /** Ce qu'on dit en une phrase · vide quand la mesure se tait. */
  resume: string;
}

const VIDE: ConseilMoteur = { recommande: null, deconseilles: [], lignes: {}, resume: '' };

function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

/**
 * Ce que les relectures conseillent · rien tant qu'elles ne tranchent pas.
 *
 * Une ligne est produite pour CHAQUE moteur mesuré, même sans verdict · savoir
 * qu'un moteur a douze publicités à 8 % de réécriture est utile en soi, et le
 * cacher jusqu'à ce qu'il se détache priverait de la seule information
 * disponible la plupart du temps.
 */
export function conseilMoteur(bilan: BilanCopie | null | undefined): ConseilMoteur {
  const dim = bilan?.dimensions.find((d) => d.dimension === 'moteur');
  if (!dim || !dim.lignes.length) return VIDE;

  const lignes: Record<string, LigneConseil> = {};
  for (const l of dim.lignes) {
    const produit = l.tauxProduit !== null
      ? ` · ${pct(l.tauxProduit)} de produits modifiés`
      : '';
    lignes[l.cle] = {
      texte: `Mesuré ici · ${pct(l.tauxReecriture)} d’accroches réécrites sur ${l.n} pub(s)${produit}`,
      verdict: l.verdict,
    };
  }

  // Le meilleur mesuré · à taux égal, celui qui a le plus de publicités
  // derrière lui. Départager au hasard donnerait un conseil qui change d'un
  // chargement à l'autre.
  const meilleurs = dim.lignes.filter((l) => l.verdict === 'meilleur');
  const gagnant = meilleurs.length
    ? meilleurs.reduce((a, b) => {
        if (b.tauxReecriture !== a.tauxReecriture) return b.tauxReecriture < a.tauxReecriture ? b : a;
        return b.n > a.n ? b : a;
      })
    : null;

  const deconseilles = dim.lignes.filter((l) => l.verdict === 'pire').map((l) => l.cle);

  const morceaux = [
    gagnant ? `${gagnant.cle} tient le mieux ta copie (${pct(gagnant.tauxReecriture)} réécrites sur ${gagnant.n})` : '',
    deconseilles.length ? `${deconseilles.join(', ')} réécrit plus souvent que la moyenne` : '',
  ].filter(Boolean);

  return {
    recommande: gagnant?.cle ?? null,
    deconseilles,
    lignes,
    resume: morceaux.length ? `${morceaux.join(' · ')}.` : '',
  };
}

/**
 * Le catalogue et la mesure se contredisent-ils ?
 *
 * Sert à l'écrire plutôt qu'à changer le réglage en douce. Un réglage qui bouge
 * tout seul entre deux visites se lit comme un bug.
 */
export function contredit(conseil: ConseilMoteur, recommandeCatalogue: string | null | undefined): boolean {
  return !!conseil.recommande && !!recommandeCatalogue && conseil.recommande !== recommandeCatalogue;
}
