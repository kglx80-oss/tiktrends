/**
 * UX V5 · les pastilles de catégories et les « Prompts <Catégorie> » de Jarvis.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * La maquette V5 pose, sous le composeur, une rangée de pastilles
 * (Stratégie · Angles · Accroches · Concurrents · Résultats · Créatif ·
 * Inspiration) et, dessous, trois cartes « Prompts <la catégorie active> ». Dans
 * la maquette ce sont des libellés figés. Pour les porter sans les simuler, la
 * règle vit ICI : chaque catégorie a ses VRAIES amorces, choisir une pastille
 * change réellement les trois cartes affichées, et cliquer une carte lance la
 * vraie conversation avec le prompt de l'amorce.
 *
 * Les amorces sont des affordances (des questions à poser), de même nature que
 * les `starters` du fil vide · elles n'affichent aucune donnée de marque, elles
 * ouvrent la conversation. Elles se règlent sur ce qui est MESURÉ : sans aucun
 * test, « Résultats » propose de mesurer plutôt que de lire des performances qui
 * n'existent pas (même prudence que `starters`).
 *
 * Pur · ni base, ni réseau, ni modèle.
 */

export type CategorieJarvis =
  | 'strategie' | 'angles' | 'accroches' | 'concurrents' | 'resultats' | 'creatif' | 'inspiration';

export interface MetaCategorieJarvis {
  cle: CategorieJarvis;
  libelle: string;
  /** Nom d'icône du jeu partagé `components/Icon`. */
  icone: string;
}

/** L'ordre de la maquette · la première est l'active par défaut. */
export const CATEGORIES_JARVIS: readonly MetaCategorieJarvis[] = [
  { cle: 'strategie', libelle: 'Stratégie', icone: 'target' },
  { cle: 'angles', libelle: 'Angles', icone: 'bulb' },
  { cle: 'accroches', libelle: 'Accroches', icone: 'pen' },
  { cle: 'concurrents', libelle: 'Concurrents', icone: 'radar' },
  { cle: 'resultats', libelle: 'Résultats', icone: 'chart' },
  { cle: 'creatif', libelle: 'Créatif', icone: 'spark' },
  { cle: 'inspiration', libelle: 'Inspiration', icone: 'star' },
];

export const CATEGORIE_JARVIS_DEFAUT: CategorieJarvis = 'strategie';

export interface AmorceCategorie {
  /** Le titre de la carte (court). */
  titre: string;
  /** La ligne explicative de la carte. */
  sous: string;
  /** Ce qui est RÉELLEMENT envoyé à Jarvis au clic · une vraie question. */
  prompt: string;
}

export interface ContexteAmorces {
  /** Combien de tests ont été mesurés · règle la prudence de « Résultats ». */
  measuredAds: number;
}

/**
 * Les trois amorces d'une catégorie, réglées sur le contexte. Toujours trois ·
 * la maquette montre trois cartes, et une rangée trouée se lit comme un bug.
 */
export function amorcesCategorie(cle: CategorieJarvis, ctx: ContexteAmorces): AmorceCategorie[] {
  const sansMesure = ctx.measuredAds === 0;
  switch (cle) {
    case 'strategie':
      return [
        { titre: 'Par où je commence ?', sous: 'Les 3 premières actions pour cette marque', prompt: 'Par où je commence avec cette marque ? Donne-moi les trois premières actions concrètes.' },
        { titre: 'Quel angle tester ensuite ?', sous: 'À partir de mes résultats et de ma marque', prompt: 'Quel angle devrais-je tester ensuite, à partir de ce que tu sais de ma marque et de mes résultats ?' },
        { titre: 'Plan créa du mois', sous: '4 semaines, étape par étape', prompt: 'Propose-moi un plan de création pour le mois, semaine par semaine, en t’appuyant sur ma marque.' },
      ];
    case 'angles':
      return [
        { titre: 'Des angles neufs', sous: 'Ceux que je n’ai pas encore essayés', prompt: 'Propose-moi des angles que je n’ai pas encore essayés pour cette marque.' },
        { titre: 'Un angle pour un produit', sous: 'Trois pistes à comparer', prompt: 'Donne-moi trois angles à comparer pour un de mes produits.' },
        { titre: 'Pourquoi cet angle ?', sous: 'Le désir et la promesse derrière', prompt: 'Explique-moi le désir et la promesse derrière l’angle que tu me recommandes en premier.' },
      ];
    case 'accroches':
      return [
        { titre: 'Trois accroches à tester', sous: 'Une seule variable à la fois', prompt: 'Écris-moi trois accroches à tester pour cette marque, en ne changeant qu’une seule variable à la fois.' },
        { titre: 'Mes accroches qui ont perdu', sous: 'Et ce qu’elles ont en commun', prompt: 'Quelles sont mes accroches qui ont perdu, et qu’est-ce qu’elles ont en commun ?' },
        { titre: 'Reformuler une accroche', sous: 'Même promesse, autre entrée', prompt: 'Aide-moi à reformuler une accroche : garde la promesse, change la façon d’entrer dedans.' },
      ];
    case 'concurrents':
      return [
        { titre: 'Qui examiner de près ?', sous: 'La marque à regarder en premier', prompt: 'Quelle marque concurrente veux-tu qu’on examine de près, et pourquoi ?' },
        { titre: 'Ce qu’ils diffusent', sous: 'Les mécaniques du marché', prompt: 'Qu’est-ce que mes concurrents diffusent en ce moment, et quelles mécaniques reviennent ?' },
        { titre: 'Ce qui tient longtemps', sous: 'Les accroches durables du marché', prompt: 'Quelles accroches tiennent longtemps chez mes concurrents ?' },
      ];
    case 'resultats':
      return sansMesure
        ? [
            { titre: 'De quoi tu as besoin ?', sous: 'Pour juger mes résultats', prompt: 'De quelles données as-tu besoin pour juger mes résultats ?' },
            { titre: 'Lire un test', sous: 'Savoir s’il a vraiment gagné', prompt: 'Comment lire un test pour savoir s’il a vraiment gagné ?' },
            { titre: 'Mesurer proprement', sous: 'Par où commencer', prompt: 'Par où commencer pour mesurer proprement mes campagnes ?' },
          ]
        : [
            { titre: 'Ce qui marche le mieux', sous: 'Et sur combien de tests', prompt: 'Qu’est-ce qui marche le mieux chez moi, et sur combien de tests ?' },
            { titre: 'La prochaine chose à tester', sous: 'À partir de mes résultats', prompt: 'Quelle est la prochaine chose que je devrais tester, à partir de mes résultats ?' },
            { titre: 'Où je me trompe', sous: 'Le plus souvent', prompt: 'Où est-ce que je me trompe le plus souvent, d’après mes tests ?' },
          ];
    case 'creatif':
      return [
        { titre: 'On crée quoi ensemble ?', sous: 'Un livrable concret à lancer', prompt: 'On crée quoi ensemble pour cette marque ? Propose un livrable concret.' },
        { titre: 'Préparer un test propre', sous: 'Une seule variable', prompt: 'Aide-moi à préparer un test propre, une seule variable à la fois.' },
        { titre: 'Décliner une gagnante', sous: 'Sans casser ce qui marche', prompt: 'Comment décliner une créa gagnante sans casser ce qui marche ?' },
      ];
    case 'inspiration':
      return [
        { titre: 'Trois pistes à tester', sous: 'À partir de ce que tu sais de moi', prompt: 'À partir de ce que tu sais de moi, donne-moi trois pistes à tester.' },
        { titre: 'Une idée hors de ma zone', sous: 'Un pas de côté assumé', prompt: 'Propose-moi une idée qui sort de ma zone habituelle, un pas de côté assumé mais défendable.' },
        { titre: 'Ce qui marche ailleurs', sous: 'Transposable à ma marque', prompt: 'Qu’est-ce qui marche dans d’autres marchés et qui serait transposable à ma marque ?' },
      ];
  }
}

/** La catégorie demandée si elle existe, sinon le défaut · aucune pastille inconnue n'ouvre un vide. */
export function categorieOuDefaut(cle: string | null | undefined): CategorieJarvis {
  return CATEGORIES_JARVIS.some((c) => c.cle === cle) ? (cle as CategorieJarvis) : CATEGORIE_JARVIS_DEFAUT;
}
