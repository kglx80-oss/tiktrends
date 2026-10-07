/**
 * Le passage Studio → Adsmap · de la carte d'une créa au test qui la mesure.
 *
 * ── Ce qui manquait (audit lot I) ────────────────────────────────────────────
 *
 * Le Studio montrait le verdict sur la carte, mais aucun chemin ne menait au
 * test lui-même · résultats, arbitrage, apprentissage, itération vivent dans le
 * panneau d'un test Adsmap, qu'on n'ouvrait qu'en cherchant l'ad à la main dans
 * la file, la table ou la carte. La boucle « créer → mesurer → apprendre →
 * itérer » se cassait au premier pas.
 *
 * ── Ce que ce fichier décide ─────────────────────────────────────────────────
 *
 * 1. Quand une ad est LANCÉE (`adLancee`) · c'est ce qui sépare « à lancer »
 *    de « en mesure » sur la carte.
 * 2. Le lien de la carte vers le test (`lienAdsmapCarte`) · sa cible et son
 *    libellé, choisi d'après ce que la destination MONTRE vraiment · « Voir le
 *    verdict » seulement quand un verdict existe, « Ouvrir le test » sinon, et
 *    aucun lien vers un test introuvable ni sans accès à Adsmap.
 * 3. La lecture du lien profond côté Adsmap (`lireLienProfondAdsmap`) · un
 *    identifiant mal formé est ignoré plutôt que transmis.
 * 4. Le rangement d'un état de carte dans les filtres de la galerie
 *    (`bucketPerfCarte`) · « à lancer » n'est pas « en mesure ».
 *
 * Suivre le lien ne fait que LIRE · aucune écriture, aucune génération au clic.
 *
 * Pur : ni base, ni horloge, ni réseau.
 */

import { texteAdIncomplete, adCompletable, COMPLETER_LE_TEST } from './reprise-adsmap';
import type { EtatVerdictCarte } from './verdict-carte';

/** Statuts d'une ad Adsmap qui disent qu'elle a été diffusée. */
const STATUTS_LANCES = new Set(['live', 'paused', 'done']);

/**
 * L'ad a-t-elle été diffusée · une date de lancement, ou un statut qui ne se
 * prend qu'après diffusion. Un brouillon, une proposition, une ad « prête » ne
 * le sont pas.
 */
export function adLancee(a: { status: string | null | undefined; launchedAt: Date | string | null | undefined }): boolean {
  return !!a.launchedAt || STATUTS_LANCES.has(a.status ?? '');
}

/** Paramètres du lien profond vers le panneau d'un test. */
export const PARAM_TEST_ADSMAP = 'ad';
export const PARAM_DEPUIS = 'depuis';
export const DEPUIS_STUDIO = 'studio';

/** Le retour vers le Studio, offert au panneau ouvert depuis une carte. */
export const RETOUR_STUDIO = { href: '/studio/ads', libelle: 'Retour au Studio' } as const;

export interface LienAdsmapCarte {
  href: string;
  /** Libellé visible · dit ce que la destination montre. */
  libelle: string;
  /** Infobulle · précise l'état, sans promettre de résultat absent. */
  titre: string;
}

const AVEC_VERDICT: ReadonlySet<EtatVerdictCarte> = new Set([
  'gagnante', 'petite_gagnante', 'gagnante_relative', 'perdante', 'non_concluant', 'diffusion_faible',
]);
/** Gagnantes arbitrées et comparables · le panneau propose alors l'itération. */
const ITERABLES: ReadonlySet<EtatVerdictCarte> = new Set(['gagnante', 'petite_gagnante']);

/**
 * Le lien de la carte vers son test Adsmap, ou `null` quand il n'y a rien à
 * ouvrir · créa non suivie, test introuvable, accès Adsmap refusé.
 */
export function lienAdsmapCarte(o: { adsmapAdId: string | null | undefined; etat: EtatVerdictCarte | null | undefined; acces: boolean }): LienAdsmapCarte | null {
  if (!o.acces || !o.adsmapAdId || !o.etat || o.etat === 'introuvable') return null;
  const href = `/adsmap?${PARAM_TEST_ADSMAP}=${encodeURIComponent(o.adsmapAdId)}&${PARAM_DEPUIS}=${DEPUIS_STUDIO}`;
  if (ITERABLES.has(o.etat)) {
    return { href, libelle: 'Voir le verdict · itérer', titre: 'Résultats, verdict arbitré, apprentissage et prochaine itération dans Adsmap' };
  }
  if (AVEC_VERDICT.has(o.etat)) {
    return { href, libelle: 'Voir le verdict', titre: 'Résultats, verdict et apprentissage dans Adsmap' };
  }
  if (o.etat === 'a_lancer') {
    return { href, libelle: 'Ouvrir le test', titre: 'Test pas encore lancé · aucun chiffre · hypothèse et suite dans Adsmap' };
  }
  // en_mesure · lancée, pas de verdict arbitré.
  return { href, libelle: 'Ouvrir le test', titre: 'Test lancé · pas encore de verdict arbitré' };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const premier = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Le lien profond lu côté Adsmap · l'identifiant n'est retenu que bien formé
 * (un identifiant d'ad est un UUID) · le reste est ignoré, jamais transmis.
 */
export function lireLienProfondAdsmap(sp: Record<string, string | string[] | undefined>): { adId: string | null; depuisStudio: boolean } {
  const brut = premier(sp[PARAM_TEST_ADSMAP])?.trim() ?? '';
  return {
    adId: UUID.test(brut) ? brut.toLowerCase() : null,
    depuisStudio: premier(sp[PARAM_DEPUIS]) === DEPUIS_STUDIO,
  };
}

/**
 * L'état d'une carte JUSTE après « Suivre dans Adsmap » · l'ad naît brouillon,
 * rien n'est lancé ni mesuré · « à lancer ». Un état déjà connu (verdict, lien
 * rompu) n'est pas écrasé par l'optimisme.
 */
export function etatApresSuivi(actuel: EtatVerdictCarte | null | undefined): EtatVerdictCarte {
  return actuel ?? 'a_lancer';
}

/** Le filtre de performance d'une carte de galerie. */
export type BucketPerfCarte = 'gagnante' | 'en_mesure' | 'a_lancer' | 'inconnue' | 'autre';

/**
 * Range un état de carte dans les filtres de la galerie · « à lancer » a son
 * propre filtre (une créa jamais diffusée n'est pas « en mesure »), un test
 * introuvable tombe dans « autre » (ni mesuré ni inconnu).
 */
export function bucketPerfCarte(v: EtatVerdictCarte | null | undefined): BucketPerfCarte {
  if (v == null) return 'inconnue';
  if (v === 'en_mesure') return 'en_mesure';
  if (v === 'a_lancer') return 'a_lancer';
  if (v === 'gagnante' || v === 'petite_gagnante') return 'gagnante';
  return 'autre';
}

// ── Le panneau d'un test, selon son état RÉEL (recette I1 #1) ────────────────
//
// Ouvert depuis une créa « à lancer », le panneau disait « Lance Mesurer
// maintenant » à un test jamais diffusé, montrait une section d'arbitrage vide
// et une règle d'itération (gagnante / perdante) sans verdict. On décide ici ce
// que chaque section a le droit de dire · le panneau ne fait que l'afficher.

/** La phase d'un test · ce qui décide de ce que le panneau peut dire. */
export type PhaseTest = 'a_lancer' | 'en_mesure' | 'mesure';

export interface PresentationTest {
  phase: PhaseTest;
  /** Le texte de « Ce que le test a donné » quand aucun verdict n'est calculé · `null` = montrer le verdict. */
  resultatVide: string | null;
  /**
   * La prochaine étape EXISTANTE, et son lien quand le rôle le permet.
   * `completer` (lot 21) · l'ad incomplète se complète sur place · le tiroir
   * montre le formulaire « Compléter le test » à cette ancre, au lieu d'une
   * impasse. Absent ou `null` = pas de formulaire.
   */
  prochaineEtape: { texte: string; lien: { href: string; libelle: string } | null; completer?: { titre: string; ancre: string } | null } | null;
  /** La section d'arbitrage a-t-elle quelque chose à montrer ou à faire. */
  arbitrageVisible: boolean;
  /** La règle d'itération (gagnante / perdante) ne vaut qu'après un verdict. */
  suiteApresVerdict: boolean;
  /** Ce que dit « La suite » avant tout verdict · `null` en phase mesurée. */
  suiteAttente: string | null;
}

/** L'existant pour préparer et lancer un test · l'écran des lots (admin). */
export const PREPARER_UN_TEST = { href: '/adsmap/lots', libelle: 'Préparer un test' } as const;

export function presentationTest(
  t: { status: string; launchedAt: string | null; computed: string | null; verdictStatus: 'computed' | 'validated' | null; batchNumber: number | null; apprentissages: number;
    /**
     * Lot 17 · ce qui manque à l'ad pour partir en test (`manquesAvantTest`).
     * Absent ou vide = rien ne bloque. Sinon « Préparer un test » bouclait ·
     * les Lots la disaient « incomplète » et renvoyaient vers cette fiche.
     * Lot 21 · la fiche offre le formulaire « Compléter le test » (brouillon
     * ou proposition seulement · `adCompletable`).
     */
    manques?: string[] },
  o: { peutPreparer: boolean; peutMesurer: boolean },
): PresentationTest {
  const arbitre = t.verdictStatus === 'validated';
  if (t.computed || arbitre) {
    return { phase: 'mesure', resultatVide: null, prochaineEtape: null, arbitrageVisible: true, suiteApresVerdict: true, suiteAttente: null };
  }
  const arbitrageVisible = t.apprentissages > 0;
  if (adLancee(t)) {
    return {
      phase: 'en_mesure',
      resultatVide: o.peutMesurer
        ? 'Lancée · pas encore de verdict calculé. « Mesurer maintenant », en tête d’Adsmap, le calcule dès que les chiffres de la régie arrivent.'
        : 'Lancée · pas encore de verdict calculé. La prochaine mesure le calculera dès que les chiffres de la régie arrivent.',
      prochaineEtape: null,
      arbitrageVisible,
      suiteApresVerdict: false,
      suiteAttente: 'L’itération se décide sur le verdict · rien à décider tant que la mesure n’a pas tranché.',
    };
  }
  const lot = t.batchNumber;
  if (t.manques && t.manques.length > 0) {
    return {
      phase: 'a_lancer',
      resultatVide: 'Pas encore lancée · aucun chiffre à lire, donc rien à arbitrer.',
      prochaineEtape: {
        texte: texteAdIncomplete(t.manques),
        lien: null,
        completer: adCompletable(t.status) ? { ...COMPLETER_LE_TEST } : null,
      },
      arbitrageVisible,
      suiteApresVerdict: false,
      suiteAttente: 'L’itération se décide sur le verdict · rien à décider tant que le test n’a pas tourné.',
    };
  }
  const base = t.status === 'ready' && lot !== null
    ? `Prête dans le lot ${lot} · il reste à lancer le lot · la mesure commence au lancement.`
    : lot !== null
      ? `Dans le lot ${lot} · à préparer puis lancer · la mesure commence au lancement.`
      : 'Prochaine étape · la placer dans un lot de test, le préparer puis le lancer · la mesure commence au lancement.';
  return {
    phase: 'a_lancer',
    resultatVide: 'Pas encore lancée · aucun chiffre à lire, donc rien à arbitrer.',
    prochaineEtape: {
      texte: o.peutPreparer ? base : `${base} Un administrateur de l’espace s’en charge.`,
      lien: o.peutPreparer ? { ...PREPARER_UN_TEST } : null,
    },
    arbitrageVisible,
    suiteApresVerdict: false,
    suiteAttente: 'L’itération se décide sur le verdict · rien à décider tant que le test n’a pas tourné.',
  };
}
