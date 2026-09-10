/**
 * Le chemin, de rien jusqu'à une créa gagnante.
 *
 * ── Ce qui existait, et pourquoi ça ne suffisait plus ────────────────────────
 *
 * Une liste de quatre cases : créer la marque, connecter une source, ajouter des
 * assets, générer une créa. Elle mène à une première image et **abandonne
 * exactement là où la valeur du produit commence** · pas un mot sur la carte,
 * les lots, la mesure, l'arbitrage, la mémoire.
 *
 * ── Un parcours est un GRAPHE, pas une liste ─────────────────────────────────
 *
 * Les quatre cases s'affichaient à égalité, comme si l'ordre était libre. Il ne
 * l'est pas : **connecter Meta avant d'avoir un lot en ligne ne sert à rien** ·
 * on branche un compte publicitaire pour mesurer quelque chose, et s'il n'y a
 * rien à mesurer, l'étape est faite pour rien et paraît inutile.
 *
 * Chaque étape déclare donc ce qu'elle exige. Une étape bloquée dit **par quoi**
 * elle est bloquée, au lieu d'être grisée sans explication.
 *
 * ── Une seule prochaine action ───────────────────────────────────────────────
 *
 * Une liste de huit cases ouvertes est un mur, et un mur se contourne en
 * fermant l'encart. On montre le chemin entier — c'est lui qui dit où l'on va —
 * mais on n'en désigne **qu'une** comme la suivante.
 *
 * ── L'ordre vise le premier test MESURÉ, pas la complétude ───────────────────
 *
 * On pourrait ranger par complétude de la fiche marque. On range par plus court
 * chemin jusqu'à un verdict · c'est le premier moment où l'outil rend quelque
 * chose que l'utilisateur n'avait pas avant.
 *
 * Pur : ni base, ni réseau.
 */

export type StepStatus = 'done' | 'now' | 'blocked';

export interface StepDef {
  key: string;
  label: string;
  /** Ce que l'étape DÉBLOQUE · pas ce qu'elle demande. On avance vers, pas pour. */
  why: string;
  href: string;
  /** Clés exigées avant de pouvoir la faire. */
  needs: string[];
  /**
   * Améliore le résultat sans conditionner la suite.
   * Les mêler aux étapes bloquantes ferait croire qu'on ne peut pas avancer
   * sans elles · c'est faux, et ça décourage.
   */
  optional?: boolean;
  /**
   * L'écran de l'étape est réservé aux administrateurs de l'espace.
   *
   * Sans cette information, le parcours désignait « Créer ta marque » comme
   * prochaine action à un simple membre · le clic partait sur `/brands/new`,
   * qui renvoie les non-admins au tableau de bord · une boucle. On ne propose
   * pas à quelqu'un une porte qu'on lui fermera au visage.
   */
  adminOnly?: boolean;
}

/**
 * Le chemin.
 *
 * L'ordre est celui des dépendances, et il porte une décision : **Meta se
 * connecte APRÈS le premier lot**, pas au démarrage. C'est contre-intuitif pour
 * qui range par configuration, et évident pour qui range par utilité.
 */
export const STEPS: StepDef[] = [
  {
    key: 'brand', label: 'Créer ta marque', needs: [], adminOnly: true,
    why: 'Tout le produit travaille marque par marque · c’est le premier objet à poser.',
    href: '/brands/new',
  },
  {
    key: 'identity', label: 'Renseigner la marque', needs: ['brand'], adminOnly: true,
    why: 'Direction artistique, promesse, au moins un produit · sans eux, Jarvis génère du générique.',
    href: '/brands',
  },
  {
    key: 'generate', label: 'Générer une première créa', needs: ['identity'],
    why: 'Le premier résultat visible · c’est aussi ce qui alimentera la carte.',
    href: '/studio/ads',
  },
  {
    key: 'map', label: 'Poser la carte', needs: ['brand'], adminOnly: true,
    why: 'Avatar → désir → angle → concept → ad. C’est elle qui rend un résultat attribuable à une cause.',
    href: '/adsmap/import',
  },
  {
    key: 'batch', label: 'Ouvrir un lot de test', needs: ['map'], adminOnly: true,
    why: 'Un lot rend les ads comparables entre elles · sans lui, chaque test se juge seul et ne dit rien.',
    href: '/adsmap/lots',
  },
  {
    // Après le lot, et c'est le point de tout ce fichier.
    key: 'meta', label: 'Connecter Meta', needs: ['batch'], adminOnly: true,
    why: 'Pour faire remonter les chiffres du lot · le connecter avant d’avoir quelque chose à mesurer ne sert à rien.',
    href: '/connections',
  },
  {
    key: 'verdict', label: 'Arbitrer un premier verdict', needs: ['meta'],
    why: 'Un test payé dont on ne retire rien est un budget dépensé pour rien · c’est ici que l’outil commence à rendre.',
    href: '/adsmap',
  },
  {
    key: 'memory', label: 'Jarvis sait quelque chose sur toi', needs: ['verdict'],
    why: 'Trois verdicts sur une même dimension et sa mémoire s’allume · à partir de là, chaque génération en profite.',
    href: '/jarvis',
  },

  // ── Utiles à tout moment, bloquantes pour rien ────────────────────────────
  {
    key: 'prompt', label: 'Enregistrer ta première scène', needs: ['brand'], optional: true,
    why: 'Ta direction artistique, réutilisable · et mesurée, ce qu’aucun générateur d’images ne fait.',
    href: '/studio/image',
  },
  {
    key: 'competitors', label: 'Suivre des concurrents', needs: [], optional: true,
    why: 'La veille nourrit Jarvis en mécaniques éprouvées · et arme le radar.',
    href: '/veille',
  },
];

/* -------------------------------------------------------------------------- */

export interface JourneyStep extends StepDef {
  status: StepStatus;
  /** Libellé de l'étape qui bloque · vide quand rien ne bloque. */
  blockedBy: string | null;
  /**
   * Bloquée non par une dépendance manquante, mais parce que son écran est
   * réservé aux admins et que le lecteur n'en est pas un · l'explication
   * change (« réservé à un admin » plutôt que « après telle étape »).
   */
  lockedByRole: boolean;
}

/** Ce que le lecteur a le droit de faire · défaut : tout (compat rétro). */
export interface JourneyView {
  /** Le lecteur administre l'espace (peut créer marques, brancher, importer). */
  canAdmin?: boolean;
}

export interface Journey {
  steps: JourneyStep[];
  /** L'unique prochaine action · `null` quand le chemin bloquant est terminé. */
  next: JourneyStep | null;
  doneCount: number;
  /** Dénominateur honnête · les étapes facultatives n'entrent pas dans la progression. */
  totalRequired: number;
  complete: boolean;
  summary: string;
}

/**
 * Situe l'utilisateur sur le chemin.
 *
 * `done` porte les clés déjà acquises · le calcul de ces clés appartient à
 * l'application, ce fichier ne sait pas lire une base.
 */
export function journey(done: ReadonlySet<string>, view: JourneyView = {}): Journey {
  const canAdmin = view.canAdmin ?? true;
  const parCle = new Map(STEPS.map((s) => [s.key, s]));

  const steps: JourneyStep[] = STEPS.map((s) => {
    if (done.has(s.key)) return { ...s, status: 'done', blockedBy: null, lockedByRole: false };
    const manque = s.needs.find((n) => !done.has(n));
    if (manque) {
      return { ...s, status: 'blocked', blockedBy: parCle.get(manque)?.label ?? manque, lockedByRole: false };
    }
    // Dépendances satisfaites · reste le verrou de rôle. Un écran admin proposé
    // à un membre l'enverrait sur une redirection · on le bloque ICI, avec sa
    // propre raison, plutôt que de le laisser cliquer dans le vide.
    if (s.adminOnly && !canAdmin) {
      return { ...s, status: 'blocked', blockedBy: null, lockedByRole: true };
    }
    return { ...s, status: 'now', blockedBy: null, lockedByRole: false };
  });

  const requises = steps.filter((s) => !s.optional);
  const faites = requises.filter((s) => s.status === 'done').length;
  const complete = faites === requises.length;

  // La prochaine action est la première étape BLOQUANTE ouverte · une étape
  // facultative ne doit jamais être présentée comme la marche à suivre, sinon
  // on envoie quelqu'un régler un détail au lieu d'avancer. Les étapes
  // verrouillées par le rôle sont « blocked » · elles ne peuvent donc pas être
  // désignées ici, exactement ce qu'on veut pour un membre.
  const next = steps.find((s) => !s.optional && s.status === 'now') ?? null;
  // Un membre qui ne peut encore rien faire d'utile · la mise en route revient
  // à un admin. On le distingue du « tout est terminé » (next null car complet).
  const enAttenteAdmin = !complete && next === null && steps.some((s) => s.lockedByRole);

  return {
    steps, next, doneCount: faites, totalRequired: requises.length, complete,
    summary: resume(faites, requises.length, next, complete, enAttenteAdmin),
  };
}

function resume(faites: number, total: number, next: JourneyStep | null, complete: boolean, enAttenteAdmin: boolean): string {
  if (complete) {
    return 'Le circuit complet est en place · tu génères, tu testes, tu mesures, et Jarvis apprend de chaque verdict.';
  }
  // Le membre sans droits d'admin · la porte suivante lui est fermée, on le dit
  // plutôt que de lui tendre un bouton qui boucle.
  if (enAttenteAdmin) {
    return 'La mise en route de l’espace revient à un administrateur · dès qu’une marque et un produit seront en place, tu pourras générer.';
  }
  if (faites === 0) {
    return 'Rien n’est encore posé. Huit étapes séparent un compte vide d’une créa dont on sait qu’elle a gagné.';
  }
  const reste = total - faites;
  return next
    ? `${faites} étape(s) sur ${total} · il en reste ${reste} avant que Jarvis apprenne de tes propres tests.`
    : `${faites} étape(s) sur ${total}.`;
}

/**
 * Une relance douce quand une étape de VALEUR traîne.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Le `JourneyPanel` montre toujours la même prochaine étape, du même ton, que
 * ce soit le premier jour ou le quinzième. Or le moment qui décide qu'un compte
 * vit ou meurt est un seul · la PREMIÈRE créa générée. Une marque créée puis
 * laissée sans une seule génération, c'est le décrochage type · le compte a
 * franchi la porte et s'est arrêté sur le seuil.
 *
 * On relance à un palier de valeur, et seulement après un délai · une relance le
 * jour même agace, elle n'encourage pas. Le seuil est une CADENCE produit (on
 * laisse respirer, puis on tend la main), pas un seuil technique mesurable · on
 * l'assume tel quel.
 *
 * ── Deux décrochages, deux moments ───────────────────────────────────────────
 *
 * - `generate` · une marque posée puis laissée sans une seule créa · le compte a
 *   franchi la porte et s'est arrêté sur le seuil. Le message retire l'excuse la
 *   plus fréquente · « je n'ai pas de brief prêt ».
 * - `map` · des créas générées mais jamais testées. Générer ne dit pas laquelle
 *   gagne · c'est le test qui tranche, et c'est là que la boucle du produit paie.
 *   Un compte qui génère sans tester n'a pas encore touché la valeur.
 *
 * Chaque palier a SON horloge · le premier compte depuis la marque, le second
 * depuis la dernière génération · relancer « teste tes créas » quelqu'un qui
 * vient de générer serait aussi faux que le relancer le jour de son inscription.
 */
export interface Relance {
  /** L'étape relancée · sert de clé de rendu et de test. */
  cle: string;
  titre: string;
  corps: string;
}

/** Ce qui date chaque décrochage · null quand la donnée manque (donc pas de relance). */
export interface RelanceContexte {
  /** Jours depuis la création de la marque · horloge du palier « générer ». */
  joursDepuisMarque: number | null;
  /** Jours depuis la dernière génération · horloge du palier « tester ». */
  joursDepuisGeneration: number | null;
}

/** On laisse ce nombre de jours avant de relancer · en dessous, rien. */
export const RELANCE_SEUIL_JOURS = 2;

export function relance(j: Journey, ctx: RelanceContexte): Relance | null {
  const cle = j.next?.key;

  if (cle === 'generate') {
    const d = ctx.joursDepuisMarque;
    if (d == null || d < RELANCE_SEUIL_JOURS) return null;
    return {
      cle: 'generate',
      titre: 'Ta marque est prête · il ne manque que ta première pub',
      corps:
        'Deux minutes suffisent · pas besoin d’un brief parfait, l’assistant part de ta marque et te propose des angles. Tu ajustes ensuite.',
    };
  }

  if (cle === 'map') {
    // « map » n'est ouverte qu'après avoir généré · si rien n'a été généré,
    // `joursDepuisGeneration` est null et on ne relance pas (ce serait le palier
    // précédent). On ne pousse ici que celui qui a généré et laissé dormir.
    const d = ctx.joursDepuisGeneration;
    if (d == null || d < RELANCE_SEUIL_JOURS) return null;
    return {
      cle: 'map',
      titre: 'Tes créas attendent d’être testées',
      corps:
        'Générer ne dit pas encore laquelle gagne · c’est le test qui tranche. Pose-les sur la carte et ouvre un lot · c’est là que la boucle commence à payer.',
    };
  }

  return null;
}

/**
 * Ce qui manque pour que la prochaine étape devienne faisable.
 *
 * Sert à répondre « pourquoi je ne peux pas encore connecter Meta ? » sans
 * obliger à reconstituer la chaîne de tête.
 */
export function whyBlocked(key: string, done: ReadonlySet<string>): string[] {
  const parCle = new Map(STEPS.map((s) => [s.key, s]));
  const cible = parCle.get(key);
  if (!cible) return [];

  const manquants: string[] = [];
  const vus = new Set<string>();
  const pile = [...cible.needs];
  while (pile.length) {
    const k = pile.pop()!;
    if (vus.has(k) || done.has(k)) continue;
    vus.add(k);
    const s = parCle.get(k);
    if (!s) continue;
    manquants.push(s.label);
    pile.push(...s.needs);
  }
  // Du plus profond au plus proche · c'est l'ordre dans lequel on les fera.
  return manquants.reverse();
}
