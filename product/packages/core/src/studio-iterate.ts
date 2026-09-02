/**
 * Décliner une publicité SANS relancer un lot.
 *
 * ── Ce qu'on ne pouvait pas faire ────────────────────────────────────────────
 *
 * On génère quatre publicités. Une plaît à moitié · son accroche porte, sa
 * scène tombe à côté. La seule manœuvre offerte était de relancer un lot entier
 * et de repayer quatre images, dont trois qu'on n'a pas demandées.
 *
 * Le résultat n'est pas seulement cher, il est inexploitable : le nouveau lot
 * change TOUT à la fois, donc quand la mesure arrive, plus personne ne sait à
 * quoi attribuer l'écart. On paie pour apprendre, et on n'apprend rien.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * **Une déclinaison change exactement UNE chose et tient tout le reste.** C'est
 * la définition d'une itération, et c'est ce qui rend l'écart attribuable.
 *
 * Le fichier n'énumère donc pas des variantes possibles · il écrit, pour chaque
 * variable, ce qui est TENU. Et `verifieDeclinaison` le fait respecter : une
 * déclinaison qui n'a rien changé, ou qui a changé deux choses, est refusée
 * avant d'être facturée.
 *
 * ── Deux d'entre elles ne coûtent rien ───────────────────────────────────────
 *
 * La mise en page et l'accroche se rejouent sur la MÊME scène · la composition
 * est un calcul, pas un achat. Changer la mise en page d'une publicité déjà
 * générée coûte donc zéro crédit, là où il fallait repayer quatre images.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import { AD_LAYOUTS, type AdLayout } from './ad-layouts';
import { layoutFitsCopy } from './copy-budget';

/** Ce qu'on peut changer, une seule à la fois. */
export const STUDIO_VARIABLES = ['accroche', 'offre', 'mise_en_page', 'scene', 'univers'] as const;
export type StudioVariable = typeof STUDIO_VARIABLES[number];

/**
 * Celles qu'on sait faire aujourd'hui.
 *
 * `scene` et `univers` demandent le brief d'origine de la scène pour en
 * produire une autre du même concept · les recettes ne le portaient pas. Il y
 * est consigné depuis, mais les publicités déjà produites n'en ont pas, et
 * proposer une action qui échoue sur la moitié de la bibliothèque serait pire
 * que de ne pas la proposer.
 *
 * Les trois retenues ont un point commun qui n'est pas un hasard : **elles
 * réutilisent la scène déjà payée.** C'est exactement ce que « décliner sans
 * repayer le lot » veut dire.
 */
export const DECLINAISONS_DISPONIBLES: readonly StudioVariable[] = ['accroche', 'offre', 'mise_en_page'];

/**
 * Ce qu'on peut décliner POUR CETTE publicité-là.
 *
 * `scene` et `univers` produisent une autre image du MÊME concept · il leur
 * faut donc le brief d'origine de la scène. Il est consigné depuis, mais les
 * publicités produites avant ne le portent pas, et rien ne permet de le
 * reconstruire : redemander au modèle d'inventer le brief qu'il avait déjà
 * écrit donnerait une autre scène d'un autre concept, c'est-à-dire une créa de
 * plus, pas une déclinaison.
 *
 * On les propose donc quand elles sont faisables, et on dit pourquoi quand
 * elles ne le sont pas · un bouton absent laisse croire que la fonction
 * n'existe pas, un bouton grisé qui s'explique se comprend.
 */
export function declinaisonsPour(aUnBrief: boolean): readonly StudioVariable[] {
  return aUnBrief ? STUDIO_VARIABLES : DECLINAISONS_DISPONIBLES;
}

/** Pourquoi une déclinaison est hors de portée · vide quand elle est possible. */
export function empechement(v: StudioVariable, aUnBrief: boolean): string {
  if (aUnBrief || reutiliseScene(v)) return '';
  return 'Cette publicité a été produite avant que le brief de sa scène soit consigné · les suivantes pourront l’être.';
}

/**
 * L'ambiance suivante · jamais celle qu'on quitte.
 *
 * Même règle que pour les coquilles : on avance dans la liste au lieu de tirer
 * au sort, pour que deux clics parcourent les ambiances plutôt que de retomber
 * sur la même.
 */
export function universSuivant(actuel: string | null | undefined, cles: readonly string[]): string | null {
  const dispo = cles.filter((k) => k && k !== 'auto');
  if (!dispo.length) return null;
  const i = actuel ? dispo.indexOf(actuel) : -1;
  if (i < 0) return dispo[0] ?? null;
  if (dispo.length === 1) return null;
  return dispo[(i + 1) % dispo.length] ?? null;
}

export const STUDIO_LABEL: Record<StudioVariable, string> = {
  accroche: 'L’accroche',
  offre: 'L’offre',
  mise_en_page: 'La mise en page',
  scene: 'La scène',
  univers: 'L’ambiance',
};

/** Ce que la variable répond · pas ce qu'elle change, ce qu'elle cherche à savoir. */
export const STUDIO_HINT: Record<StudioVariable, string> = {
  accroche: 'La scène tient, les mots ne portent pas. On réécrit, on garde l’image.',
  offre: 'Tout tient, mais rien ne pousse à agir. On change la promesse et le bouton.',
  mise_en_page: 'Le contenu est bon, la composition l’enterre. Même image, autre coquille.',
  scene: 'Les mots portent, l’image tombe à côté. On regénère la scène, on garde la copie.',
  univers: 'La composition marche, l’ambiance ne ressemble pas à la marque.',
};

/**
 * La scène est-elle réutilisée ?
 *
 * Tout le reste en découle · le prix, le délai, et le fait qu'une déclinaison
 * de mise en page soit immédiate là où une nouvelle scène demande une minute.
 */
export function reutiliseScene(v: StudioVariable): boolean {
  return v === 'accroche' || v === 'offre' || v === 'mise_en_page';
}

/** Une déclinaison demande-t-elle au modèle de réécrire quelque chose ? */
export function demandeUnTexte(v: StudioVariable): boolean {
  return v === 'accroche' || v === 'offre';
}

/**
 * Le prix, en crédits.
 *
 * `creditsTexte` est le coût d'une courte demande au modèle, `creditsImage`
 * celui du moteur choisi · les deux viennent de l'appelant pour que ce fichier
 * n'ait pas à connaître la grille tarifaire.
 */
export function prixDeclinaison(v: StudioVariable, creditsImage: number, creditsTexte: number): number {
  if (v === 'mise_en_page') return 0;
  if (demandeUnTexte(v)) return creditsTexte;
  return creditsImage;
}

/* -------------------------------------------------------------------------- */
/*  Le contrat : ce qui change, ce qui est tenu                                */
/* -------------------------------------------------------------------------- */

/** Les champs qu'une comparaison regarde · le reste ne distingue pas deux créas. */
export interface DeclinaisonSnapshot {
  headline: string;
  cta: string;
  subhead?: string | null;
  kicker?: string | null;
  badge?: string | null;
  sceneUrl: string;
  layout: AdLayout;
  universe?: string | null;
}

/** Ce qui DOIT bouger, en clair · sert autant à l'écran qu'au contrôle. */
export const CHANGE: Record<StudioVariable, string> = {
  accroche: 'l’accroche',
  offre: 'le bouton ou la pastille d’offre',
  mise_en_page: 'la mise en page',
  scene: 'la scène',
  univers: 'la scène et son ambiance',
};

/** Ce qui est TENU · le contrat, écrit, montrable à l'écran. */
export function tenuConstant(v: StudioVariable): string[] {
  switch (v) {
    case 'accroche': return ['la scène', 'la mise en page', 'le bouton', 'l’ambiance'];
    case 'offre': return ['la scène', 'la mise en page', 'l’accroche', 'l’ambiance'];
    case 'mise_en_page': return ['la scène', 'tous les textes', 'l’ambiance'];
    case 'scene': return ['tous les textes', 'la mise en page', 'l’ambiance'];
    case 'univers': return ['tous les textes', 'la mise en page'];
  }
}

const memeTexte = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * Une déclinaison est-elle bien ce qu'elle prétend être ?
 *
 * ── Pourquoi ce contrôle existe ──────────────────────────────────────────────
 *
 * Un modèle à qui on demande une autre accroche rend parfois la même, à la
 * ponctuation près. Sans ce contrôle, on facture une copie et on l'ajoute à la
 * comparaison comme si c'était une variante · le lot se remplit de doublons qui
 * diluent la mesure au lieu de l'affiner.
 *
 * Et l'inverse compte autant : une déclinaison qui change DEUX choses n'est plus
 * attribuable. Elle a l'air d'un progrès et ne prouve rien.
 */
export function verifieDeclinaison(
  parent: DeclinaisonSnapshot,
  enfant: DeclinaisonSnapshot,
  v: StudioVariable,
): { ok: true } | { ok: false; probleme: string } {
  const bouge = {
    accroche: !memeTexte(parent.headline, enfant.headline),
    // L'offre vit dans le bouton ET dans la pastille · changer l'un des deux
    // suffit, exiger les deux refuserait une déclinaison légitime.
    offre: !memeTexte(parent.cta, enfant.cta) || !memeTexte(parent.badge, enfant.badge),
    mise_en_page: parent.layout !== enfant.layout,
    scene: parent.sceneUrl !== enfant.sceneUrl,
    univers: parent.sceneUrl !== enfant.sceneUrl && !memeTexte(parent.universe, enfant.universe),
  }[v];

  if (!bouge) return { ok: false, probleme: `${CHANGE[v]} n’a pas changé · ce n’est pas une déclinaison, c’est une copie.` };

  // Ce qui devait être tenu et ne l'a pas été. On nomme le premier écart · en
  // lister quatre n'aide personne à comprendre lequel a cassé le contrat.
  const doitTenir: Array<[boolean, string]> = [
    [v !== 'accroche' && !memeTexte(parent.headline, enfant.headline), 'l’accroche'],
    [!demandeUnTexte(v) && !memeTexte(parent.cta, enfant.cta), 'le bouton'],
    [v !== 'mise_en_page' && parent.layout !== enfant.layout, 'la mise en page'],
    [reutiliseScene(v) && parent.sceneUrl !== enfant.sceneUrl, 'la scène'],
    [v !== 'univers' && !memeTexte(parent.universe, enfant.universe), 'l’ambiance'],
  ];
  const casse = doitTenir.find(([mauvais]) => mauvais);
  if (casse) return { ok: false, probleme: `${casse[1]} devait être tenue et a changé · l’écart ne serait attribuable à rien.` };

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  La mise en page suivante                                                   */
/* -------------------------------------------------------------------------- */

/**
 * La coquille suivante · jamais celle qu'on quitte.
 *
 * On avance dans l'ordre du vivier plutôt que de tirer au sort : deux clics de
 * suite doivent parcourir les mises en page, pas retomber sur la même. Les
 * coquilles trop étroites pour l'accroche sont écartées AVANT le choix · une
 * accroche trop longue ne se coupe pas, elle change de mise en page (§budget de
 * copie), et proposer « affiche » pour la voir se rabattre sur « immersif »
 * ferait une déclinaison qui ne décline rien.
 *
 * `null` quand il ne reste rien · une accroche très longue ne tient que dans
 * l'immersive, et le dire vaut mieux que rendre la même coquille.
 */
export function miseSuivante(
  actuelle: AdLayout,
  headline: string,
  vivier: readonly AdLayout[] = AD_LAYOUTS,
): AdLayout | null {
  const possibles = vivier.filter((l) => l !== actuelle && layoutFitsCopy(headline, l));
  if (!possibles.length) return null;
  // On repart de la position de l'actuelle dans le vivier complet · le
  // parcours reste stable quel que soit le filtrage.
  const depart = AD_LAYOUTS.indexOf(actuelle);
  for (let k = 1; k <= AD_LAYOUTS.length; k++) {
    const cand = AD_LAYOUTS[(depart + k) % AD_LAYOUTS.length]!;
    if (possibles.includes(cand)) return cand;
  }
  return possibles[0]!;
}

/* -------------------------------------------------------------------------- */
/*  La lignée                                                                  */
/* -------------------------------------------------------------------------- */

/** Un maillon · l'ad, ce qu'on y a changé, et de qui elle descend. */
export interface Maillon {
  id: string;
  parentId?: string | null;
  variable?: StudioVariable | null;
}

/**
 * La lignée d'une publicité, de la racine jusqu'à elle.
 *
 * Une déclinaison sans son ascendance ne dit rien · « accroche v3 » n'a de sens
 * qu'en face de v2 et v1. Le parcours est borné : une donnée abîmée ne doit pas
 * faire tourner une boucle indéfiniment.
 */
export function lignee(id: string, maillons: readonly Maillon[]): Maillon[] {
  const par = new Map(maillons.map((m) => [m.id, m]));
  const out: Maillon[] = [];
  const vus = new Set<string>();
  let cur = par.get(id);
  while (cur && !vus.has(cur.id) && out.length < 32) {
    vus.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? par.get(cur.parentId) : undefined;
  }
  return out;
}

/** À quelle génération on en est · 1 pour une originale. */
export function rang(id: string, maillons: readonly Maillon[]): number {
  return Math.max(1, lignee(id, maillons).length);
}
