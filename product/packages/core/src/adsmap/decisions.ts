/**
 * ADSMAP · file de décisions (§10).
 *
 * Le module produit maintenant beaucoup : des verdicts, des contrôles de
 * protocole, un graphe avec ses branches mortes. Le risque n'est plus de manquer
 * d'information, c'est d'en avoir trop · une table de trois cents lignes lue tous
 * les matins finit par n'être plus lue du tout.
 *
 * Cette file répond à une seule question : **qu'est-ce que je dois décider
 * aujourd'hui ?** Elle ne montre donc pas un état, elle propose des gestes.
 *
 * Trois règles gouvernent le fichier :
 *
 *  1. **Chaque décision dit ce qu'elle coûte, pas ce qu'elle est.** « Verdict à
 *     arbitrer » n'est pas une raison d'ouvrir l'outil ; « 340 € dépensés dont
 *     personne n'a rien appris » en est une.
 *  2. **L'ordre suit l'argent, pas la chronologie.** Une ad qui brûle du budget
 *     passe avant un angle jamais décliné, quelle que soit son ancienneté.
 *  3. **On plafonne par type.** Trente décisions du même genre ne sont pas
 *     trente décisions, c'est une seule · le reste est du bruit qui repousse
 *     les autres hors de l'écran.
 *
 * Pur : ni base, ni horloge. Les dates arrivent en paramètre.
 */

export type DecisionType =
  | 'kill_suggested' | 'validate_verdict' | 'accept_iteration' | 'unmapped_ad'
  | 'protocol_violation' | 'prelaunch_warning' | 'coverage_gap';

export interface Decision {
  type: DecisionType;
  /** Ce sur quoi porte la décision · sert l'idempotence et le lien vers l'écran. */
  targetId: string;
  targetKind: 'ad' | 'batch' | 'angle' | 'desire' | 'concept';
  /** 1 = de l'argent brûle maintenant. */
  priority: 1 | 2 | 3 | 4;
  /** Ce qui se joue, en euros · tri secondaire, et argument principal. */
  spendAtStake: number | null;
  /** Une phrase qui dit le coût, pas l'étiquette. */
  title: string;
  /** Le geste attendu, à l'impératif · une décision sans suite n'en est pas une. */
  action: string;
}

/* -------------------------------------------------------------------------- */
/*  Entrées                                                                   */
/* -------------------------------------------------------------------------- */

export interface DecisionAd {
  id: string;
  label: string;              // « v2 · Listicle 3 erreurs »
  status: string;
  verdict: string | null;
  verdictStatus: string | null;   // 'computed' | 'validated' | null
  killFlag: string | null;
  spend: number | null;
  /** Vrai si l'ad est reliée à une annonce de la régie · sinon elle n'est pas mesurée. */
  matched: boolean;
  /** Vrai si au moins une itération part de cette ad. */
  hasIteration: boolean;
  daysSinceLaunch: number | null;
}

export interface DecisionBatch {
  id: string;
  number: number;
  status: string;
  compliant: boolean | null;
  protocolSummary: string | null;
  /** Budget engagé sur le lot · ce que coûte le fait de ne rien corriger. */
  spend: number | null;
  /** Vrai si le budget prévu ne permettra pas de conclure. */
  underfunded: boolean;
}

export interface DecisionGap {
  nodeId: string;
  kind: 'desire' | 'angle' | 'concept';
  label: string;
}

export interface DecisionInput {
  ads: DecisionAd[];
  batches: DecisionBatch[];
  gaps: DecisionGap[];
  /** Fenêtre d'évaluation de la marque · sert à savoir si un verdict a mûri. */
  evaluationWindowDays: number;
}

/** Au-delà, un type sature l'écran et repousse les autres · on garde les plus chers. */
const CAP_PAR_TYPE: Record<DecisionType, number> = {
  kill_suggested: 8,
  unmapped_ad: 5,
  validate_verdict: 8,
  protocol_violation: 3,
  prelaunch_warning: 3,
  accept_iteration: 5,
  coverage_gap: 4,
};

const KILL_LABEL: Record<string, string> = {
  hook: 'personne ne regarde au-delà des premières secondes',
  click: 'le trafic ne se déclenche pas',
  convert: 'le trafic arrive mais n’achète pas',
  cost: 'le coût par achat dépasse la limite',
};

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);
const NON_CONCLUANTS = new Set(['inconclusive', 'insufficient_delivery']);

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

/* -------------------------------------------------------------------------- */
/*  Construction                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Compose la file du jour.
 *
 * L'ordre des blocs suit l'ordre des priorités, mais c'est le tri final qui fait
 * foi : on trie par priorité, puis par argent en jeu décroissant. Deux décisions
 * de même urgence ne se départagent pas au hasard.
 */
export function buildDecisions(input: DecisionInput): Decision[] {
  const out: Decision[] = [];

  for (const a of input.ads) {
    // 1 · L'argent qui brûle maintenant. C'est la seule catégorie où attendre
    // coûte quelque chose à chaque heure qui passe.
    if (a.killFlag && (a.status === 'live' || a.status === 'paused')) {
      const cause = KILL_LABEL[a.killFlag] ?? 'les signaux sont mauvais';
      // K3 est à part : la créa fonctionne, c'est la page qui ne convertit pas ·
      // suggérer de couper ferait jeter une créa qui marche.
      const couper = a.killFlag !== 'convert';
      out.push({
        type: 'kill_suggested', targetId: a.id, targetKind: 'ad', priority: 1,
        spendAtStake: a.spend,
        title: a.spend
          ? `${a.label} · ${eur(a.spend)} dépensés et ${cause}.`
          : `${a.label} · ${cause}.`,
        action: couper
          ? 'Coupe l’ad, ou dis pourquoi tu la gardes.'
          : 'Ne coupe pas la créa · c’est la page ou l’offre qu’il faut reprendre.',
      });
      continue;
    }

    // 2 · Une ad en test que la mesure ne voit pas. Le budget part, et rien ne
    // reviendra · c'est la panne la plus silencieuse du module.
    if (a.status === 'live' && !a.matched) {
      out.push({
        type: 'unmapped_ad', targetId: a.id, targetKind: 'ad', priority: 2,
        spendAtStake: a.spend,
        title: `${a.label} tourne sans être reliée à une annonce du compte · elle dépense sans rien mesurer.`,
        action: 'Vérifie le nom de l’annonce côté régie, ou colle son identifiant Meta.',
      });
      continue;
    }

    // 3 · Un verdict calculé que personne n'a arbitré : le test est payé, son
    // enseignement ne l'est pas encore.
    if (a.verdict && a.verdictStatus === 'computed' && !NON_CONCLUANTS.has(a.verdict)) {
      const mur = a.daysSinceLaunch === null || a.daysSinceLaunch >= input.evaluationWindowDays;
      if (mur) {
        out.push({
          type: 'validate_verdict', targetId: a.id, targetKind: 'ad', priority: 2,
          spendAtStake: a.spend,
          title: a.spend
            ? `${a.label} · ${eur(a.spend)} dépensés, verdict prêt, aucun apprentissage retiré.`
            : `${a.label} · verdict prêt, aucun apprentissage retiré.`,
          action: 'Arbitre le test et écris ce qu’il t’apprend.',
        });
      }
      continue;
    }

    // 4 · Une gagnante arbitrée dont rien n'est sorti · le gisement le moins cher
    // du compte, et il dort.
    if (a.verdict && GAGNANTS.has(a.verdict) && a.verdictStatus === 'validated' && !a.hasIteration) {
      out.push({
        type: 'accept_iteration', targetId: a.id, targetKind: 'ad', priority: 3,
        spendAtStake: a.spend,
        title: `${a.label} a gagné et n’a jamais été itérée · repartir d’elle coûte moins cher que tout le reste.`,
        action: 'Ouvre Suites · la variable à changer et ce qu’il faut geler y sont déjà calculés.',
      });
    }
  }

  for (const b of input.batches) {
    // Le protocole ne se corrige qu'en cours de test · après, il est trop tard
    // et les verdicts du lot resteront relatifs pour toujours.
    if (b.status === 'testing' && b.compliant === false) {
      out.push({
        type: 'protocol_violation', targetId: b.id, targetKind: 'batch', priority: 2,
        spendAtStake: b.spend,
        title: `Lot ${b.number} · ${b.protocolSummary ?? 'le protocole n’est pas respecté'}${b.spend ? ` (${eur(b.spend)} engagés)` : ''}.`,
        action: 'Corrige la structure maintenant · après le test, les verdicts resteront relatifs.',
      });
    }
    // Un lot sous-financé dépensera tout puis rendra « non concluant ».
    if ((b.status === 'planned' || b.status === 'ready') && b.underfunded) {
      out.push({
        type: 'prelaunch_warning', targetId: b.id, targetKind: 'batch', priority: 3,
        spendAtStake: b.spend,
        title: `Lot ${b.number} · le budget prévu ne permettra pas de conclure sur le CPA.`,
        action: 'Monte le budget par ad, ou allonge la fenêtre, avant de lancer.',
      });
    }
  }

  for (const g of input.gaps) {
    const quoi = g.kind === 'desire'
      ? 'désir jamais attaqué · aucun angle ne s’y rattache'
      : g.kind === 'angle'
        ? 'angle jamais décliné · aucun concept n’en est sorti'
        : 'concept écrit mais jamais produit · le travail d’idéation est déjà payé';
    out.push({
      type: 'coverage_gap', targetId: g.nodeId, targetKind: g.kind, priority: 4,
      spendAtStake: null,
      title: `${g.label} · ${quoi}.`,
      action: g.kind === 'concept' ? 'Produis-le, ou archive-le.' : 'Décline-le, ou assume de le laisser de côté.',
    });
  }

  return capAndSort(out);
}

/**
 * Trie et plafonne.
 *
 * Le plafond s'applique APRÈS le tri par argent : quand un type déborde, on garde
 * les décisions les plus chères, pas les premières venues.
 */
function capAndSort(items: Decision[]): Decision[] {
  const trie = [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.spendAtStake ?? -1) - (a.spendAtStake ?? -1);
  });

  const compte = new Map<DecisionType, number>();
  const gardees: Decision[] = [];
  for (const d of trie) {
    const n = (compte.get(d.type) ?? 0) + 1;
    if (n > CAP_PAR_TYPE[d.type]) continue;
    compte.set(d.type, n);
    gardees.push(d);
  }
  return gardees;
}

/**
 * Une phrase pour l'entête de la file.
 *
 * Elle nomme le montant en jeu quand il y en a un : c'est le seul argument qui
 * fait ouvrir une file de tâches un lundi matin.
 */
export function summarizeDecisions(items: Decision[]): string {
  if (!items.length) return 'Rien à décider · tout ce qui a été testé a été arbitré, et rien ne brûle.';

  const urgent = items.filter((d) => d.priority === 1);
  const enJeu = items.reduce((s, d) => s + (d.spendAtStake ?? 0), 0);

  if (urgent.length) {
    const brule = urgent.reduce((s, d) => s + (d.spendAtStake ?? 0), 0);
    return brule > 0
      ? `${urgent.length} ad(s) brûlent du budget · ${eur(brule)} déjà dépensés. Commence par là.`
      : `${urgent.length} ad(s) à couper. Commence par là.`;
  }
  return enJeu > 0
    ? `${items.length} décision(s) en attente · ${eur(enJeu)} de tests dont rien n’a encore été tiré.`
    : `${items.length} décision(s) en attente.`;
}
