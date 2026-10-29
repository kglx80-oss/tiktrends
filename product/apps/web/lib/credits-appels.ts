import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { debitApresAppel, formatCredits, regimeTarifaire, tarifsV2Actifs, type RegimeTarifaire } from '@tiktrends/core';
import { refundCredits, reserveCredits, unlimitedCredits } from './credits';

/**
 * Facturation en crédits des appels IA aujourd'hui gratuits (décision du 29/10,
 * point 4) · conversation Jarvis, appels texte des Studios, contrôle visuel,
 * radar, brouillon de concept, relecture.
 *
 * Le régime (`regimeTarifaire`) vaut `actuel` tant que l'interrupteur
 * `TARIFS_V2` n'est pas posé ou que l'espace n'est pas sur un forfait V2 ·
 * l'appel reste alors INCLUS, rien n'est réservé (comportement d'aujourd'hui).
 *
 * En `v2` · le prix annoncé AVANT le clic est RÉSERVÉ (même mécanisme que les
 * autres actions, `reserveCredits`), l'appel part, puis le débit est AJUSTÉ au
 * coût réel (`debitApresAppel`, jamais plus que l'annonce) et le reste rendu.
 * Un appel qui échoue rend tout. Le plafond interne en dollars (`sousPlafond`)
 * reste au-dessus, invisible du client.
 */

/** Le régime d'un espace, depuis sa session (le plan y est déjà lu). */
export function regimeSession(s: { plan: string }): RegimeTarifaire {
  return regimeTarifaire(s.plan, tarifsV2Actifs(process.env));
}

/** Le régime d'un espace, lu en base (worker, résolveur · sans session). */
export async function regimeEspace(workspaceId: string): Promise<RegimeTarifaire> {
  if (!tarifsV2Actifs(process.env) || !db) return 'actuel';
  const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  return regimeTarifaire(w?.plan, true);
}

export interface ReservationAppel {
  /** Crédits réservés (0 = inclus ou illimité · rien à régler). */
  reserve: number;
  /** Règle la réservation au coût réel (dollars) · rend le surplus. Idempotent. */
  regler: (coutReelUsd: number | null) => Promise<void>;
  /** Rend toute la réservation (l'appel n'a rien produit). Idempotent. */
  annuler: () => Promise<void>;
}

const RIEN: ReservationAppel = { reserve: 0, regler: async () => {}, annuler: async () => {} };

/**
 * Réserve le prix annoncé d'un appel · `annonce` null = inclus. Rend `null` si
 * le solde ne suffit pas (rien n'est réservé, l'appel ne doit pas partir).
 */
export async function reserverAppel(o: { workspaceId: string; email?: string | null; annonce: number | null; raison: string; ref?: string | null }): Promise<ReservationAppel | null> {
  if (o.annonce === null || o.annonce <= 0 || unlimitedCredits(o.email)) return RIEN;
  const annonce = o.annonce;
  if (!(await reserveCredits(o.workspaceId, annonce, o.raison, o.ref ?? null))) return null;
  let fait = false;
  return {
    reserve: annonce,
    regler: async (cout) => {
      if (fait) return; fait = true;
      const rendu = annonce - debitApresAppel(annonce, cout);
      if (rendu > 0) await refundCredits(o.workspaceId, rendu, `Ajustement au coût réel · ${o.raison}`, o.ref ?? null);
    },
    annuler: async () => {
      if (fait) return; fait = true;
      await refundCredits(o.workspaceId, annonce, `Remboursement · ${o.raison}`, o.ref ?? null);
    },
  };
}

/** Le refus d'un appel faute de crédits · le prix dit en crédits. */
export function refusCreditsAppel(annonce: number): string {
  return `Crédits insuffisants · cet appel en demande ${formatCredits(annonce)}. Recharge depuis Réglages · Forfaits.`;
}
