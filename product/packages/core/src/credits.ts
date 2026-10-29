/**
 * Crédits & ledger (CDC §F14). Report 25 %.
 *
 * Barème en NOUVELLE unité (÷ 10 · décision du 29/10, point 3) · chaque valeur
 * vaut exactement dix fois l'ancienne, et les soldes sont convertis ×10
 * (`offre/unite.ts`) · le pouvoir d'achat d'un espace ne bouge pas (garde
 * `offre-unite.test.ts`). Le barème recalibré (V2) vit dans `offre/bareme.ts`.
 */
export type CreditAction =
  | 'tag_video' | 'tag_image' | 'transcription_min' | 'script' | 'brief'
  | 'image' | 'review_mining' | 'report' | 'clone_image' | 'chat' | 'video' | 'suggest' | 'score'
  | 'asset_analysis' | 'map_proposal';

export const CREDIT_COSTS: Record<CreditAction, number> = {
  tag_video: 20, tag_image: 10, transcription_min: 10, script: 30, brief: 50,
  image: 40, review_mining: 200, report: 60, clone_image: 50, chat: 10, video: 200,
  suggest: 10, // suggestion IA courte (angle, brief image/vidéo)
  score: 20,   // Score Jarvis (évaluation performance d'une créa)
  // Analyse d'asset ADSMAP (agent A0) : un appel vision court, sur une frame et
  // une transcription. Facturé comme un tag vidéo · c'est le même ordre de coût.
  asset_analysis: 20,
  // Proposition de carte (agents A1-A3) : un appel de génération structurée par
  // lot de propositions. Même ordre qu'un brief · c'est le même travail.
  map_proposal: 50,
};

/**
 * Le nom à l'écran de chaque action facturée. Typé sur `CreditAction` · une
 * action ajoutée sans libellé ne compile pas. L'écran Crédits affichait la clé
 * brute (« chat », « asset_analysis ») pour six actions sur quinze (lot 8).
 */
export const LIBELLE_ACTION_CREDIT: Record<CreditAction, string> = {
  tag_video: 'Tag vidéo (IA)', tag_image: 'Tag image (IA)', transcription_min: 'Transcription (par min)',
  script: 'Script vidéo', brief: 'Brief créatif', image: 'Génération image', review_mining: 'Analyse d’avis',
  report: 'Rapport', clone_image: 'Clone de pub', chat: 'Assistant (message)', video: 'Vidéo IA',
  suggest: 'Suggestion IA', score: 'Score Jarvis', asset_analysis: 'Analyse d’asset (Adsmap)',
  map_proposal: 'Propositions de carte (Adsmap)',
};

export function costFor(action: CreditAction, units = 1): number {
  return CREDIT_COSTS[action] * Math.max(1, Math.ceil(units));
}
export function canAfford(balance: number, action: CreditAction, units = 1): boolean {
  return balance >= costFor(action, units);
}
export interface LedgerEntry { delta: number; reason: string; refId?: string; }
export function applyLedger(balance: number, entries: LedgerEntry[]): number {
  return entries.reduce((b, e) => b + e.delta, balance);
}
/** Report partiel : 25 % des crédits non utilisés en fin de cycle. */
export function computeRollover(unused: number): number {
  return Math.floor(Math.max(0, unused) * 0.25);
}

/* ============ Allocation d'abonnement ============ */

export interface PlanAllocation {
  next: number;       // nouveau solde
  delta: number;      // mouvement à écrire au grand livre (peut être négatif)
  purchased: number;  // crédits hors abonnement (recharges, essai, dons) conservés
}

/**
 * Nouveau solde après application de l'allocation d'une formule.
 *
 * Les crédits d'abonnement NE SE CUMULENT PAS d'un mois sur l'autre, mais les
 * recharges payées, si. Poser bêtement `solde = allocation` détruisait donc les
 * recharges à chaque renouvellement · un client ayant acheté 5 000 crédits en plus
 * de son offre les perdait le mois suivant.
 *
 * `planRemaining` est ce qui RESTE de la poche d'abonnement du cycle (voir
 * `pocheAbonnement`), pas l'allocation accordée : ce qui dépasse dans le solde,
 * ce sont les crédits hors abonnement, conservés tels quels. Le défaut corrigé
 * (audit crédits du 29/10, incohérence 6) : on passait l'allocation ACCORDÉE,
 * si bien que la consommation du mois était retirée des crédits achetés.
 *
 * Sert au renouvellement Stripe, au changement de formule et au pilotage interne.
 */
export function applyPlanAllocation(balance: number, planRemaining: number, alloc: number): PlanAllocation {
  const bal = Math.max(0, balance || 0);
  const purchased = Math.max(0, bal - Math.max(0, planRemaining || 0));
  const next = purchased + Math.max(0, alloc || 0);
  return { next, delta: next - bal, purchased };
}

/* ============ Les deux poches d'un solde ============ */

/**
 * Un solde se lit en deux poches :
 *  · la poche d'ABONNEMENT · ce qui reste de l'allocation du cycle. Elle expire
 *    au renouvellement (remplacée par la nouvelle allocation) ;
 *  · la poche HORS ABONNEMENT · tout le reste : recharges payées, et, comme
 *    avant cette règle, crédits d'essai et dons du fondateur. Elle n'expire
 *    jamais et l'allocation n'y touche pas.
 *
 * Ordre de débit · la poche d'abonnement d'abord (elle expire), la poche hors
 * abonnement ensuite. Un remboursement rend dans l'ordre INVERSE : d'abord ce qui
 * a été pris hors abonnement depuis l'allocation, puis l'abonnement. Rendre tout
 * à la poche hors abonnement permettrait de changer des crédits d'abonnement en
 * crédits permanents (réserver puis annuler) ; tout rendre à l'abonnement ferait
 * expirer des crédits achetés.
 *
 * Miroir SQL (atomique, sans lecture préalable) : `packages/db/src/poches-credits.ts`.
 * Une garde sur base réelle (`apps/web/test/credits-poches-db.test.ts`) compare
 * la base à ces fonctions, opération par opération.
 */
export interface PochesCredits {
  solde: number;
  /** Poche d'abonnement restante · null tant qu'elle n'a jamais été suivie (espaces d'avant la migration 0060). */
  abonnementRestant: number | null;
  /** Dernière allocation accordée · repli quand `abonnementRestant` est null (sémantique d'avant). */
  derniereAllocation: number;
  /** Crédits pris dans la poche hors abonnement depuis la dernière allocation · rendus en premier. */
  horsAbonnementConsommes: number;
}

const n0 = (v: number | null | undefined) => Math.max(0, Math.floor(v || 0));

/** Poche d'abonnement effective · jamais plus que le solde. */
export function pocheAbonnement(p: PochesCredits): number {
  return Math.min(n0(p.abonnementRestant ?? p.derniereAllocation), n0(p.solde));
}

/** Poche hors abonnement (recharges, essai, dons) · ce que l'allocation conserve. */
export function pocheHorsAbonnement(p: PochesCredits): number {
  return n0(p.solde) - pocheAbonnement(p);
}

/** Débit · abonnement d'abord, hors abonnement ensuite. null si le solde ne suffit pas (rien ne bouge). */
export function debiterPoches(p: PochesCredits, cout: number): PochesCredits | null {
  const c = n0(cout);
  if (c === 0) return p;
  if (n0(p.solde) < c) return null;
  const abo = pocheAbonnement(p);
  const prisAbo = Math.min(abo, c);
  return {
    ...p,
    solde: n0(p.solde) - c,
    abonnementRestant: abo - prisAbo,
    horsAbonnementConsommes: n0(p.horsAbonnementConsommes) + (c - prisAbo),
  };
}

/** Remboursement · rend d'abord ce qui a été pris hors abonnement, puis l'abonnement. */
export function rembourserPoches(p: PochesCredits, montant: number): PochesCredits {
  const m = n0(montant);
  if (m === 0) return p;
  const versHors = Math.min(m, n0(p.horsAbonnementConsommes));
  return {
    ...p,
    solde: n0(p.solde) + m,
    abonnementRestant: pocheAbonnement(p) + (m - versHors),
    horsAbonnementConsommes: n0(p.horsAbonnementConsommes) - versHors,
  };
}

/** Allocation d'une formule · la poche hors abonnement est conservée, la poche d'abonnement est remplacée. */
export function allouerPoches(p: PochesCredits, allocation: number): PlanAllocation & { poches: PochesCredits } {
  const alloc = n0(allocation);
  const r = applyPlanAllocation(p.solde, pocheAbonnement(p), alloc);
  return { ...r, poches: { solde: r.next, abonnementRestant: alloc, derniereAllocation: alloc, horsAbonnementConsommes: 0 } };
}
