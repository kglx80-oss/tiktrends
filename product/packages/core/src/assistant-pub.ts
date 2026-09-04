/**
 * Une décision à la fois.
 *
 * ── Ce qu'on a construit sans s'en rendre compte ─────────────────────────────
 *
 * Le composeur a grossi réglage par réglage, et chacun se justifiait seul : le
 * produit, l'angle, l'offre, la persona, l'objectif, les gabarits, la mise en
 * page, l'ambiance, le nombre, le moteur, la fabrication, ce que le lot teste.
 * Onze décisions sur une seule barre, toutes visibles en même temps, aucune
 * ordonnée.
 *
 * Le verdict reçu tient en trois mots : « c'est incompréhensible ». Il est juste.
 * Personne ne prend onze décisions de front · on en prend une, puis la suivante.
 *
 * ── Ce que ce fichier décide, et ce qu'il ne décide pas ──────────────────────
 *
 * Il dit **l'ordre**, **ce qui rend une étape complète**, et **ce qui manque**
 * quand elle ne l'est pas. Rien d'autre · pas de couleur, pas de fenêtre, pas de
 * bouton.
 *
 * C'est volontaire. La règle « on ne passe pas à la suite tant que ce n'est pas
 * fait » vit dans une fonction pure qu'un test peut exercer, pas dans une
 * condition d'affichage qu'on découvre cassée en cliquant.
 *
 * ── L'ordre n'est pas arbitraire ─────────────────────────────────────────────
 *
 * Il suit ce qui CONTRAINT le reste. Le produit d'abord, parce que sa photo
 * décide si la fidélité est garantie. Le message ensuite, parce qu'il décide de
 * la copie. Le style après, parce qu'il s'applique à un message déjà écrit. La
 * fabrication et le volume en dernier, parce qu'ils ne changent rien à ce qu'on
 * dit · seulement à comment et combien.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export const ETAPES = ['produit', 'message', 'style', 'fabrication', 'volume'] as const;
export type Etape = typeof ETAPES[number];

export const ETAPE_TITRE: Record<Etape, string> = {
  produit: 'Le produit',
  message: 'Ce que la pub doit dire',
  style: 'Le style',
  fabrication: 'Comment on la fabrique',
  volume: 'Combien, et avec quel moteur',
};

/** Ce que l'étape décide · affiché sous son titre, pour situer. */
export const ETAPE_ROLE: Record<Etape, string> = {
  produit: 'Ce qu’on met en scène, et la photo qui garantit sa fidélité.',
  message: 'L’angle et l’offre · c’est ce que Jarvis écrira.',
  style: 'La direction artistique · cadrage, lumière, typographie.',
  fabrication: 'Textes posés par nous, ou publicité produite entière.',
  volume: 'Le nombre de visuels et le moteur qui les produit.',
};

/** L'état du formulaire, réduit à ce qui décide de l'avancement. */
export interface EtatAssistant {
  /** Produit choisi · vide quand la marque n'en a pas ou qu'on n'en veut pas. */
  productId: string;
  /** Le produit choisi a-t-il au moins une photo. */
  aPhotoProduit: boolean;
  /** La marque a-t-elle des produits · sans eux, l'étape se franchit à vide. */
  aDesProduits: boolean;
  /** L'angle décrit à la main. */
  angle: string;
  /** L'offre affichée. */
  offre: string;
  /** Gabarits cochés · au moins un est exigé côté serveur. */
  gabarits: readonly string[];
  /** Direction artistique · vide vaut « variées ». */
  direction: string;
  /** Mode de fabrication. */
  mode: string;
  /** Nombre de visuels. */
  nombre: number;
  /** Moteur d'image. */
  moteur: string;
}

/**
 * Ce qui manque à une étape · vide quand elle est complète.
 *
 * On rend une PHRASE, pas un booléen. Un « Suivant » grisé sans raison est
 * exactement le défaut qu'on vient de corriger sur le bouton de génération ·
 * le refaire une étape plus haut serait apprendre à l'envers.
 */
export function manque(e: Etape, s: EtatAssistant): string {
  switch (e) {
    case 'produit':
      // Sans produit dans la marque, l'étape n'a rien à demander · l'exiger
      // bloquerait une marque neuve sur son premier écran.
      if (!s.aDesProduits) return '';
      if (!s.productId) return 'Choisis le produit à mettre en scène.';
      return '';
    case 'message':
      // Le serveur exige au moins un gabarit · l'angle, lui, est facultatif,
      // et le rester : Jarvis sait écrire sans qu'on lui dicte l'angle.
      if (!s.gabarits.length) return 'Coche au moins un type de pub.';
      return '';
    case 'style':
      // « Variées » est un choix légitime · il n'y a rien à exiger ici.
      return '';
    case 'fabrication':
      if (!s.mode) return 'Choisis comment la pub est fabriquée.';
      return '';
    case 'volume':
      if (!s.moteur) return 'Choisis un moteur d’image.';
      if (!Number.isFinite(s.nombre) || s.nombre < 1) return 'Indique combien de visuels générer.';
      return '';
  }
}

export function etapeComplete(e: Etape, s: EtatAssistant): boolean {
  return manque(e, s) === '';
}

/** L'index d'une étape · sert à savoir ce qui précède. */
export function rangEtape(e: Etape): number {
  return ETAPES.indexOf(e);
}

/**
 * Peut-on afficher cette étape ?
 *
 * Toutes celles d'avant doivent être complètes. C'est la règle demandée · on ne
 * saute pas une décision en espérant y revenir, parce qu'on n'y revient pas.
 */
export function etapeAccessible(e: Etape, s: EtatAssistant): boolean {
  return ETAPES.slice(0, rangEtape(e)).every((p) => etapeComplete(p, s));
}

/** La première étape qui n'est pas faite · `null` quand tout l'est. */
export function premiereIncomplete(s: EtatAssistant): Etape | null {
  return ETAPES.find((e) => !etapeComplete(e, s)) ?? null;
}

/**
 * Peut-on lancer la génération ?
 *
 * Toutes les étapes, sans exception. Le bouton final ne doit jamais être le
 * premier endroit où l'on découvre qu'il manque quelque chose.
 */
export function peutGenerer(s: EtatAssistant): boolean {
  return premiereIncomplete(s) === null;
}

/**
 * L'étape suivante · `null` quand on est à la dernière.
 *
 * Ne saute pas les étapes déjà complètes : on avance d'un cran, même si le cran
 * suivant est déjà rempli. Sauter par-dessus une étape valide priverait de la
 * relire, et c'est souvent là qu'on corrige.
 */
export function etapeSuivante(e: Etape): Etape | null {
  return ETAPES[rangEtape(e) + 1] ?? null;
}

export function etapePrecedente(e: Etape): Etape | null {
  const i = rangEtape(e);
  return i > 0 ? ETAPES[i - 1]! : null;
}

/* -------------------------------------------------------------------------- */
/*  Le récapitulatif                                                           */
/* -------------------------------------------------------------------------- */

export interface LigneRecap { etape: Etape; titre: string; valeur: string }

/**
 * Ce qu'on s'apprête à lancer, relu avant de payer.
 *
 * Un assistant qui fait défiler cinq écrans et lance sans montrer le total
 * remplace onze décisions simultanées par cinq décisions oubliées.
 */
export function recapitulatif(s: EtatAssistant, libelles: {
  produit?: string; direction?: string; mode?: string; moteur?: string;
}): LigneRecap[] {
  return [
    { etape: 'produit', titre: ETAPE_TITRE.produit, valeur: libelles.produit || (s.aDesProduits ? 'Aucun' : 'La marque n’a pas de produit') },
    {
      etape: 'message', titre: ETAPE_TITRE.message,
      valeur: [
        `${s.gabarits.length} type(s) de pub`,
        s.angle.trim() ? `angle : ${s.angle.trim().slice(0, 60)}` : 'angle libre',
        s.offre.trim() ? `offre : ${s.offre.trim().slice(0, 40)}` : '',
      ].filter(Boolean).join(' · '),
    },
    { etape: 'style', titre: ETAPE_TITRE.style, valeur: libelles.direction || 'Variées' },
    { etape: 'fabrication', titre: ETAPE_TITRE.fabrication, valeur: libelles.mode || s.mode },
    { etape: 'volume', titre: ETAPE_TITRE.volume, valeur: `${s.nombre} visuel(s) · ${libelles.moteur || s.moteur}` },
  ];
}

/**
 * Combien de temps ça va prendre, dit avant de cliquer.
 *
 * Le vrai rapport reçu était « le bouton ne fonctionne pas ». Il fonctionnait :
 * il affichait « Génération… » depuis plusieurs minutes, sur un moteur qui
 * travaille jusqu'à cinq minutes par image, et rien ne le disait.
 *
 * On rend une fourchette honnête, pas une promesse · les images partent par
 * groupes de trois, et un moteur lent reste lent.
 */
export function dureeAttendue(nombre: number, timeoutMsParImage: number, parallele = 3): string {
  const n = Math.max(1, Math.floor(nombre));
  const vagues = Math.ceil(n / Math.max(1, parallele));
  const maxMin = Math.ceil((vagues * timeoutMsParImage) / 60_000);
  if (maxMin <= 1) return 'moins d’une minute';
  if (maxMin <= 2) return 'une à deux minutes';
  return `jusqu’à ${maxMin} minutes`;
}
