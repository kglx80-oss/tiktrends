/**
 * L'offre · les forfaits et les recharges, source UNIQUE. Pur.
 *
 * Deux catalogues cohabitent, jamais mélangés :
 *  · l'offre ACTUELLE (Starter, Core, Plus, Business) · ce que paient et
 *    reçoivent les clients aujourd'hui. Les abonnés la gardent jusqu'à leur
 *    prochaine échéance (décision du propriétaire du 29/10, point 5) ;
 *  · l'offre V2 (Essentiel, Pro, Agence) · décidée le 29/10, servie seulement
 *    quand l'interrupteur `TARIFS_V2` est posé sur le serveur (lu par l'appli,
 *    jamais ici : le noyau reste pur).
 *
 * `lib/rbac.ts` (`PLAN_CREDITS`, `PLAN_PRICE`, `PLAN_LABEL`) et
 * `lib/credit-packs.ts` (`CREDIT_PACKS`) DÉRIVENT de ce module · aucun prix
 * ni volume n'est écrit ailleurs (garde `offre-source-unique.test.ts`).
 *
 * Les crédits de l'offre V2 sont dans la NOUVELLE unité (1 ancien crédit =
 * `FACTEUR_UNITE` nouveaux, voir `bareme.ts`).
 */

export type CleForfaitActuel = 'starter' | 'core' | 'plus' | 'business';
export type CleForfaitV2 = 'essentiel' | 'pro' | 'agence';
export type CleForfait = CleForfaitActuel | CleForfaitV2;

export const FORFAITS_ACTUELS_ORDRE: readonly CleForfaitActuel[] = ['starter', 'core', 'plus', 'business'];
export const FORFAITS_V2_ORDRE: readonly CleForfaitV2[] = ['essentiel', 'pro', 'agence'];

export interface ForfaitActuel {
  libelle: string;
  /** Prix mensuel du catalogue du code, en euros (tel qu'affiché aujourd'hui). */
  prixMensuelEur: number;
  /** Allocation mensuelle de crédits (unité en vigueur). */
  creditsMois: number;
}

/** L'offre actuelle · valeurs INCHANGÉES (celles de `lib/rbac.ts` avant ce module). */
export const FORFAITS_ACTUELS: Readonly<Record<CleForfaitActuel, ForfaitActuel>> = {
  starter: { libelle: 'Starter', prixMensuelEur: 0, creditsMois: 200 },
  core: { libelle: 'Core', prixMensuelEur: 99, creditsMois: 2000 },
  plus: { libelle: 'Plus', prixMensuelEur: 299, creditsMois: 7000 },
  business: { libelle: 'Business', prixMensuelEur: 990, creditsMois: 24000 },
};

export interface ForfaitV2 {
  libelle: string;
  /** Prix mensuel TTC, en euros (TVA calculée par Stripe Tax, prix « taxe incluse »). */
  prixMensuelTtc: number;
  /**
   * Crédits par mois, nouvelle unité · calibrés pour une marge brute ≥
   * `MARGE_CIBLE` au PIRE CAS sur l'annuel (`marges.ts`, garde
   * `offre-marges.test.ts` qui porte le tableau mesuré).
   */
  creditsMois: number;
  /** Le forfait actuel dont il reprend les accès (`minPlan`). */
  accesDe: Exclude<CleForfaitActuel, 'starter'>;
  /** Accroche de la carte. */
  accroche: string;
}

export const FORFAITS_V2: Readonly<Record<CleForfaitV2, ForfaitV2>> = {
  essentiel: { libelle: 'Essentiel', prixMensuelTtc: 29, creditsMois: 4000, accesDe: 'core', accroche: 'Pour lancer ses premières créas winneuses' },
  pro: { libelle: 'Pro', prixMensuelTtc: 49, creditsMois: 7000, accesDe: 'plus', accroche: 'Pour itérer vite sur plusieurs marques' },
  agence: { libelle: 'Agence', prixMensuelTtc: 129, creditsMois: 18500, accesDe: 'business', accroche: 'Pour produire à volume pour ses clients' },
};

/** Le forfait V2 mis en avant (« le plus populaire »). */
export const FORFAIT_V2_MIS_EN_AVANT: CleForfaitV2 = 'pro';

/** Remise de l'abonnement annuel, sans engagement au-delà de l'année payée. */
export const REMISE_ANNUELLE_V2 = 0.30;

export type Facturation = 'mensuel' | 'annuel';

const centimes = (eur: number) => Math.round(eur * 100) / 100;

/** Prix TTC payé à chaque échéance · un mois, ou l'année entière. */
export function prixEcheanceTtc(cle: CleForfaitV2, facturation: Facturation): number {
  const m = FORFAITS_V2[cle].prixMensuelTtc;
  return facturation === 'mensuel' ? m : centimes(m * 12 * (1 - REMISE_ANNUELLE_V2));
}

/** Prix TTC ramené au mois (l'annuel divisé par douze). */
export function prixMensuelTtc(cle: CleForfaitV2, facturation: Facturation): number {
  return facturation === 'mensuel' ? FORFAITS_V2[cle].prixMensuelTtc : centimes(prixEcheanceTtc(cle, 'annuel') / 12);
}

/**
 * Bascule des abonnés actuels à leur échéance (point 5) · même rang d'accès.
 * Starter n'a pas d'équivalent payant : il reste tel quel (proposition dans la
 * PR, non appliquée).
 */
export const BASCULE_FORFAIT_V2: Readonly<Record<Exclude<CleForfaitActuel, 'starter'>, CleForfaitV2>> = {
  core: 'essentiel',
  plus: 'pro',
  business: 'agence',
};

/** Rang d'accès · un forfait V2 ouvre exactement ce qu'ouvre le forfait actuel qu'il remplace. */
export const RANG_FORFAIT: Readonly<Record<CleForfait, number>> = {
  starter: 0, core: 1, essentiel: 1, plus: 2, pro: 2, business: 3, agence: 3,
};

export const estForfaitV2 = (p: unknown): p is CleForfaitV2 => typeof p === 'string' && (FORFAITS_V2_ORDRE as readonly string[]).includes(p);
export const estForfaitActuel = (p: unknown): p is CleForfaitActuel => typeof p === 'string' && (FORFAITS_ACTUELS_ORDRE as readonly string[]).includes(p);
export const estCleForfait = (p: unknown): p is CleForfait => estForfaitV2(p) || estForfaitActuel(p);

export function nomForfait(p: CleForfait): string {
  return estForfaitV2(p) ? FORFAITS_V2[p].libelle : FORFAITS_ACTUELS[p].libelle;
}

/** Allocation mensuelle d'un forfait, quel que soit son catalogue. */
export function creditsMoisForfait(p: CleForfait): number {
  return estForfaitV2(p) ? FORFAITS_V2[p].creditsMois : FORFAITS_ACTUELS[p].creditsMois;
}

/* ───────────────────────── Recharges ───────────────────────── */

export interface Recharge { key: string; credits: number; eur: number }

/** Les recharges actuelles · valeurs INCHANGÉES (celles de `lib/credit-packs.ts`). */
export const RECHARGES_ACTUELLES: readonly Recharge[] = [
  { key: 'pack_1k', credits: 1000, eur: 19 },
  { key: 'pack_5k', credits: 5000, eur: 79 },
  { key: 'pack_20k', credits: 20000, eur: 279 },
];

/** Prix TTC de 1 000 crédits (nouvelle unité) selon le forfait V2 · dégressif. */
export const PRIX_RECHARGE_V2_PAR_MILLE: Readonly<Record<CleForfaitV2, number>> = {
  essentiel: 5.0,
  pro: 4.5,
  agence: 4.2,
};

/** Les tailles de recharge V2, en crédits (nouvelle unité). */
export const TAILLES_RECHARGE_V2: readonly number[] = [2000, 5000, 15000];

/** Les recharges V2 proposées à un abonné V2 · le prix dépend de son forfait. */
export function rechargesV2(forfait: CleForfaitV2): Recharge[] {
  const parMille = PRIX_RECHARGE_V2_PAR_MILLE[forfait];
  return TAILLES_RECHARGE_V2.map((credits) => ({ key: `v2_${forfait}_${credits}`, credits, eur: centimes((credits / 1000) * parMille) }));
}

/** Toutes les recharges V2 connues (pour retrouver un pack par sa clé au paiement). */
export function toutesRechargesV2(): Recharge[] {
  return FORFAITS_V2_ORDRE.flatMap(rechargesV2);
}
