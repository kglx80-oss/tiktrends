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
    key: 'brand', label: 'Créer ta marque', needs: [],
    why: 'Tout le produit travaille marque par marque · c’est le premier objet à poser.',
    href: '/brands/new',
  },
  {
    key: 'identity', label: 'Renseigner la marque', needs: ['brand'],
    why: 'Direction artistique, promesse, au moins un produit · sans eux, Jarvis génère du générique.',
    href: '/brands',
  },
  {
    key: 'generate', label: 'Générer une première créa', needs: ['identity'],
    why: 'Le premier résultat visible · c’est aussi ce qui alimentera la carte.',
    href: '/studio/ads',
  },
  {
    key: 'map', label: 'Poser la carte', needs: ['brand'],
    why: 'Avatar → désir → angle → concept → ad. C’est elle qui rend un résultat attribuable à une cause.',
    href: '/adsmap/import',
  },
  {
    key: 'batch', label: 'Ouvrir un lot de test', needs: ['map'],
    why: 'Un lot rend les ads comparables entre elles · sans lui, chaque test se juge seul et ne dit rien.',
    href: '/adsmap/lots',
  },
  {
    // Après le lot, et c'est le point de tout ce fichier.
    key: 'meta', label: 'Connecter Meta', needs: ['batch'],
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
    key: 'prompt', label: 'Écrire ton propre prompt', needs: ['brand'], optional: true,
    why: 'Ta direction artistique, réutilisable · et mesurée, ce qu’aucun générateur d’images ne fait.',
    href: '/studio/prompts',
  },
  {
    key: 'competitors', label: 'Suivre des concurrents', needs: [], optional: true,
    why: 'La veille nourrit Jarvis en mécaniques éprouvées · et arme le radar.',
    href: '/inspo',
  },
];

/* -------------------------------------------------------------------------- */

export interface JourneyStep extends StepDef {
  status: StepStatus;
  /** Libellé de l'étape qui bloque · vide quand rien ne bloque. */
  blockedBy: string | null;
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
export function journey(done: ReadonlySet<string>): Journey {
  const parCle = new Map(STEPS.map((s) => [s.key, s]));

  const steps: JourneyStep[] = STEPS.map((s) => {
    if (done.has(s.key)) return { ...s, status: 'done', blockedBy: null };
    const manque = s.needs.find((n) => !done.has(n));
    return manque
      ? { ...s, status: 'blocked', blockedBy: parCle.get(manque)?.label ?? manque }
      : { ...s, status: 'now', blockedBy: null };
  });

  const requises = steps.filter((s) => !s.optional);
  const faites = requises.filter((s) => s.status === 'done').length;
  const complete = faites === requises.length;

  // La prochaine action est la première étape BLOQUANTE ouverte · une étape
  // facultative ne doit jamais être présentée comme la marche à suivre, sinon
  // on envoie quelqu'un régler un détail au lieu d'avancer.
  const next = steps.find((s) => !s.optional && s.status === 'now') ?? null;

  return {
    steps, next, doneCount: faites, totalRequired: requises.length, complete,
    summary: resume(faites, requises.length, next, complete),
  };
}

function resume(faites: number, total: number, next: JourneyStep | null, complete: boolean): string {
  if (complete) {
    return 'Le circuit complet est en place · tu génères, tu testes, tu mesures, et Jarvis apprend de chaque verdict.';
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
