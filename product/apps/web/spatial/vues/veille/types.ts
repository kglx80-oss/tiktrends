import type { InspoAd } from '@tiktrends/integrations';

/**
 * Ce qu'une carte d'annonce de la Veille reçoit · tout est calculé par la page
 * (source réelle + règles du noyau `spatial/veille`), la carte ne décide rien.
 */
export interface CarteVeilleDonnees {
  cle: string;
  ancre: string | null;
  /** L'instantané envoyé tel quel aux actions de sauvegarde et de suivi (`saveAd`, `followBrand`). */
  ad: InspoAd;
  marque: { nom: string; initiale: string; fond: string };
  active: boolean;
  jours: string;
  signaux: ReadonlyArray<{ icone: 'eye' | 'copy'; texte: string; titre: string }>;
  pays: string | null;
  portee: string | null;
  depense: string | null;
  croissance: { texte: string; classe: '' | 'up' | 'down' } | null;
  texte: string | null;
  image: string | null;
  /** Classe de cadrage de la maquette (`r916` · `r11`) · TikTok est vertical. */
  ratio: '' | 'r916' | 'r11';
  tendance: boolean;
  style: string;
  domaine: string | null;
  titre: string;
  cta: string | null;
  /** La préparation d'un projet Studios depuis cette créa (`studioDepuisVeille`). */
  iterer: string;
  sauvee: boolean;
  suivie: boolean;
  detail: DetailVeille;
}

export interface DetailVeille {
  statut: string;
  liens: ReadonlyArray<{ href: string; titre: string; sous: string; icone: 'meta' | 'site' | 'tt' }>;
  kpis: ReadonlyArray<[string, string]>;
  lecture: string;
  /** Toutes les annonces du même annonceur dans la Veille (`lienAnnonceurVeille`) · `null` si la source ne sait pas. */
  annonceur: string | null;
  /** Les relais Jarvis · ouvrent un BROUILLON visible (`/jarvis/veille`), rien n'est envoyé seul. */
  jarvis: ReadonlyArray<{ href: string; titre: string; sous: string }>;
  /** Le texte publicitaire exportable en TXT · `null` sans texte. */
  texte: string | null;
}
