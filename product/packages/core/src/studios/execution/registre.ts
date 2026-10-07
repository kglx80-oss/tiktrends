/**
 * Studios · L3 · registre budgétaire d'un job (cahier 01 §9.2).
 *
 * Pur. Le registre `studio_budget_ledger` est en AJOUT SEUL, en unités
 * entières, une référence unique par mouvement. Par job :
 *
 *   reserve  · posée dans la transaction d'approbation, en même temps que le
 *              débit des crédits de l'espace (`workspaces.credits_balance`) ;
 *   settle   · UNE fois, à l'issue connue : ce qui est réellement consommé ;
 *   release  · ce qui n'est pas consommé, rendu au même moment (et recrédité
 *              à l'espace, référence identique dans `credit_ledger.ref_id`).
 *
 * Invariant : settle + release = reserve, composante par composante (crédits,
 * micro-dollars). Un job en `reconciliation_required` n'est NI réglé NI libéré :
 * l'issue financière est inconnue, on n'annonce aucun remboursement.
 *
 * ── Politique commerciale (existante, pas inventée) ──────────────────────────
 *
 * Le produit débite avant le travail et rend ce qui n'a pas été produit
 * (`ads.ts` rembourse les images non fabriquées, `video.ts` rembourse un
 * échec). Donc : crédits réglés = prix devisé des sorties LIVRÉES ; tout le
 * reste est rendu. Côté fournisseur (dollars), on règle ce que le fournisseur
 * a facturé, même sans livrable : c'est notre coût, pas celui du client.
 */

export type GenreMouvement = 'reserve' | 'settle' | 'release' | 'adjustment';

export interface Montant {
  credits: number;
  usdMicros: number;
}

export interface MouvementRegistre extends Montant {
  kind: GenreMouvement;
  ref: string;
  jobId: string | null;
}

/** Références d'un job · identiques dans `studio_budget_ledger.ref` et `credit_ledger.ref_id`. */
export function refsDuJob(jobId: string): Record<'reserve' | 'settle' | 'release', string> {
  return {
    reserve: `studio:job:${jobId}:reserve`,
    settle: `studio:job:${jobId}:settle`,
    release: `studio:job:${jobId}:release`,
  };
}

export type IssueFinanciere =
  /** Sorties livrées (fichiers stockés) · y compris un résultat arrivé après une annulation. */
  | 'livre'
  /** Échec certain, rien facturé par le fournisseur. */
  | 'echec_sans_frais'
  /** Annulé avant toute soumission, ou annulation confirmée sans frais. */
  | 'annule_sans_frais'
  /** Le fournisseur a facturé mais aucun livrable ne peut être remis. */
  | 'facture_sans_livrable';

export interface EntreeReglement {
  issue: IssueFinanciere;
  reserve: Montant;
  /** Lignes du devis, pour chiffrer ce qui est livré. */
  lignes: ReadonlyArray<{ operation: string; credits: number; usdMicros: number; unites: number }>;
  /** Opérations effectivement livrées (issue `livre`). */
  operationsLivrees?: ReadonlyArray<string>;
  /** Coût rapporté par le fournisseur, micro-dollars · `null` = inconnu (on retient le plafond devisé). */
  coutFournisseurUsdMicros?: number | null;
}

export interface Reglement {
  settle: Montant;
  release: Montant;
}

const borne = (x: number, max: number) => Math.max(0, Math.min(max, Math.trunc(x)));

export function decisionReglement(e: EntreeReglement): Reglement {
  const r = { credits: Math.max(0, Math.trunc(e.reserve.credits)), usdMicros: Math.max(0, Math.trunc(e.reserve.usdMicros)) };
  let credits = 0;
  let usd = 0;
  if (e.issue === 'livre') {
    const livrees = new Set(e.operationsLivrees ?? e.lignes.map((l) => l.operation));
    const lignes = e.lignes.filter((l) => livrees.has(l.operation));
    credits = lignes.reduce((s, l) => s + l.credits * l.unites, 0);
    const plafondUsd = lignes.reduce((s, l) => s + l.usdMicros * l.unites, 0);
    usd = e.coutFournisseurUsdMicros ?? plafondUsd;
  } else if (e.issue === 'facture_sans_livrable') {
    credits = 0;
    usd = e.coutFournisseurUsdMicros ?? r.usdMicros;
  }
  const settle = { credits: borne(credits, r.credits), usdMicros: borne(usd, r.usdMicros) };
  return { settle, release: { credits: r.credits - settle.credits, usdMicros: r.usdMicros - settle.usdMicros } };
}

export interface BilanRegistre {
  reserve: Montant;
  settle: Montant;
  release: Montant;
  ajustement: Montant;
  /** Réservé et pas encore réglé ni libéré. */
  ouvert: Montant;
  regle: boolean;
}

const zero = (): Montant => ({ credits: 0, usdMicros: 0 });
const ajoute = (a: Montant, b: Montant): Montant => ({ credits: a.credits + Number(b.credits), usdMicros: a.usdMicros + Number(b.usdMicros) });

export function bilanRegistre(mouvements: ReadonlyArray<Pick<MouvementRegistre, 'kind' | 'credits' | 'usdMicros'>>): BilanRegistre {
  const b = { reserve: zero(), settle: zero(), release: zero(), ajustement: zero() };
  let regle = false;
  for (const m of mouvements) {
    if (m.kind === 'reserve') b.reserve = ajoute(b.reserve, m);
    else if (m.kind === 'settle') { b.settle = ajoute(b.settle, m); regle = true; }
    else if (m.kind === 'release') b.release = ajoute(b.release, m);
    else b.ajustement = ajoute(b.ajustement, m);
  }
  return {
    ...b,
    ouvert: { credits: b.reserve.credits - b.settle.credits - b.release.credits, usdMicros: b.reserve.usdMicros - b.settle.usdMicros - b.release.usdMicros },
    regle,
  };
}

/**
 * Violations du registre d'UN job · liste vide = sain. Sert aux tests, au banc
 * et à la réconciliation : une seule réserve, au plus un règlement, au plus une
 * libération, jamais plus rendu+réglé que réservé, et un job terminal réglé.
 */
export function violationsRegistreJob(
  mouvements: ReadonlyArray<Pick<MouvementRegistre, 'kind' | 'credits' | 'usdMicros'>>,
  etatJob: string,
): string[] {
  const v: string[] = [];
  const n = (k: GenreMouvement) => mouvements.filter((m) => m.kind === k).length;
  if (n('reserve') !== 1) v.push(`réserves : ${n('reserve')} au lieu de 1`);
  if (n('settle') > 1) v.push(`règlements : ${n('settle')} au lieu d'au plus 1`);
  if (n('release') > 1) v.push(`libérations : ${n('release')} au lieu d'au plus 1`);
  const b = bilanRegistre(mouvements);
  if (b.ouvert.credits < 0 || b.ouvert.usdMicros < 0) v.push(`réglé + libéré dépasse la réserve (${JSON.stringify(b.ouvert)})`);
  const terminal = etatJob === 'completed' || etatJob === 'failed' || etatJob === 'cancelled';
  if (terminal && !b.regle) v.push(`job ${etatJob} sans règlement`);
  if (terminal && (b.ouvert.credits !== 0 || b.ouvert.usdMicros !== 0)) v.push(`job ${etatJob} avec une réserve encore ouverte (${JSON.stringify(b.ouvert)})`);
  if (etatJob === 'reconciliation_required' && b.regle) v.push('job en réconciliation déjà réglé');
  return v;
}
