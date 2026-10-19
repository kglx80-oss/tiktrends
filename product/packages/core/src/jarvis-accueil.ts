/**
 * UX V5 · le PANNEAU d'accueil de Jarvis, sur les vraies données.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * La maquette V5 de Jarvis empile sous le composeur une colonne de chiffres
 * fictifs · quatre KPI de dépense (« 10 416 € », « ROAS 1,82 »), trois lignes
 * d'automatisation cliquables (« Activer », « Connecter »), une carte « Fiche
 * marque 72 % ». Recopier la maquette, c'est afficher des chiffres que personne
 * n'a mesurés et des boutons qui ne branchent rien.
 *
 * Ce module décide, à partir de lectures RÉELLES fournies par l'appelant, ce qui
 * a le droit d'être montré :
 *
 *  · `completudeFicheJarvis` · le VRAI pourcentage de la fiche marque (via
 *    `completudeFicheMarque`, 12 items réels), avec les éléments manquants et le
 *    lien vers l'endroit exact qui les remplit ;
 *  · `encartKpiJarvis` · l'encart « Chiffres clés » · état VIDE honnête tant
 *    qu'aucune source de dépense n'est agrégée chez nous (c'est le cas · nous
 *    n'agrégeons pas la dépense pub), avec un lien pour la brancher · jamais un
 *    chiffre inventé. Si une vraie source est un jour lue, elle s'affiche ;
 *  · `AUTOMATISATIONS_JARVIS` · les trois lignes d'automatisation, toutes
 *    DÉSACTIVÉES, avec le libellé qui dit qu'elles arrivent · le service
 *    d'actions programmées n'existe pas encore (décision Kevin · pas de
 *    simulation, pas de faux succès).
 *
 * Pur · ni base, ni réseau, ni horloge, ni modèle. Les libellés sont figés, les
 * liens dérivés d'un identifiant de marque fourni.
 */

import { completudeFicheMarque, ELEMENTS_FICHE_MARQUE, type FicheMarqueLue } from './accueil-v5';

/* -------------------------------------------------------------------------- */
/*  Carte « complétude fiche marque »                                         */
/* -------------------------------------------------------------------------- */

/** Où remplir chaque élément manquant · sous-chemin de `/brands/[id]`, comme le parcours guidé de la fiche. */
export const DESTINATION_FICHE_MARQUE: Readonly<Record<keyof FicheMarqueLue, string>> = {
  description: '?tab=overview#profil',
  usp: '?tab=overview#profil',
  audience: '?tab=overview#profil',
  category: '?tab=overview#profil',
  categoryNeeds: '?tab=overview#profil',
  tone: '?tab=overview#profil',
  industryTags: '?tab=overview#profil',
  colors: '?tab=overview#charte',
  scenarios: '?tab=audience',
  personas: '?tab=audience',
  produits: '?tab=products',
  concurrents: '?tab=competitors',
};

export interface ManqueFiche {
  cle: keyof FicheMarqueLue;
  libelle: string;
  /** Lien vers l'endroit RÉEL qui remplit cet élément · `/brands/<id><sous-chemin>`. */
  href: string;
}

export interface CompletudeFicheJarvis {
  /** Le vrai pourcentage, calculé par `completudeFicheMarque` (jamais figé). */
  score: number;
  /** Combien d'éléments sur 12 sont renseignés. */
  faits: number;
  total: number;
  /** Les éléments manquants, cliquables vers leur destination. `[]` quand la fiche est complète. */
  manques: ManqueFiche[];
  /** Lien vers la fiche, pour le bouton « Compléter » global. */
  ficheHref: string;
}

/**
 * La carte de complétude · le score RÉEL de la marque et les manques cliquables.
 * Réutilise `completudeFicheMarque` (règle au noyau, mesure sur 12 items) · ce
 * module ne fait qu'y rattacher une destination par élément manquant.
 */
export function completudeFicheJarvis(f: FicheMarqueLue, brandId: string): CompletudeFicheJarvis {
  const { score, checks } = completudeFicheMarque(f);
  const manques: ManqueFiche[] = ELEMENTS_FICHE_MARQUE
    .map((e, i) => ({ e, ok: checks[i]! }))
    .filter((x) => !x.ok)
    .map((x) => ({ cle: x.e.cle, libelle: x.e.libelle, href: `/brands/${brandId}${DESTINATION_FICHE_MARQUE[x.e.cle]}` }));
  const faits = checks.filter(Boolean).length;
  return { score, faits, total: checks.length, manques, ficheHref: `/brands/${brandId}?tab=overview#profil` };
}

/* -------------------------------------------------------------------------- */
/*  Encart KPI · « Chiffres clés »                                            */
/* -------------------------------------------------------------------------- */

/**
 * Une source de dépense AGRÉGÉE, telle qu'elle serait lue si elle existait.
 * Aujourd'hui aucune : nous ne consolidons pas la dépense pub (pas de connecteur
 * publicitaire qui agrège Dépense / CPA / ROAS / Valeur d'achat). L'appelant
 * passe donc `null`, et l'encart se met en état vide honnête. Le type existe
 * pour le jour où une vraie source sera branchée, sans rien simuler d'ici là.
 */
export interface SourceDepenseJarvis {
  /** La plateforme d'où vient la dépense (« Meta », « TikTok »). */
  plateforme: string;
  /** La période mesurée, déjà formatée (« 14 derniers jours »). */
  periode: string;
  /** Les KPI réellement lus · chaque valeur est déjà formatée par l'appelant. */
  kpis: ReadonlyArray<{ cle: string; libelle: string; valeur: string }>;
}

export const LIEN_CONNEXIONS_KPI = '/connections';

/**
 * Les quatre indicateurs de la maquette · leurs LIBELLÉS seulement. Aucune
 * valeur n'est jamais fabriquée ici · tant qu'aucun connecteur publicitaire
 * n'agrège la dépense, les cartes sont des squelettes vides (voir l'encart).
 */
export const KPIS_JARVIS = [
  { cle: 'depense', libelle: 'Dépense' },
  { cle: 'cpa', libelle: 'CPA' },
  { cle: 'roas', libelle: 'ROAS' },
  { cle: 'valeur', libelle: 'Valeur d’achat' },
] as const;

export const PLATEFORME_KPI_DEFAUT = 'Meta Ads';
export const PERIODE_KPI_DEFAUT = '14 derniers jours';

/** La mention basse · dit honnêtement d'où VIENDRONT ces chiffres, sans en inventer. */
export const MENTION_KPI_PRODUCTION =
  'En production · ces chiffres seront lus depuis les comptes publicitaires connectés. Aucune source n’est branchée aujourd’hui.';

export type EncartKpiJarvis =
  | {
      etat: 'vide';
      titre: string;
      plateforme: string;
      periode: string;
      /** Les quatre cartes, LIBELLÉS seuls · aucune valeur (squelette honnête). */
      cartes: typeof KPIS_JARVIS;
      /** Pourquoi c'est vide · honnête, sans promettre un chiffre. */
      raison: string;
      lien: string;
      lienLibelle: string;
      mention: string;
    }
  | { etat: 'source'; titre: string; plateforme: string; periode: string; kpis: SourceDepenseJarvis['kpis'] };

/**
 * L'encart « Chiffres clés » · état VIDE tant qu'aucune source n'est lue, sinon
 * la source telle quelle. On ne fabrique jamais de chiffre : sans agrégation de
 * dépense, la présentation (4 cartes, légende, plateforme, période) est rendue
 * mais les valeurs restent vides, on nomme ce qui manque et on pointe vers
 * `/connections`.
 */
export function encartKpiJarvis(source: SourceDepenseJarvis | null): EncartKpiJarvis {
  if (!source || source.kpis.length === 0) {
    return {
      etat: 'vide',
      titre: 'Chiffres clés',
      plateforme: PLATEFORME_KPI_DEFAUT,
      periode: PERIODE_KPI_DEFAUT,
      cartes: KPIS_JARVIS,
      raison: 'La dépense pub n’est pas encore agrégée chez nous · aucun chiffre à montrer tant qu’une source n’est pas branchée.',
      lien: LIEN_CONNEXIONS_KPI,
      lienLibelle: 'Brancher une source',
      mention: MENTION_KPI_PRODUCTION,
    };
  }
  return { etat: 'source', titre: 'Chiffres clés', plateforme: source.plateforme, periode: source.periode, kpis: source.kpis };
}

/* -------------------------------------------------------------------------- */
/*  Lignes d'automatisation · toutes désactivées                             */
/* -------------------------------------------------------------------------- */

export interface AutomatisationJarvis {
  cle: 'iterations' | 'rapport' | 'nommage';
  titre: string;
  sous: string;
  icone: string;
  /** Le libellé de l'action de la maquette · rendu mais DÉSACTIVÉ. */
  action: string;
}

/**
 * Les trois lignes d'automatisation de la maquette, toutes DÉSACTIVÉES · le
 * service d'actions programmées n'existe pas encore (décision Kevin). On rend la
 * présentation fidèlement, mais aucun bouton n'engage quoi que ce soit · le
 * libellé commun `AUTOMATISATION_A_VENIR` le dit, et le rendu les pose `disabled`.
 */
export const AUTOMATISATIONS_JARVIS: readonly AutomatisationJarvis[] = [
  { cle: 'iterations', titre: 'Itérations de la semaine', sous: 'Chaque lundi, des variantes proposées à partir de tes meilleurs résultats', icone: 'sparkles', action: 'Activer' },
  { cle: 'rapport', titre: 'Rapport Jarvis', sous: 'Résumé hebdomadaire par email', icone: 'clock', action: 'Connecter' },
  { cle: 'nommage', titre: 'Convention de nommage', sous: 'Lire le nom de tes publicités pour en tirer des insights', icone: 'tag', action: 'Configurer' },
];

/** La note commune, dite une fois sous les lignes · pourquoi elles sont inertes. */
export const AUTOMATISATION_A_VENIR = 'À venir · les actions programmées arrivent, rien n’est encore branché.';
