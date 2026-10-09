/**
 * R4 · les dépenses « à réconcilier » À L'ÉCRAN du propriétaire.
 *
 * R3 a posé la donnée (`ai_spend.reconcile_reason`, migration 0055) et la
 * lecture (`vueReconciliation`) ; rien ne l'affichait. Une réservation gardée
 * au maximum que personne ne voit n'est pas prudente, elle est muette : le
 * plafond semble entamé sans raison lisible.
 *
 * Ce module décide QUOI montrer · combien de lignes, le montant compté au
 * maximum, la cause en clair, la date, l'action, et le geste attendu (comparer
 * à la facture du fournisseur). Aucun bouton ne modifie une ligne : R5 AJOUTE
 * une réconciliation (montant facturé, devise, preuve, motif, auteur), saisie
 * par le fondateur et décidée dans `depense-reconciliation-geste.ts`.
 *
 * Pur : ni base, ni réseau, ni horloge (le fuseau d'affichage est fixé).
 */

import type { VueReconciliation } from './depense-prudente';

const FOURNISSEURS: Readonly<Record<string, string>> = { anthropic: 'Anthropic', fal: 'fal', openai: 'OpenAI' };

/** Nom affiché d'un fournisseur · une valeur inconnue reste lisible telle quelle. */
export function fournisseurLisible(p: string): string {
  return FOURNISSEURS[p.toLowerCase()] ?? (p || 'fournisseur inconnu');
}

/** « 1,2345 $ » sous 1 $, « 12,34 $ » au-delà · virgule décimale. */
export function montantDepenseLisible(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return `${v.toFixed(v < 1 ? 4 : 2).replace('.', ',')} $`;
}

const FUSEAU = 'Europe/Paris';
/** « 08/10/2026 14:05 » · heure de Paris, la date que porte la facture. */
export function dateReconciliation(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'date inconnue';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });
}

export interface LigneEcranReconciliation {
  id: string;
  quand: string;
  fournisseur: string;
  modele: string | null;
  action: string;
  cause: string;
  /** Montant compté au plafond pour cette ligne (le maximum réservé). */
  reserve: string;
  /** Le même, en micro-unités · ce que la confirmation de R5 compare au facturé. */
  reserveMicros: number;
  /** Ce qu'il faut faire, pour CETTE ligne. */
  aFaire: string;
}

export interface EcranReconciliation {
  etat: 'vide' | 'rempli';
  /** La phrase d'état de R3 (nombre ET montant, ou le silence). */
  resume: string;
  nombre: number;
  total: string;
  /** Une ligne par fournisseur concerné · « Anthropic · 2 lignes · 0,5000 $ ». */
  parFournisseur: string[];
  lignes: LigneEcranReconciliation[];
  /** Le geste attendu, en une phrase. */
  consigne: string;
}

export const CONSIGNE_RECONCILIATION =
  'Retrouve chaque appel sur la facture du fournisseur à la date indiquée et compare au maximum réservé. Tant qu’une ligne n’est pas rapprochée, ce maximum reste compté au plafond · c’est le côté prudent. Rien sur cet écran ne modifie une ligne. Facture trouvée, réconcilie-la : montant facturé, identifiant de preuve et motif s’ajoutent à côté, et le plafond retient alors le facturé.';

export function ecranReconciliation(v: VueReconciliation): EcranReconciliation {
  const groupes = new Map<string, { n: number; usd: number }>();
  for (const l of v.lignes) {
    const f = fournisseurLisible(l.provider);
    const g = groupes.get(f) ?? { n: 0, usd: 0 };
    g.n += 1; g.usd += Math.max(0, l.actualUsd);
    groupes.set(f, g);
  }
  return {
    etat: v.lignes.length ? 'rempli' : 'vide',
    resume: v.resume,
    nombre: v.lignes.length,
    total: montantDepenseLisible(v.totalUsd),
    parFournisseur: [...groupes.entries()]
      .sort((a, b) => b[1].usd - a[1].usd || (a[0] < b[0] ? -1 : 1))
      .map(([f, g]) => `${f} · ${g.n} ligne${g.n > 1 ? 's' : ''} · ${montantDepenseLisible(g.usd)}`),
    lignes: v.lignes.map((l) => {
      const f = fournisseurLisible(l.provider);
      const quand = dateReconciliation(l.createdAt);
      const reserve = montantDepenseLisible(l.actualUsd);
      return {
        id: l.id, quand, fournisseur: f, modele: l.model, action: l.action || 'action inconnue',
        cause: l.causeLisible || 'cause non renseignée', reserve, reserveMicros: Math.max(0, Math.round(l.actualUsd * 1_000_000)),
        aFaire: `Chercher cet appel sur la facture ${f} du ${quand.slice(0, 10)} · comparer à ${reserve} comptés au plafond.`,
      };
    }),
    consigne: CONSIGNE_RECONCILIATION,
  };
}

/**
 * La ligne de rappel de l'écran Jarvis · `null` quand il n'y a rien à
 * réconcilier (le silence est la conclusion la plus fréquente).
 */
export function rappelReconciliation(v: VueReconciliation): string | null {
  if (!v.lignes.length) return null;
  return `${v.lignes.length} dépense${v.lignes.length > 1 ? 's' : ''} à réconcilier avec la facture · ${montantDepenseLisible(v.totalUsd)} comptés au maximum en attendant.`;
}
