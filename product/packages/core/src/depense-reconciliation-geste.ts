/**
 * R5 · RÉCONCILIER une dépense incertaine · le geste du propriétaire, lié à la
 * preuve du fournisseur.
 *
 * ── Le défaut réparé (consigne Codex) ─────────────────────────────────────────
 *
 * « Réconciliation maintenant : action ADMIN auditée liée à preuve
 * fournisseur, montant/devise/identifiant/motif, idempotente. Ne pas
 * simplement effacer une réserve incertaine par bouton. Modèle additif et
 * préservation historique. »
 *
 * R3 gardait une issue incertaine au MAXIMUM réservé, R4 la montrait ; rien ne
 * permettait de la rapprocher de la facture. Une réserve gardée pour toujours
 * finit par bloquer le plafond sans raison ; une réserve effacée d'un clic
 * perd la seule trace de ce qui a peut-être été facturé.
 *
 * Désormais le fondateur SAISIT le montant facturé, la devise, l'identifiant
 * de la preuve fournisseur et un motif ; la base AJOUTE une réconciliation
 * (`ai_spend_reconciliations`, migration 0056) sans toucher la ligne
 * `ai_spend` (montant réservé et cause gardés) ; le plafond retient le montant
 * facturé (`depenseDepuis`, `@tiktrends/db`).
 *
 * Ce module décide : la saisie (montant exact en micro-unités, devise gérée,
 * preuve et motif obligatoires, clé d'idempotence), la confirmation affichée
 * (réservé → facturé, et l'avertissement quand le facturé dépasse), le sort
 * d'une soumission selon l'état de la base (créer, rendre la même, refuser),
 * l'écran de l'historique, et ce qu'une réconciliation change ailleurs
 * (contrôle visuel relançable, registre d'essai).
 *
 * Pur : ni base, ni réseau, ni horloge.
 */

import { classerLigneEssai, type EtatLigneEssai } from './depense-prudente';
import { dateReconciliation, fournisseurLisible } from './depense-reconciliation-ecran';

/* ═══════════════════════════════ Saisie ═══════════════════════════════════ */

/**
 * Devises GÉRÉES · les plafonds et `ai_spend` sont en dollars. Une facture
 * dans une autre devise est REFUSÉE, jamais convertie à un taux inventé (la
 * base le refuse aussi : contrainte `ai_spend_reconciliations_devise_ck`).
 */
export const DEVISES_RECONCILIATION = ['USD'] as const;
export type DeviseReconciliation = (typeof DEVISES_RECONCILIATION)[number];
export const DEVISE_RECONCILIATION_DEFAUT: DeviseReconciliation = 'USD';

/**
 * Borne TECHNIQUE du montant saisi (1 000 000 $ = 10¹² micro-unités) · garde
 * l'entier exact en JavaScript et en `bigint`. Ce n'est pas un seuil métier :
 * un montant facturé supérieur au réservé est accepté (c'est la facture qui
 * fait foi), avec un avertissement à la confirmation.
 */
export const MONTANT_RECONCILIATION_MAX_MICROS = 1_000_000_000_000;

/** Longueurs acceptées · alignées sur les contraintes CHECK de 0056 (au moins 3 caractères utiles). */
export const PREUVE_LONGUEUR = { min: 3, max: 200 } as const;
export const MOTIF_LONGUEUR = { min: 3, max: 500 } as const;
/** Clé d'idempotence · émise par le serveur au rendu du formulaire. */
export const CLE_RECONCILIATION = /^[A-Za-z0-9_-]{8,100}$/;

export type ChampReconciliation = 'ligne' | 'montant' | 'devise' | 'preuve' | 'motif' | 'cle';
export interface ErreurSaisieReconciliation { champ: ChampReconciliation; message: string }

export interface SaisieReconciliation {
  ligne: unknown;
  montant: unknown;
  devise: unknown;
  preuve: unknown;
  motif: unknown;
  cle: unknown;
}

export interface ReconciliationSaisie {
  aiSpendId: string;
  billedMicros: number;
  devise: DeviseReconciliation;
  preuve: string;
  motif: string;
  cle: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Caractères de contrôle (sauf rien) · une preuve ou un motif ne porte ni saut de ligne caché ni NUL.
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/;

const texteSaisi = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Montant saisi → micro-unités EXACTES, sans passer par un flottant
 * (« 0,1 » = 100 000, jamais 99 999). Accepte la virgule ou le point, les
 * espaces de milliers, un « $ » final ; au plus six décimales (la
 * micro-unité). Rend `null` pour tout le reste (vide, négatif, lettres,
 * notation exponentielle, plusieurs séparateurs).
 */
export function montantSaisiEnMicros(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const brut = String(v).replace(/[\s  ]/g, '').replace(/\$$/, '').replace(/^\$/, '');
  const m = /^(\d{1,7})(?:[.,](\d{1,6}))?$/.exec(brut);
  if (!m) return null;
  const entier = Number(m[1]);
  const fraction = Number((m[2] ?? '').padEnd(6, '0'));
  const micros = entier * 1_000_000 + fraction;
  return Number.isSafeInteger(micros) ? micros : null;
}

/**
 * La saisie du formulaire, vérifiée champ par champ · TOUTES les erreurs d'un
 * coup (le propriétaire corrige en une fois). Devise vide ⇒ USD (défaut) ;
 * devise non gérée ⇒ refus, sans conversion.
 */
export function validerSaisieReconciliation(s: SaisieReconciliation): { ok: true; saisie: ReconciliationSaisie } | { ok: false; erreurs: ErreurSaisieReconciliation[] } {
  const erreurs: ErreurSaisieReconciliation[] = [];
  const ligne = texteSaisi(s.ligne);
  if (!UUID.test(ligne)) erreurs.push({ champ: 'ligne', message: 'Ligne de dépense inconnue · recharge la page.' });

  const micros = montantSaisiEnMicros(s.montant);
  if (texteSaisi(typeof s.montant === 'number' ? String(s.montant) : s.montant) === '') {
    erreurs.push({ champ: 'montant', message: 'Montant facturé obligatoire · celui de la facture, 0 si le fournisseur n’a rien facturé.' });
  } else if (micros === null) {
    erreurs.push({ champ: 'montant', message: 'Montant illisible · un nombre positif, six décimales au plus (ex. 0,0912).' });
  } else if (micros > MONTANT_RECONCILIATION_MAX_MICROS) {
    erreurs.push({ champ: 'montant', message: 'Montant hors bornes · au plus 1 000 000 $.' });
  }

  const deviseBrute = texteSaisi(s.devise).toUpperCase();
  const devise = deviseBrute === '' ? DEVISE_RECONCILIATION_DEFAUT : deviseBrute;
  if (!(DEVISES_RECONCILIATION as readonly string[]).includes(devise)) {
    erreurs.push({ champ: 'devise', message: `Devise « ${devise.slice(0, 12)} » non gérée · seul l’USD se rapproche ici, aucune conversion n’est appliquée. Saisis le montant en USD tel que la facture l’indique, ou laisse la ligne à réconcilier.` });
  }

  const preuve = texteSaisi(s.preuve);
  if (preuve.length < PREUVE_LONGUEUR.min) erreurs.push({ champ: 'preuve', message: 'Identifiant de preuve obligatoire · numéro de facture, de ligne de facture ou de requête chez le fournisseur.' });
  else if (preuve.length > PREUVE_LONGUEUR.max || CONTROLE.test(preuve)) erreurs.push({ champ: 'preuve', message: `Identifiant de preuve trop long ou illisible · ${PREUVE_LONGUEUR.max} caractères au plus.` });

  const motif = texteSaisi(s.motif);
  if (motif.length < MOTIF_LONGUEUR.min) erreurs.push({ champ: 'motif', message: 'Motif obligatoire · ce que la facture montre et pourquoi ce montant.' });
  else if (motif.length > MOTIF_LONGUEUR.max || CONTROLE.test(motif)) erreurs.push({ champ: 'motif', message: `Motif trop long ou illisible · ${MOTIF_LONGUEUR.max} caractères au plus.` });

  const cle = typeof s.cle === 'string' ? s.cle.trim() : '';
  if (!CLE_RECONCILIATION.test(cle)) erreurs.push({ champ: 'cle', message: 'Formulaire expiré · recharge la page avant de réconcilier.' });

  if (erreurs.length || micros === null) return { ok: false, erreurs };
  return { ok: true, saisie: { aiSpendId: ligne.toLowerCase(), billedMicros: micros, devise: devise as DeviseReconciliation, preuve, motif, cle } };
}

/* ═══════════════════════════ Confirmation ═════════════════════════════════ */

/** « 0,147024 $ » · micro-unités affichées sans perte (4 décimales au moins, 6 au plus). */
export function montantMicrosLisible(micros: number): string {
  const v = Number.isFinite(micros) ? Math.max(0, Math.round(micros)) : 0;
  const entier = Math.floor(v / 1_000_000);
  const frac = String(v % 1_000_000).padStart(6, '0');
  const decimales = entier >= 1 ? frac.replace(/0+$/, '').padEnd(2, '0') : frac.replace(/0+$/, '').padEnd(4, '0');
  return `${entier},${decimales} $`;
}

export const microsDepuisUsd = (usd: number) => (Number.isFinite(usd) ? Math.max(0, Math.round(usd * 1_000_000)) : 0);

export interface ConfirmationReconciliation {
  /** « Réservé 0,1470 $ → facturé 0,0900 $ » · la phrase que le bouton confirme. */
  texte: string;
  /** facturé − réservé, en micro-unités (négatif = réserve libérée). */
  ecartMicros: number;
  sens: 'libere' | 'egal' | 'ajoute';
  /** Non nul quand le facturé DÉPASSE le réservé · accepté et compté, mais dit. */
  avertissement: string | null;
}

export function confirmationReconciliation(reserveMicros: number, factureMicros: number): ConfirmationReconciliation {
  const r = Math.max(0, Math.round(reserveMicros));
  const f = Math.max(0, Math.round(factureMicros));
  const ecart = f - r;
  const base = `Réservé ${montantMicrosLisible(r)} → facturé ${montantMicrosLisible(f)}`;
  if (ecart < 0) {
    return { texte: `${base} · le plafond retiendra ${montantMicrosLisible(f)} pour cette ligne, ${montantMicrosLisible(-ecart)} de réserve libérés.`, ecartMicros: ecart, sens: 'libere', avertissement: null };
  }
  if (ecart === 0) {
    return { texte: `${base} · le plafond retient le même montant, la ligne sort de « À réconcilier ».`, ecartMicros: 0, sens: 'egal', avertissement: null };
  }
  return {
    texte: `${base} · le plafond retiendra ${montantMicrosLisible(f)} pour cette ligne, ${montantMicrosLisible(ecart)} de plus que la réserve.`,
    ecartMicros: ecart,
    sens: 'ajoute',
    avertissement: `Attention · le facturé dépasse le réservé de ${montantMicrosLisible(ecart)}. Il est accepté et compté tel quel (la facture fait foi) : vérifie le montant et la ligne de facture avant de confirmer.`,
  };
}

/* ═══════════════════ Sort d'une soumission, selon la base ════════════════ */

export interface EtatBaseReconciliation {
  /** La ligne `ai_spend` visée, verrouillée pendant la décision · `null` si absente. */
  ligne: { id: string; reconcileReason: string | null; actualUsd: number } | null;
  /** La réconciliation déjà enregistrée sous CETTE clé, s'il y en a une. */
  parCle: { id: string; aiSpendId: string } | null;
  /** La réconciliation déjà enregistrée pour CETTE ligne, s'il y en a une. */
  parLigne: { id: string; idempotencyKey: string; createdAt: Date } | null;
}

export type DecisionReconciliation =
  | { geste: 'inserer'; reserveMicros: number }
  | { geste: 'deja_enregistree'; reconciliationId: string }
  | { geste: 'refus'; code: 'LIGNE_ABSENTE' | 'PAS_A_RECONCILIER' | 'DEJA_RECONCILIEE' | 'CLE_AUTRE_LIGNE'; message: string };

/**
 * Le sort d'une soumission · dans l'ordre :
 *  1. la clé a déjà servi pour CETTE ligne ⇒ la même réconciliation est rendue
 *     (double clic, soumission rejouée : aucun doublon, aucun effet de plus) ;
 *  2. la clé a servi pour une AUTRE ligne ⇒ refus (une clé, une ligne) ;
 *  3. ligne absente ⇒ refus ;
 *  4. ligne déjà réconciliée sous une autre clé ⇒ refus (une ligne se
 *     réconcilie une fois ; l'historique ne se réécrit pas) ;
 *  5. ligne qui n'est pas « à réconcilier » (réglée, rendue, réservée sans
 *     cause) ⇒ refus : seul un montant INCERTAIN se rapproche d'une facture ;
 *  6. sinon ⇒ on ajoute, avec le montant réservé au moment du geste.
 */
export function decisionReconciliation(e: EtatBaseReconciliation, aiSpendId: string): DecisionReconciliation {
  if (e.parCle) {
    if (e.parCle.aiSpendId === aiSpendId) return { geste: 'deja_enregistree', reconciliationId: e.parCle.id };
    return { geste: 'refus', code: 'CLE_AUTRE_LIGNE', message: 'Ce formulaire a déjà servi pour une autre ligne · recharge la page.' };
  }
  if (!e.ligne) return { geste: 'refus', code: 'LIGNE_ABSENTE', message: 'Ligne de dépense introuvable · elle n’est pas dans la base.' };
  if (e.parLigne) {
    return { geste: 'refus', code: 'DEJA_RECONCILIEE', message: `Cette ligne a déjà été réconciliée le ${dateReconciliation(e.parLigne.createdAt)} · une réconciliation ne se remplace pas, elle reste dans l’historique.` };
  }
  if (!e.ligne.reconcileReason) {
    return { geste: 'refus', code: 'PAS_A_RECONCILIER', message: 'Cette ligne n’est pas à réconcilier · son montant est déjà réglé ou rendu.' };
  }
  return { geste: 'inserer', reserveMicros: microsDepuisUsd(e.ligne.actualUsd) };
}

/* ═════════════════════════ Historique à l'écran ═══════════════════════════ */

export interface LigneReconciliee {
  id: string;
  aiSpendId: string;
  appelLe: Date;
  provider: string;
  model: string | null;
  action: string;
  cause: string;
  reservedMicros: number;
  billedMicros: number;
  currency: string;
  providerRef: string;
  reason: string;
  auteur: string | null;
  createdAt: Date;
}

export interface LigneEcranReconciliee {
  id: string;
  aiSpendId: string;
  action: string;
  fournisseur: string;
  modele: string | null;
  appel: string;
  reserve: string;
  facture: string;
  /** « 0,0570 $ libérés » · « inchangé » · « 0,0500 $ de plus ». */
  ecart: string;
  depasse: boolean;
  preuve: string;
  motif: string;
  auteur: string;
  le: string;
}

export interface EcranReconciliees {
  etat: 'vide' | 'rempli';
  resume: string;
  lignes: LigneEcranReconciliee[];
}

export function ecranReconciliees(lignes: readonly LigneReconciliee[]): EcranReconciliees {
  const triees = [...lignes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const reserve = triees.reduce((s, l) => s + Math.max(0, l.reservedMicros), 0);
  const facture = triees.reduce((s, l) => s + Math.max(0, l.billedMicros), 0);
  return {
    etat: triees.length ? 'rempli' : 'vide',
    resume: triees.length
      ? `${triees.length} dépense${triees.length > 1 ? 's' : ''} réconciliée${triees.length > 1 ? 's' : ''} · ${montantMicrosLisible(reserve)} réservés, ${montantMicrosLisible(facture)} facturés retenus au plafond.`
      : 'Aucune dépense réconciliée pour l’instant.',
    lignes: triees.map((l) => {
      const ecart = l.billedMicros - l.reservedMicros;
      return {
        id: l.id, aiSpendId: l.aiSpendId, action: l.action || 'action inconnue', fournisseur: fournisseurLisible(l.provider), modele: l.model,
        appel: dateReconciliation(l.appelLe), reserve: montantMicrosLisible(l.reservedMicros), facture: `${montantMicrosLisible(l.billedMicros)} (${l.currency})`,
        ecart: ecart < 0 ? `${montantMicrosLisible(-ecart)} libérés` : ecart === 0 ? 'inchangé' : `${montantMicrosLisible(ecart)} de plus que la réserve`,
        depasse: ecart > 0,
        preuve: l.providerRef, motif: l.reason, auteur: l.auteur || 'auteur inconnu', le: dateReconciliation(l.createdAt),
      };
    }),
  };
}

/* ═════════════════ Effets ailleurs · contrôle visuel, registre ═══════════ */

/**
 * Un contrôle visuel à l'issue INCERTAINE est-il réconcilié ? Oui seulement si
 * AU MOINS une ligne de dépense lui est rattachée ET que TOUTES sont
 * réconciliées. Aucune ligne retrouvée ne prouve rien : le doute reste.
 */
export function controleIncertainReconcilie(lignes: ReadonlyArray<{ reconciliee: boolean }>): boolean {
  return lignes.length > 0 && lignes.every((l) => l.reconciliee);
}

export type EtatLigneEssaiReconciliee = EtatLigneEssai | 'reconciliee';

/**
 * Une ligne `ai_spend` vue par le budget d'essai, réconciliation comprise · une
 * ligne réconciliée est RÉGLÉE au montant facturé (plus rien d'incertain) ;
 * sinon la classification d'E2 (`classerLigneEssai`) s'applique telle quelle.
 * Raccord du registre d'essai (`scripts/recette/registre.ts`) : passer
 * `factureMicros` (`billed_micros` de la réconciliation, `null` sans).
 */
export function classerLigneEssaiReconciliee(l: Parameters<typeof classerLigneEssai>[0] & { factureMicros: number | null }): { etat: EtatLigneEssaiReconciliee; regleMicros: number; incertainMicros: number } {
  if (l.factureMicros !== null && Number.isFinite(l.factureMicros)) return { etat: 'reconciliee', regleMicros: Math.max(0, Math.round(l.factureMicros)), incertainMicros: 0 };
  return classerLigneEssai(l);
}
