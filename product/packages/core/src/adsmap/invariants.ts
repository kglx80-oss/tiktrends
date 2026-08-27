/**
 * ADSMAP · invariants du §2.4 du cahier des charges.
 *
 * Trois d'entre eux sont posés en contrainte SQL (migration 0033) : une ad READY
 * sans hypothèse, une itération qui ne change rien, un WINNER non comparable.
 * Ceux qui ne s'expriment pas en SQL vivent ici, en fonctions pures : la base ne
 * sait pas remonter un graphe, et un message d'erreur SQL ne dit rien à un
 * utilisateur.
 *
 * Le but n'est pas de doubler la base mais de refuser EN AMONT, avec un message
 * lisible, ce qu'elle refuserait de toute façon.
 */

import type { AdStatus, AdType, VerdictValue, TestedVariable } from './types';

/** Une violation nommée, avec un message affichable tel quel. */
export interface Violation { rule: string; message: string }

export interface AdShape {
  status: AdStatus;
  adType: AdType;
  hypothesis?: string | null;
  testedVariable?: TestedVariable | null;
  offerId?: string | null;
  landingPageId?: string | null;
}

/**
 * Pas d'ad lancée sans test falsifiable.
 * Décision de Kévin (§17.1) : bloquant. Les lignes importées du Sheet historique
 * redescendent en `draft` avec un drapeau, l'invariant n'est pas rétroactif.
 */
export function checkAdReady(ad: AdShape): Violation[] {
  if (ad.status !== 'ready' && ad.status !== 'live') return [];
  const v: Violation[] = [];
  if (!ad.hypothesis?.trim()) {
    v.push({ rule: 'ad.hypothesis', message: "Écris l'hypothèse testée avant de passer l'ad en prêt : quel KPI, quelle étape du funnel, quelle valeur cible." });
  }
  if (!ad.testedVariable || ad.testedVariable === 'none_control') {
    v.push({ rule: 'ad.tested_variable', message: 'Indique la variable testée. Sans elle, le résultat ne pourra être attribué à rien.' });
  }
  if (!ad.offerId) {
    v.push({ rule: 'ad.offer', message: "Rattache une offre : sans elle, un échec de conversion sera imputé à tort à la créa." });
  }
  if (!ad.landingPageId) {
    v.push({ rule: 'ad.landing_page', message: 'Rattache une page de destination, pour la même raison.' });
  }
  return v;
}

export interface IterationShape {
  childAdType: AdType;
  parentVerdict?: VerdictValue | null;
  changedVariable: TestedVariable;
  childAdId: string;
  parentAdId: string;
}

/** Une itération part d'un gagnant, pointe vers son parent, et change une variable. */
export function checkIteration(it: IterationShape): Violation[] {
  const v: Violation[] = [];
  if (it.childAdId === it.parentAdId) {
    v.push({ rule: 'iteration.self', message: 'Une ad ne peut pas être sa propre itération.' });
  }
  if (it.changedVariable === 'none_control') {
    v.push({ rule: 'iteration.variable', message: 'Une itération change exactement une variable · sinon ce n’est pas une itération mais une nouvelle piste (NEW).' });
  }
  if (it.parentVerdict !== 'winner' && it.parentVerdict !== 'baby_winner') {
    v.push({
      rule: 'iteration.parent',
      message: "On n'itère que sur un gagnant ou un gagnant naissant. Repartir d'un perdant reproduit ce qui n'a pas marché.",
    });
  }
  return v;
}

/** Un verdict validé s'appuie sur au moins un apprentissage validé (§2.4). */
export function checkVerdictValidation(input: { status: 'computed' | 'validated'; validatedLearnings: number }): Violation[] {
  if (input.status !== 'validated') return [];
  if (input.validatedLearnings > 0) return [];
  return [{
    rule: 'verdict.learning',
    message: 'Valide au moins un apprentissage avant de clore le verdict : un test sans enseignement retiré est un budget dépensé pour rien.',
  }];
}

/** Un verdict non comparable ne peut pas être un gagnant absolu (§2.4). */
export function checkVerdictComparability(input: { comparable: boolean; computed: VerdictValue }): Violation[] {
  if (input.comparable || input.computed !== 'winner') return [];
  return [{
    rule: 'verdict.comparable',
    message: 'Protocole non respecté : le verdict ne peut pas dépasser « gagnant relatif », faute de chance comparable entre les ads.',
  }];
}

/**
 * Aucun cycle dans le graphe d'itération.
 *
 * Les arêtes sont données comme `enfant -> parent`. Un cycle rendrait la
 * remontée de filiation infinie côté canvas et côté agents. On vérifie l'ajout
 * d'une arête plutôt que le graphe entier : c'est ce dont l'écriture a besoin.
 */
export function wouldCreateCycle(edges: Array<{ child: string; parent: string }>, add: { child: string; parent: string }): boolean {
  if (add.child === add.parent) return true;
  const parentOf = new Map<string, string>();
  for (const e of edges) parentOf.set(e.child, e.parent);
  parentOf.set(add.child, add.parent);

  // Remontée depuis le nouveau parent : si on retombe sur l'enfant, c'est un cycle.
  const seen = new Set<string>([add.child]);
  let cur: string | undefined = add.parent;
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

/** Profondeur de filiation d'une ad (0 = ad d'origine). Sûre même sur graphe cyclique. */
export function iterationDepth(edges: Array<{ child: string; parent: string }>, adId: string): number {
  const parentOf = new Map(edges.map((e) => [e.child, e.parent]));
  const seen = new Set<string>();
  let depth = 0;
  let cur = parentOf.get(adId);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    depth++;
    cur = parentOf.get(cur);
  }
  return depth;
}

/**
 * Compose UN message listant tous les champs manquants d'un coup.
 *
 * Exigence C3 de l'addendum v2.1 : afficher la première violation seulement fait
 * corriger l'utilisateur en quatre allers-retours. On énumère donc ce qui manque,
 * puis on rappelle pourquoi en une phrase.
 */
export function formatViolations(violations: Violation[]): string | null {
  if (!violations.length) return null;
  if (violations.length === 1) return violations[0]!.message;

  const MANQUE: Record<string, string> = {
    'ad.hypothesis': "l'hypothèse testée",
    'ad.tested_variable': 'la variable testée',
    'ad.offer': "l'offre",
    'ad.landing_page': 'la page de destination',
  };
  const champs = violations.map((v) => MANQUE[v.rule]).filter(Boolean);
  if (champs.length !== violations.length) {
    // Violations hétérogènes : on les rend telles quelles, une par ligne.
    return violations.map((v) => v.message).join(' ');
  }
  const liste = champs.length > 1
    ? `${champs.slice(0, -1).join(', ')} et ${champs[champs.length - 1]}`
    : champs[0];
  return `Il manque ${liste} pour passer cette ad en prêt. Sans ces éléments, le résultat du test ne pourra être attribué à rien.`;
}
