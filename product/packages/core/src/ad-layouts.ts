/**
 * La mise en page d'une pub · indépendante de son gabarit.
 *
 * ── Pourquoi toutes les créas se ressemblaient ───────────────────────────────
 *
 * Sept gabarits, une seule composition. Chacun décidait QUELS champs
 * s'affichaient — une note en étoiles, une liste à puces, un gros chiffre — mais
 * tous rendaient la même chose : photo plein cadre, dégradé noir en bas, texte
 * blanc, pastille de couleur.
 *
 * Changer le contenu d'un bandeau ne change pas une publicité. Vues dans une
 * grille, sept « gabarits » donnaient sept fois la même image.
 *
 * Et le texte n'était jamais DANS le visuel · il était posé PAR-DESSUS, dans une
 * bande sombre qui recouvrait une photo dont on avait payé la génération. D'où
 * l'impression, juste, qu'il n'y a « aucun copy sur le visuel » : le copy ne
 * participe pas à l'image, il la masque.
 *
 * ── Ce que la mise en page décide ────────────────────────────────────────────
 *
 * Où va l'image, ce qu'il y a derrière, et sur quel fond se lit le texte. C'est
 * orthogonal au gabarit : un témoignage peut être immersif ou en affiche, et les
 * deux restent un témoignage.
 *
 * Quatre mises en page pour sept gabarits donnent vingt-huit rendus à partir de
 * onze morceaux de code · c'est tout l'intérêt de les séparer.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export const AD_LAYOUTS = ['immersif', 'champ', 'split', 'affiche'] as const;
export type AdLayout = typeof AD_LAYOUTS[number];

export const LAYOUT_LABEL: Record<AdLayout, string> = {
  immersif: 'Immersif',
  champ: 'Champ de couleur',
  split: 'Moitié / moitié',
  affiche: 'Affiche claire',
};

export const LAYOUT_HINT: Record<AdLayout, string> = {
  immersif: 'La photo occupe tout · le texte se pose dessus, en bas.',
  champ: 'Aplat de couleur, la photo dans une carte · le texte respire à côté.',
  split: 'La photo en haut, un aplat en bas · frontière nette.',
  affiche: 'Fond clair, texte sombre et très gros · la photo devient un élément.',
};

/** Vrai quand le texte se lit sur clair · décide de la couleur d'encre. */
export const LAYOUT_CLAIR: Record<AdLayout, boolean> = {
  immersif: false,
  champ: false,
  split: false,
  affiche: true,
};

/**
 * Les mises en page qu'un gabarit supporte.
 *
 * Deux contraintes réelles, et pas une de plus · une restriction inventée
 * réduirait la variété qu'on essaie justement de créer.
 *
 * - **`before_after`** montre deux états côte à côte. Il lui faut l'image
 *   entière pour poser sa frontière · une photo réduite à une carte ne montre
 *   plus la comparaison, elle la suggère.
 * - **`ugc`** imite un contenu de créateur. Une affiche typographique ne
 *   ressemble à rien de ce qu'un créateur publie · elle trahirait exactement ce
 *   que le gabarit cherche à emprunter.
 */
const INTERDITS: Record<string, AdLayout[]> = {
  before_after: ['champ', 'affiche'],
  ugc: ['affiche'],
};

export function layoutsFor(template: string): AdLayout[] {
  const hors = new Set(INTERDITS[template] ?? []);
  return AD_LAYOUTS.filter((l) => !hors.has(l));
}

/** Rabat une mise en page sur la plus proche que le gabarit accepte. */
export function layoutFor(template: string, wanted: AdLayout): AdLayout {
  const ok = layoutsFor(template);
  return ok.includes(wanted) ? wanted : ok[0]!;
}

/**
 * Les mises en page d'un lot.
 *
 * ── La règle qui répond au constat ───────────────────────────────────────────
 *
 * **Aucune mise en page ne se répète tant que toutes n'ont pas servi.** Un tirage
 * au hasard donnerait deux fois la même sur un lot de quatre une fois sur deux,
 * et l'impression de « toujours le même résultat » survivrait au travail fait
 * pour la dissiper.
 *
 * On distribue donc par tours complets. `seed` décale le point de départ pour
 * que deux lots successifs ne s'ouvrent pas sur la même image.
 */
export function layoutsForBatch(n: number, seed = 0, pool: readonly AdLayout[] = AD_LAYOUTS): AdLayout[] {
  const out: AdLayout[] = [];
  // Un vivier vidé par les exclusions rendrait la rotation impossible · on
  // revient au catalogue complet plutôt que de ne rien produire.
  const dispo = pool.length ? pool : AD_LAYOUTS;
  const total = dispo.length;
  const depart = ((Math.trunc(seed) % total) + total) % total;
  for (let i = 0; i < Math.max(0, n); i++) out.push(dispo[(depart + i) % total]!);
  return out;
}

/**
 * Les mises en page à retirer de la rotation, pour cette marque.
 *
 * ── Le geste qui manquait au bout de la mesure ───────────────────────────────
 *
 * Mesurer qu'une mise en page perd et continuer à la servir une fois sur quatre,
 * c'est produire un rapport que personne n'applique. La rotation doit apprendre.
 *
 * ── Trois freins, parce qu'un retrait est difficile à défaire ────────────────
 *
 * Une mise en page retirée ne produit plus de tests, donc ne peut plus se
 * racheter · elle sort du corpus qui la jugerait. Le seuil est donc sévère :
 *
 * - **assez de matière** · au moins `minN` tests conclus sur cette mise en page,
 *   sinon on retire sur une anecdote ;
 * - **nettement en dessous** · pas « un peu moins bien », mais sous une fraction
 *   du taux de la marque · deux taux voisins ne se départagent pas ;
 * - **jamais la dernière** · on garde toujours au moins deux mises en page en
 *   lice, sinon le lot redevient quatre fois la même image, ce que toute cette
 *   mécanique existe pour éviter.
 */
export function layoutsToDrop(input: {
  /** Taux mesuré par mise en page · `null` quand rien n'est concluant. */
  rates: Array<{ layout: string; nConclusive: number; hitRate: number | null }>;
  /** Taux de la marque, toutes mises en page confondues. */
  globalRate: number | null;
  minN?: number;
  /** Sous quelle fraction du taux de la marque on retire · 0.5 = deux fois moins bon. */
  ratio?: number;
}): AdLayout[] {
  const { globalRate } = input;
  if (globalRate === null || globalRate <= 0) return [];
  const minN = input.minN ?? 6;
  const seuil = globalRate * (input.ratio ?? 0.5);

  const mauvaises = input.rates
    .filter((r) => (AD_LAYOUTS as readonly string[]).includes(r.layout))
    .filter((r) => r.nConclusive >= minN && r.hitRate !== null && r.hitRate < seuil)
    .map((r) => r.layout as AdLayout);

  // Jamais la dernière · on garde au moins deux mises en page en lice.
  const restant = AD_LAYOUTS.length - mauvaises.length;
  if (restant >= 2) return mauvaises;

  // Trop d'exclusions : on ne garde que les pires, dans l'ordre du catalogue,
  // pour que le résultat ne dépende pas de l'ordre des lignes reçues.
  const parTaux = [...mauvaises].sort((a, b) => AD_LAYOUTS.indexOf(a) - AD_LAYOUTS.indexOf(b));
  return parTaux.slice(0, Math.max(0, AD_LAYOUTS.length - 2));
}
