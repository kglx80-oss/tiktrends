import type { InspoAd } from '@tiktrends/integrations';
import type { AccesHypothese } from '@tiktrends/core';

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
  /** Lot 7 (VB C02) · la plateforme de la source, dite sur la carte à côté du pays · absente, la carte ne la montre pas. */
  plateforme?: string | null;
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
  /** Lot 6 (VB C09, F15, V20) · les tags posés à la main sur la sauvegarde de cette pub ici · absent = aucun. */
  tags?: ReadonlyArray<{ cle: string; nom: string }>;
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
  /**
   * « Ajouter aux hypothèses » (lot 1 V5, `creerHypotheseAction`) · ouvert ou
   * fermé avec sa raison (`accesHypothese`). Absent, le geste n'est pas rendu.
   */
  hypothese?: AccesHypothese;
  /**
   * « Itérer à partir de cette pub » (VB F26) · l'écran Itérer, cette pub en
   * source d'inspiration (`lienIterationVeille`) · même porte que la garde
   * serveur (`adsmap`, marque active). Absent, le geste n'est pas rendu.
   */
  iterationVeille?: { acces: AccesHypothese; href: string };
}
