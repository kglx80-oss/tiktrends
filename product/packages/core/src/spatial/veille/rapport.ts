import { messageServiceInactif } from '../../copie-service';

/**
 * Spatial · Veille · le rapport d'un concurrent (`/brands/[id]/competitors/[nom]`,
 * repris de l'écran V5). Pur · les onglets, ce que chaque dimension permet
 * (tester l'insight dans un projet Studios, ou seulement le lire), la
 * répartition des formats et les messages de retour de l'analyse.
 */
export type OngletRapport = 'overview' | 'creatives' | 'hooks' | 'adcopy' | 'headlines' | 'angles' | 'usps' | 'desires' | 'emotions' | 'themes' | 'personas';
export type ChampInsight = 'hooks' | 'adCopyAngles' | 'headlines' | 'adAngles' | 'usps' | 'desires' | 'emotions' | 'themes' | 'personas';

export interface DefOngletRapport {
  cle: OngletRapport;
  libelle: string;
  /** La dimension des insights lue par l'onglet (absent · aperçu ou créatives). */
  champ?: ChampInsight;
  titre?: string;
  /** L'insight est une amorce d'accroche · il se teste dans un projet Studios. */
  testable?: boolean;
  /** Descripteurs courts (émotions, thèmes) · en pastilles. */
  pastilles?: boolean;
}

export const ONGLETS_RAPPORT_CONCURRENT: readonly DefOngletRapport[] = [
  { cle: 'overview', libelle: 'Aperçu' },
  { cle: 'creatives', libelle: 'Créatives' },
  { cle: 'hooks', libelle: 'Hooks', champ: 'hooks', titre: 'Hooks récurrents', testable: true },
  { cle: 'adcopy', libelle: 'Ad copy', champ: 'adCopyAngles', titre: 'Angles de copy', testable: true },
  { cle: 'headlines', libelle: 'Headlines', champ: 'headlines', titre: 'Headlines', testable: true },
  { cle: 'angles', libelle: 'Angles', champ: 'adAngles', titre: 'Angles marketing', testable: true },
  { cle: 'usps', libelle: 'USP', champ: 'usps', titre: 'Propositions de valeur', testable: true },
  { cle: 'desires', libelle: 'Désirs', champ: 'desires', titre: 'Désirs adressés', testable: true },
  { cle: 'emotions', libelle: 'Émotions', champ: 'emotions', titre: 'Émotions activées', pastilles: true },
  { cle: 'themes', libelle: 'Thèmes', champ: 'themes', titre: 'Thèmes / univers', pastilles: true },
  { cle: 'personas', libelle: 'Personas', champ: 'personas', titre: 'Personas déduits' },
];

/** L'onglet demandé, ou l'aperçu pour une valeur inconnue. */
export function ongletRapport(brut: string | null | undefined): DefOngletRapport {
  return ONGLETS_RAPPORT_CONCURRENT.find((o) => o.cle === brut) ?? ONGLETS_RAPPORT_CONCURRENT[0]!;
}

/** La répartition des formats · part de chaque média, la plus grosse d'abord. */
export function repartitionMedias(parMedia: Readonly<Record<string, number>>): Array<{ libelle: string; n: number; part: number }> {
  const total = Object.values(parMedia).reduce((a, n) => a + n, 0);
  if (total <= 0) return [];
  const nom = (k: string) => (k === 'video' ? 'Vidéo' : k === 'image' ? 'Image' : k.charAt(0).toUpperCase() + k.slice(1));
  return Object.entries(parMedia).map(([k, n]) => ({ libelle: nom(k), n, part: Math.round((n / total) * 100) })).sort((a, b) => b.n - a.n);
}

/** Les retours de `analyzeCompetitorAction` (`?e=`), copie client (recette #106b). */
export function messagesRetourRapport(): Record<string, string> {
  return {
    'e:nolibrary': messageServiceInactif('veille'),
    'e:fetch': 'Échec de la récupération des créas, réessaie.',
    'e:noresult': 'Aucune créa trouvée pour ce concurrent. Vérifie l’orthographe exacte de sa page Meta (sans note entre parenthèses) · certaines marques locales ont peu de créas indexées.',
    'ok:1': 'Analyse du concurrent à jour.',
  };
}
