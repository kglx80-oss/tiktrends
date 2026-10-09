/**
 * Budget d'essai cumulatif (15 $ au total) · ENGAGEMENTS durables avant dépense
 * (E3, contre-recette Codex sur b35ce9b).
 *
 * Le défaut réparé : la réservation d'une commande payante n'était que
 * JOURNALISÉE, jamais comptée au bilan. Un processus tué après l'appel payant
 * mais avant la synchronisation finale, suivi d'une destruction de la base,
 * effaçait la dépense : le registre ne savait rien de l'appel.
 *
 * Désormais chaque commande payante écrit, AVANT l'appel et sous verrou, un
 * ENGAGEMENT au registre (fichier hors base) :
 *
 *   engage ──► regle      (montant réel, lu des lignes de dépense rattachées)
 *          ├─► libere     (refus certain : rien d'autre que ses lignes)
 *          └─► incertain  (issue inconnue : reste au maximum réservé)
 *   incertain ──► regle   (réconciliation après coup, montant prouvé)
 *
 * Un engagement jamais clos (processus tué) RESTE `engage` et compte au
 * maximum réservé, même après la destruction de la base. Le bilan compte donc
 * réglé + engagé + incertain.
 *
 * ── Pas de double compte, jamais de sous-compte ─────────────────────────────
 *
 * Les lignes `ai_spend` vues par le registre sont TOUJOURS comptées (réglé ou
 * incertain, `classerLigneEssai`). Un engagement ne compte que ce qui DÉPASSE
 * les lignes qui lui sont rattachées :
 *
 *   engage, incertain · max(0, réservé − rattaché)   (au total : max(réservé, rattaché))
 *   regle             · max(0, montant réel − rattaché)
 *   libere            · 0
 *
 * Le rattachement ne se fait qu'à la clôture. Tant qu'un engagement est
 * ouvert, ses lignes sont comptées EN PLUS de lui (prudent). Un rattachement
 * imprécis (deux commandes concurrentes sur la même base) ne fait jamais
 * baisser le total sous la somme des lignes : il n'affecte que la précision,
 * jamais la prudence. Aucun seuil de tolérance d'horloge n'est donc posé.
 *
 * Module PUR · ni fichier, ni base, ni réseau. Le fichier, le verrou et la
 * base vivent dans `apps/web/scripts/recette/registre.ts` et `verrou.ts`.
 */

import { bilanBudgetEssai, type BilanBudgetEssai } from './depense-prudente';

export type EtatEngagementEssai = 'engage' | 'regle' | 'libere' | 'incertain';

export interface EngagementEssai {
  /** Identifiant IDEMPOTENT · un second engagement au même identifiant ne réserve rien de plus. */
  id: string;
  commande: string;
  /** Réservation MAXIMALE confirmée, en micro-dollars. */
  reserveMicros: number;
  etat: EtatEngagementEssai;
  /** Montant réel au règlement (micro-dollars) · `null` tant que non réglé. */
  regleMicros: number | null;
  creeLe: string;
  closLe: string | null;
  /** Pourquoi libéré ou incertain. */
  cause: string | null;
  /** Base de recette où la commande tournait (identité du cluster et nom). */
  base: string;
  /** Processus et hôte qui ont pris l'engagement · diagnostic seulement. */
  pid: number;
  hote: string;
}

export type IssueEngagement =
  | { etat: 'regle'; montantMicros?: number }
  | { etat: 'libere'; cause: string }
  | { etat: 'incertain'; cause: string };

/** Une ligne de dépense telle que le registre la garde, vue par le rattachement. */
export interface LigneEngageable {
  id: string;
  base: string;
  creeeLe: string;
  regleMicros: number;
  incertainMicros: number;
  engagement?: string | null;
}

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/** Ce qu'un engagement compte AU-DELÀ des lignes qui lui sont rattachées. */
export function partEngagement(e: Pick<EngagementEssai, 'etat' | 'reserveMicros' | 'regleMicros'>, rattacheMicros: number): { engage: number; incertain: number; regle: number } {
  const r = pos(rattacheMicros);
  if (e.etat === 'engage') return { engage: Math.max(0, pos(e.reserveMicros) - r), incertain: 0, regle: 0 };
  if (e.etat === 'incertain') return { engage: 0, incertain: Math.max(0, pos(e.reserveMicros) - r), regle: 0 };
  if (e.etat === 'regle') return { engage: 0, incertain: 0, regle: Math.max(0, pos(e.regleMicros ?? 0) - r) };
  return { engage: 0, incertain: 0, regle: 0 };
}

export interface BilanEssaiEngage extends BilanBudgetEssai {
  /**
   * Engagements OUVERTS (commande en cours, ou tuée avant sa clôture), au
   * maximum réservé · DÉJÀ compris dans `incertainMicros`, pour que toute
   * décision existante (`decisionDepenseEssai`) les compte sans changement.
   */
  engageMicros: number;
  engagementsOuverts: number;
}

/**
 * Le bilan du registre · antérieur + lignes (réglé, incertain) + engagements
 * (ce qui dépasse leurs lignes rattachées). Les engagements ouverts et
 * incertains vont dans `incertainMicros` (au maximum), les réglés dans
 * `regleMicros`.
 */
export function bilanEssaiAvecEngagements(e: {
  autoriseMicros: number;
  anterieuresMicros: number;
  lignes: ReadonlyArray<{ regleMicros: number; incertainMicros: number; engagement?: string | null }>;
  engagements: ReadonlyArray<Pick<EngagementEssai, 'id' | 'etat' | 'reserveMicros' | 'regleMicros'>>;
}): BilanEssaiEngage {
  const rattache = new Map<string, number>();
  for (const l of e.lignes) {
    if (!l.engagement) continue;
    rattache.set(l.engagement, (rattache.get(l.engagement) ?? 0) + pos(l.regleMicros) + pos(l.incertainMicros));
  }
  let engageMicros = 0;
  let engagementsOuverts = 0;
  const pseudo: Array<{ regleMicros: number; incertainMicros: number }> = [];
  for (const g of e.engagements) {
    const p = partEngagement(g, rattache.get(g.id) ?? 0);
    if (g.etat === 'engage') engagementsOuverts += 1;
    engageMicros += p.engage;
    pseudo.push({ regleMicros: p.regle, incertainMicros: p.engage + p.incertain });
  }
  const b = bilanBudgetEssai({ autoriseMicros: e.autoriseMicros, anterieuresMicros: e.anterieuresMicros, lignes: [...e.lignes, ...pseudo] });
  return { ...b, engageMicros, engagementsOuverts };
}

/**
 * Les lignes à rattacher à un engagement qu'on clôt · même base, nées depuis
 * l'engagement, pas encore rattachées ailleurs. Rend leurs identifiants.
 */
export function lignesARattacher(lignes: readonly LigneEngageable[], e: Pick<EngagementEssai, 'base' | 'creeLe'>): string[] {
  const depuis = Date.parse(e.creeLe);
  if (!Number.isFinite(depuis)) return [];
  return lignes.filter((l) => !l.engagement && l.base === e.base && Date.parse(l.creeeLe) >= depuis).map((l) => l.id);
}

export type TransitionEngagement =
  | { ok: true; engagement: EngagementEssai; change: boolean }
  | { ok: false; message: string };

/**
 * Clôt un engagement, de façon IDEMPOTENTE (même issue rejouée ⇒ rien ne
 * change). `rattacheMicros` · ce que valent ses lignes rattachées, montant
 * réel par défaut d'un règlement. Un engagement réglé ou libéré est définitif ;
 * un engagement incertain ne peut qu'être réglé (réconciliation prouvée).
 */
export function cloreEngagementEssai(e: EngagementEssai, issue: IssueEngagement, rattacheMicros: number, maintenant: Date): TransitionEngagement {
  const t = maintenant.toISOString();
  if (issue.etat === 'regle') {
    const montant = issue.montantMicros === undefined ? pos(rattacheMicros) : pos(issue.montantMicros);
    if (e.etat === 'libere') return { ok: false, message: `Engagement ${e.id} déjà libéré · il ne se règle plus.` };
    if (e.etat === 'regle' && e.regleMicros === montant) return { ok: true, engagement: e, change: false };
    return { ok: true, engagement: { ...e, etat: 'regle', regleMicros: montant, closLe: t }, change: true };
  }
  if (e.etat === issue.etat) return { ok: true, engagement: e, change: false };
  if (e.etat !== 'engage') {
    return { ok: false, message: `Engagement ${e.id} déjà ${e.etat === 'regle' ? 'réglé' : e.etat === 'libere' ? 'libéré' : 'incertain'} · passage à « ${issue.etat} » refusé (un engagement clos ne revient pas en arrière ; un incertain ne se règle que par un montant prouvé).` };
  }
  return { ok: true, engagement: { ...e, etat: issue.etat, regleMicros: null, closLe: t, cause: issue.cause }, change: true };
}

/** Lecture défensive d'un engagement relu d'un fichier · `null` s'il est invalide. */
export function engagementValide(x: unknown): x is EngagementEssai {
  const g = x as Partial<EngagementEssai> | null;
  const entier = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  return !!g && typeof g.id === 'string' && g.id.length > 0 && typeof g.commande === 'string'
    && entier(g.reserveMicros) && g.reserveMicros! > 0
    && (g.etat === 'engage' || g.etat === 'regle' || g.etat === 'libere' || g.etat === 'incertain')
    && (g.regleMicros === null || entier(g.regleMicros))
    && (g.etat !== 'regle' || entier(g.regleMicros))
    && typeof g.creeLe === 'string' && Number.isFinite(Date.parse(g.creeLe))
    && typeof g.base === 'string';
}
