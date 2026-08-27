/**
 * ADSMAP · plafond de dépense IA de l'orchestrateur nocturne (addendum v2.1 · C2).
 *
 * Le problème que ça résout : l'orchestrateur appelle des agents la nuit, sans
 * personne devant l'écran. Sans plafond, une marque avec beaucoup d'ads non
 * taggées peut consommer un mois de budget en une nuit, et on l'apprend sur la
 * facture.
 *
 * Deux principes :
 *  1. **Les étapes déterministes passent toujours.** Recalcul des stats, kill
 *     rules, verdicts, contrôle de protocole, mapping : elles ne coûtent rien et
 *     ce sont elles qui portent la valeur du produit. Le budget ne gouverne que
 *     les appels IA.
 *  2. **Un appel refusé est signalé, jamais différé en silence.** Le budget qui
 *     s'épuise est une information pour l'utilisateur, pas un incident caché.
 *
 * Pur : la décision se prend ici, l'exécution ailleurs.
 */

export type AgentName = 'a0_tagger' | 'a1_research' | 'a2_concept' | 'a3_brief' | 'a4_analyst' | 'a5_iteration' | 'a6_coverage' | 'a7_prelaunch' | 'a8_report';

export interface AiBudget {
  monthlyCapEur: number;
  nightlyCapEur: number;
  softWarnRatio: number;      // bandeau d'alerte à cette fraction du plafond mensuel
  spentMonthEur: number;
  spentNightEur: number;
  paused: boolean;            // arrêt manuel
}

export const DEFAULT_AI_BUDGET: Omit<AiBudget, 'spentMonthEur' | 'spentNightEur'> = {
  monthlyCapEur: 40,
  nightlyCapEur: 3,
  softWarnRatio: 0.8,
  paused: false,
};

/**
 * Ordre de consommation du budget (C2.2 §3).
 *
 * Il n'est pas arbitraire : on paie d'abord ce qui fait économiser de l'argent
 * (comprendre pourquoi une ad brûle du budget), puis ce qui en fait gagner
 * (itérer un gagnant), et en dernier ce qui enrichit la mémoire.
 */
export const AGENT_PRIORITY: readonly string[] = [
  'a4_kill',        // A4 sur les ads marquées à couper · le plus urgent
  'a4_winner',      // A4 sur les nouveaux gagnants
  'a4_loser',       // A4 sur les nouveaux perdants
  'a5_iteration',   // A5 sur les gagnants sans itération proposée
  'a0_tagger',      // A0 sur les assets non taggés
  'a6_coverage',    // A6 hebdomadaire
  'a7_prelaunch',   // A7 sur les concepts sans score
];

export interface PlannedCall {
  key: string;               // clé d'ordre · doit figurer dans AGENT_PRIORITY
  agent: AgentName;
  /** Ce sur quoi porte l'appel (ad, concept, asset) · sert à l'idempotence. */
  targetId: string;
  /** Empreinte de l'état ayant motivé l'appel · si elle n'a pas changé, on ne rejoue pas. */
  stateHash: string;
  estimatedEur: number;
  label: string;             // affiché dans le DecisionItem
}

export interface SkippedCall extends PlannedCall { reason: 'nightly_cap' | 'monthly_cap' | 'paused' | 'already_done' }

export interface BudgetPlan {
  run: PlannedCall[];
  skipped: SkippedCall[];
  estimatedTotalEur: number;
  /** Vrai quand la dépense du mois franchit `softWarnRatio` · bandeau, pas blocage. */
  softWarning: boolean;
  /** Une seule décision est créée à la fin du run, pas une par appel refusé. */
  needsDecisionItem: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Décide quels appels IA l'orchestrateur exécute cette nuit.
 *
 * `alreadyDone` porte les empreintes d'état déjà traitées : c'est l'idempotence
 * du C2.2 §6. Deux nuits de suite sur le même verdict ne relancent pas A4.
 */
export function planAiCalls(
  budget: AiBudget,
  calls: PlannedCall[],
  alreadyDone: ReadonlySet<string> = new Set(),
): BudgetPlan {
  const rank = (c: PlannedCall) => {
    const i = AGENT_PRIORITY.indexOf(c.key);
    return i === -1 ? AGENT_PRIORITY.length : i;   // clé inconnue : en dernier
  };
  const ordre = [...calls].sort((a, b) => rank(a) - rank(b));

  const run: PlannedCall[] = [];
  const skipped: SkippedCall[] = [];
  let nuit = budget.spentNightEur;
  let mois = budget.spentMonthEur;

  for (const c of ordre) {
    const empreinte = `${c.agent}:${c.targetId}:${c.stateHash}`;
    if (alreadyDone.has(empreinte)) {
      // Rien n'a changé depuis le dernier passage : ni appel, ni alerte.
      skipped.push({ ...c, reason: 'already_done' });
      continue;
    }
    if (budget.paused) { skipped.push({ ...c, reason: 'paused' }); continue; }
    if (nuit + c.estimatedEur > budget.nightlyCapEur) { skipped.push({ ...c, reason: 'nightly_cap' }); continue; }
    if (mois + c.estimatedEur > budget.monthlyCapEur) { skipped.push({ ...c, reason: 'monthly_cap' }); continue; }
    run.push(c);
    nuit += c.estimatedEur;
    mois += c.estimatedEur;
  }

  // Un appel déjà traité n'est pas un manque de budget : il ne déclenche rien.
  const bloquants = skipped.filter((s) => s.reason !== 'already_done');

  return {
    run,
    skipped,
    estimatedTotalEur: round2(run.reduce((a, c) => a + c.estimatedEur, 0)),
    softWarning: budget.monthlyCapEur > 0 && mois >= budget.softWarnRatio * budget.monthlyCapEur,
    needsDecisionItem: bloquants.length > 0,
  };
}

/**
 * Résumé affichable du plan · alimente le `DecisionItem AI_BUDGET_REACHED` et le
 * mode `dry_run`, qui montre ce que l'orchestrateur ferait sans rien exécuter.
 */
export function summarizePlan(plan: BudgetPlan, budget: AiBudget): string {
  const bloquants = plan.skipped.filter((s) => s.reason !== 'already_done');
  if (budget.paused && bloquants.length) {
    return `Analyses IA en pause : ${bloquants.length} appel(s) non exécuté(s). Rien n'a été débité.`;
  }
  if (!bloquants.length) {
    return plan.run.length
      ? `${plan.run.length} analyse(s) prévue(s) pour environ ${plan.estimatedTotalEur.toLocaleString('fr-FR')} €.`
      : 'Rien de nouveau à analyser cette nuit.';
  }
  const cap = bloquants.some((s) => s.reason === 'monthly_cap') ? 'mensuel' : 'de la nuit';
  const manque = round2(bloquants.reduce((a, c) => a + c.estimatedEur, 0));
  return `Plafond ${cap} atteint : ${plan.run.length} analyse(s) faite(s), ${bloquants.length} reportée(s) `
    + `(environ ${manque.toLocaleString('fr-FR')} € nécessaires). Les verdicts et les alertes, eux, sont à jour.`;
}
