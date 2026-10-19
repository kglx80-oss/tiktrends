/**
 * UX V5 · Jarvis en ONBOARDING · le compte neuf, sans marque, n'est plus un
 * cul-de-sac.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Sans marque active, Jarvis affichait un mur « Sélectionne une marque active »
 * · un cul-de-sac, puisqu'il n'y a précisément aucune marque à sélectionner. La
 * direction (référence « Flow ») veut au contraire que Jarvis reste VIVANT et
 * serve de GUIDE : un hero d'accroche, une vraie conversation, des amorces qui
 * guident le premier pas, et une action claire « Créer ta première marque »
 * (verbe CRÉER, jamais « choisir » une marque qui n'existe pas).
 *
 * Ce module est pur · il porte le TEXTE de ce guide : la consigne système
 * d'onboarding (générique, sans contexte de marque, orientée création), les
 * amorces, le titre, l'action primaire et les deux entrées vers de vraies
 * créations. Aucune donnée fabriquée · rien n'y prétend qu'une marque existe.
 */

/** L'action primaire · verbe CRÉER, vers le VRAI écran de création de marque. */
export const ACTION_PREMIERE_MARQUE = { label: 'Créer ta première marque', href: '/brands/new' } as const;

export const TITRE_ONBOARDING_JARVIS = 'On crée quoi ensemble ?';
export const SOUS_TITRE_ONBOARDING_JARVIS =
  'Crée ta première marque · je m’appuierai dessus pour trouver des créatives qui gagnent.';
export const PLACEHOLDER_ONBOARDING = 'Écris à Jarvis…';

export interface EntreeOnboarding {
  cle: string;
  titre: string;
  sous: string;
  /** Vers une VRAIE création / un vrai écran · jamais un faux. */
  href: string;
  icone: string;
}

/**
 * Les deux entrées du bas (façon maquette) · vers de VRAIES destinations. Sans
 * marque, « tes produits » n'existent pas encore · on guide donc vers la
 * création de la marque (d'où viendront les produits) et vers la Veille (où
 * s'observent les concurrents). Aucun chiffre, aucune liste inventée.
 */
export const ENTREES_ONBOARDING_JARVIS: readonly EntreeOnboarding[] = [
  { cle: 'marque', titre: 'Créer ta première marque', sous: 'Jarvis s’appuiera dessus · profil, produits, charte', href: '/brands/new', icone: 'store' },
  { cle: 'veille', titre: 'Explorer les concurrents', sous: 'La Veille observe ce que ton marché diffuse', href: '/veille', icone: 'radar' },
];

/**
 * Les amorces d'onboarding · elles guident le PREMIER pas (pas de contexte de
 * marque à interroger). Ce sont de vraies questions, envoyées au fil
 * d'onboarding réel.
 */
export function startersOnboarding(): string[] {
  return [
    'Par où je commence ?',
    'Aide-moi à définir ma première marque.',
    'Qu’est-ce que tu peux faire pour moi ?',
    'Montre-moi ce qu’on peut créer ensemble.',
  ];
}

/**
 * La consigne système d'onboarding · GÉNÉRIQUE, sans contexte de marque. Jarvis
 * n'y prétend pas être « la mémoire d'une marque » (il n'y en a pas) · il se
 * présente, explique ce qu'il fera une fois la marque créée, et guide vers la
 * création. Il n'invente aucun chiffre ni aucune marque.
 *
 * Pur · l'appelant passe le nom de l'espace (facultatif, pour tutoyer juste).
 */
export function consigneOnboardingJarvis(p: { espace?: string | null } = {}): string {
  const espace = p.espace?.trim();
  return [
    `Tu es Jarvis, le stratège créatif de cet outil. Tu parles français, au tutoiement.`,
    `CONTEXTE\nLa personne vient d’arriver${espace ? ` dans l’espace « ${espace} »` : ''} et n’a encore AUCUNE marque.`
    + `\nTu n’as donc aucun chiffre, aucune mémoire mesurée, aucun produit à citer. Ne fais SEMBLANT de rien.`,
    `CE QUE TU FAIS ICI\n`
    + `- Tu accueilles, tu expliques simplement ce que tu feras une fois une marque créée (analyser ses pubs,`
    + ` ses concurrents, proposer des créatives, mesurer ce qui gagne).\n`
    + `- Tu guides vers le PREMIER pas : créer sa première marque. Dis « créer », jamais « sélectionner » une`
    + ` marque qui n’existe pas.\n`
    + `- Tu peux aider à formuler ce que serait sa marque (produit, promesse, audience) pour préparer la création.`,
    `CE QUE TU NE FAIS PAS\n`
    + `- Tu n’inventes aucun chiffre, aucun résultat, aucune marque, aucun produit.\n`
    + `- Tu ne promets pas d’analyser des données qui n’existent pas encore · tu dis ce qu’il faut créer d’abord.\n`
    + `- Pas de conseil d’article de blog générique · reste concret sur le premier pas.`,
    `FORME\nRéponds court et chaleureux. Deux à cinq phrases. Termine souvent en orientant vers « Créer ta`
    + ` première marque ». Pas de listes à puces sauf si on t’en demande.`,
  ].join('\n\n---\n\n');
}
