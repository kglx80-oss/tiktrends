/**
 * Spatial · l'ÉTAT de la connexion Meta Ads d'une marque, et son libellé · UNE
 * règle pour tous les écrans qui en parlent (Accueil · Reporting Meta, vue
 * Analytics, Radar créatif).
 *
 * Pourquoi (planche de banc v4) · trois écrans se contredisaient sur la même
 * marque · l'Accueil disait « synchronisé hier », Analytics « première
 * synchronisation en attente », le Radar « Brancher Meta Ads ». Chacun lisait
 * SA colonne et en tirait sa conclusion :
 *  · l'Accueil datait par `adsmap_synced_at` (mesure quotidienne par annonce) ;
 *  · Analytics concluait « en attente » de l'absence de KPI de compte
 *    (`ads_insights_json`), sans regarder la mesure Adsmap ;
 *  · le Radar invitait à « brancher » dès qu'il n'avait pas de créas, sans
 *    regarder le jeton.
 *
 * La vérité est celle du CONNECTEUR · un jeton, un compte pub choisi, et la
 * DERNIÈRE synchro réelle avec Meta, quel que soit le flux qui l'a faite (les
 * KPI du compte · `meta_synced_at`, ou la mesure Adsmap · `adsmap_synced_at`,
 * qui n'est posée qu'après une lecture Meta réussie). L'absence d'une donnée
 * propre à un écran ne change pas l'état de la connexion · l'écran le dit en
 * plus, sans le contredire.
 *
 * Pur · l'horloge est passée par l'appelant.
 */
import { depuisRelatif } from './accueil/temps';

/** Les axes réels de la connexion, tels que la base les porte (colonnes de `brands`). */
export interface EntreeConnexionMeta {
  /** `meta_token` présent. */
  jeton: boolean;
  /** `meta_ad_account_id` choisi. */
  compte: boolean;
  /** Nombre de comptes pub accessibles (`meta_ad_accounts_json`). */
  comptes: number;
  /** Dernière synchro des KPI du compte (`meta_synced_at`). */
  kpiLe: Date | string | null | undefined;
  /** Dernière mesure Adsmap par annonce (`adsmap_synced_at`). */
  mesuresLe: Date | string | null | undefined;
  /** Des KPI de compte sont stockés (`ads_insights_json`) · une ancienne ligne peut en avoir sans date. */
  kpiPresents?: boolean;
}

export type PhaseConnexionMeta = 'a_brancher' | 'compte_a_choisir' | 'jamais_synchronise' | 'synchronise';

export interface EtatConnexionMeta {
  phase: PhaseConnexionMeta;
  /** La dernière synchro réelle avec Meta (la plus récente des deux), ou `null`. */
  derniere: Date | null;
  /** LE libellé · le même mot sur chaque écran. */
  libelle: string;
  /** Le geste qui débloque la connexion (toujours dans Connexions), ou `null` quand elle est à jour. */
  action: string | null;
}

/** Le geste « relancer » quand la connexion est saine mais qu'un écran n'a pas encore SA donnée. */
export const RELANCE_META = 'Synchroniser Meta Ads';

const date = (v: Date | string | null | undefined): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

export function etatConnexionMeta(e: EntreeConnexionMeta, maintenant: Date): EtatConnexionMeta {
  if (!e.jeton) return { phase: 'a_brancher', derniere: null, libelle: 'Meta Ads non connecté', action: 'Connecter Meta Ads' };
  // Un compte à choisir parmi plusieurs bloque toute synchro (les deux flux exigent le compte).
  if (!e.compte && e.comptes > 1) return { phase: 'compte_a_choisir', derniere: null, libelle: 'Meta Ads connecté · compte pub à choisir', action: 'Choisir le compte pub' };
  const dates = [date(e.kpiLe), date(e.mesuresLe)].filter((d): d is Date => d !== null);
  const derniere = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  if (!derniere && !e.kpiPresents) {
    return { phase: 'jamais_synchronise', derniere: null, libelle: 'Meta Ads connecté · première synchronisation en attente', action: RELANCE_META };
  }
  const depuis = derniere ? depuisRelatif(derniere, maintenant) : null;
  return { phase: 'synchronise', derniere, libelle: depuis ? `Meta Ads · synchronisé ${depuis}` : 'Meta Ads · synchronisé', action: null };
}

/**
 * Le texte de manque · ce que l'écran n'a pas, dit SANS contredire l'état de la
 * connexion. `quoi` · ce que l'écran montrerait (« ta dépense et ton ROAS ») ;
 * `absent` · la phrase de l'écran quand la connexion est à jour mais que SA
 * donnée manque (elle ne dit jamais « brancher » ni « en attente »).
 */
export function manqueMeta(etat: EtatConnexionMeta, o: { quoi: string; absent: string }): string {
  switch (etat.phase) {
    case 'a_brancher': return `Connecte ton compte publicitaire Meta pour voir ici ${o.quoi}.`;
    case 'compte_a_choisir': return `Plusieurs comptes pub sont reliés · choisis celui de cette marque pour voir ici ${o.quoi}.`;
    case 'jamais_synchronise': return `Lance la première synchronisation depuis Connexions pour voir ici ${o.quoi}.`;
    case 'synchronise': return o.absent;
  }
}

/** L'encart Meta de la vue Analytics, quand les KPI du compte manquent · titre = LE libellé de l'état. */
export function encartMetaConnexion(etat: EtatConnexionMeta): { titre: string; texte: string; cta: { libelle: string; href: string } } {
  return {
    titre: etat.libelle,
    texte: manqueMeta(etat, {
      quoi: 'ta dépense, ton ROAS, ton CPA, ton panier moyen, tes CPC et CPM et tes top créas, comparés à la période précédente',
      // Les chiffres clés (dépense, CPA, ROAS, valeur d'achat) sont au-dessus, d'après la source que la règle a
      // retenue (`chiffresClesMeta`) · ce texte ne dit plus « non relevés » pour eux (D2), seulement pour le reste.
      absent: 'Les indicateurs du compte entier (panier moyen, CPC, CPM, répartitions, top créas) n’ont pas encore été relevés · relance leur synchronisation depuis Connexions.',
    }),
    cta: { libelle: etat.action ?? RELANCE_META, href: '/connections' },
  };
}

/** Le Radar créatif sans créas · ce qui manque, et le geste. */
export function manqueRadarCreatif(etat: EtatConnexionMeta): { texte: string; action: string } {
  return {
    texte: manqueMeta(etat, {
      quoi: 'tes créas notées Hook, Hold, CTR et Conv (A à D) et leur recommandation',
      absent: 'Aucune créa Meta relevée sur les 30 derniers jours · relance la synchronisation depuis Connexions.',
    }),
    action: etat.action ?? RELANCE_META,
  };
}
