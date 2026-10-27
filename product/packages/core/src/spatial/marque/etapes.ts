/**
 * Spatial · Marque · la carte « Finis de configurer <marque> » et la pastille
 * du rail (maquette : `setupCard` / `cfgMissing`, huit étapes). Pur.
 *
 * Chaque étape se décide sur une donnée RÉELLE lue par l'appelant (aucune n'est
 * cochée d'office, sauf les deux qui le sont par construction : on ne voit cette
 * carte que dans un espace qui existe, sur une marque qui existe). La pastille
 * du rail compte EXACTEMENT les étapes non faites de cette carte · le chiffre du
 * rail et celui de l'écran ne peuvent pas se contredire.
 */

/** Ce que l'appelant lit en base pour décider des étapes. */
export interface EtatConfigurationMarque {
  /** Éléments manquants de la fiche · `completudeFicheMarque(...).manques.length`. */
  manquesFiche: number;
  /** Jeton Meta Ads présent sur la marque (`brands.meta_token_enc`). */
  metaConnecte: boolean;
  /** Concurrents réellement suivis depuis la Veille (`followed_brands` de la marque). */
  concurrentsSuivis: number;
  /** Concurrents renseignés dans la fiche (`brands.competitors`). */
  concurrentsRenseignes: number;
  /** Publicités sauvegardées pour la marque (`saved_ads`). */
  sauvegardes: number;
  /** Lots de test lancés (`adsmap_batches.launched_at` non nul). */
  lotsLances: number;
  /** Personnes dans l'espace · membres + invitations en attente. */
  personnes: number;
}

export type CleEtapeMarque = 'espace' | 'marque' | 'fiche' | 'meta' | 'concurrents' | 'veille' | 'test' | 'equipe';

export interface EtapeConfigurationMarque {
  cle: CleEtapeMarque;
  titre: string;
  faite: boolean;
  /** Sous-titre d'une étape à faire · absent quand elle est faite. */
  detail: string | null;
  /** La destination réelle et le libellé du bouton · absents quand l'étape est faite. */
  href: string | null;
  action: string | null;
}

/** Seuils de la maquette · « plus de deux » concurrents scannés, « 5 références ». */
export const SEUIL_CONCURRENTS_SUIVIS = 3;
export const SEUIL_SAUVEGARDES_VEILLE = 5;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function etapesConfigurationMarque(e: EtatConfigurationMarque, brandId: string): EtapeConfigurationMarque[] {
  const L: Array<[CleEtapeMarque, string, boolean, string, string, string]> = [
    ['espace', 'Créer ton espace de travail', true, '', '', ''],
    ['marque', 'Ajouter ta première marque', true, '', '', ''],
    ['fiche', 'Compléter la fiche marque', e.manquesFiche === 0,
      `${pluriel(e.manquesFiche, 'élément')} manquant${e.manquesFiche > 1 ? 's' : ''} · Jarvis peut la préremplir`, `/brands/${brandId}#a-completer`, 'Compléter'],
    ['meta', 'Connecter tes comptes publicitaires', e.metaConnecte, 'Indispensable pour conclure tes tests', '/connections', 'Connecter'],
    ['concurrents', 'Suivre tes concurrents', e.concurrentsSuivis >= SEUIL_CONCURRENTS_SUIVIS,
      e.concurrentsRenseignes > 0 ? `${pluriel(e.concurrentsRenseignes, 'concurrent')} renseigné${e.concurrentsRenseignes > 1 ? 's' : ''} dans la fiche · ${e.concurrentsSuivis} suivi${e.concurrentsSuivis > 1 ? 's' : ''}` : 'Repère les marques qui situent ta catégorie',
      '/veille', 'Suivre'],
    ['veille', `Sauvegarder ${SEUIL_SAUVEGARDES_VEILLE} références dans la Veille`, e.sauvegardes >= SEUIL_SAUVEGARDES_VEILLE,
      e.sauvegardes > 0 ? `${e.sauvegardes} sur ${SEUIL_SAUVEGARDES_VEILLE} · elles nourrissent tes briefs` : 'Elles nourrissent tes briefs', '/veille', 'Explorer'],
    ['test', 'Lancer ton premier test', e.lotsLances > 0, 'Une seule variable par lot, mesurée', '/adsmap/lots', 'Lancer'],
    ['equipe', 'Inviter ton équipe', e.personnes > 1, 'Créatifs, media buyers, client', '/team', 'Inviter'],
  ];
  return L.map(([cle, titre, faite, detail, href, action]) => ({
    cle, titre, faite,
    detail: faite ? null : detail,
    href: faite ? null : href,
    action: faite ? null : action,
  }));
}

export interface CarteConfigurationMarque {
  etapes: EtapeConfigurationMarque[];
  faites: number;
  total: number;
  /** Pourcentage entier, 0 à 100. */
  part: number;
  /** Les étapes non faites · la carte disparaît quand il n'y en a plus. */
  restantes: number;
}

export function carteConfigurationMarque(e: EtatConfigurationMarque, brandId: string): CarteConfigurationMarque {
  const etapes = etapesConfigurationMarque(e, brandId);
  const faites = etapes.filter((x) => x.faite).length;
  return { etapes, faites, total: etapes.length, part: Math.round((faites / etapes.length) * 100), restantes: etapes.length - faites };
}

/**
 * Les lignes montrées · repliée, les trois prochaines étapes à faire ; dépliée,
 * toutes (maquette : `S.cfgOpen ? L : next.slice(0, 3)`). La première étape à
 * faire porte le bouton principal.
 */
export function lignesConfigurationMarque(etapes: readonly EtapeConfigurationMarque[], ouvert: boolean): Array<EtapeConfigurationMarque & { principale: boolean }> {
  const prochaine = etapes.find((x) => !x.faite)?.cle ?? null;
  const liste = ouvert ? etapes : etapes.filter((x) => !x.faite).slice(0, 3);
  return liste.map((x) => ({ ...x, principale: !x.faite && x.cle === prochaine }));
}

/** La pastille du rail Marque · `null` quand tout est fait (aucune pastille). */
export function pastilleConfigurationMarque(e: EtatConfigurationMarque, brandId: string): { classe: 'rbadge'; valeur: string; libelle: string } | null {
  const n = carteConfigurationMarque(e, brandId).restantes;
  return n > 0 ? { classe: 'rbadge', valeur: String(n), libelle: `${n} étape${n > 1 ? 's' : ''} à compléter` } : null;
}
