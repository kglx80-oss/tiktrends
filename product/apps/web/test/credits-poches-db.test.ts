import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Poches de crédits · l'allocation mensuelle ne mange plus les crédits achetés.
 *
 * Défaut (audit crédits du 29/10, incohérence 6) : `applyPlanAllocation`
 * recevait la DERNIÈRE ALLOCATION et comptait comme « achetés » le solde au-delà.
 * Core 2 000 + recharge 1 000 = 3 000, le client dépense 500, il reste 2 500 ;
 * au renouvellement il gardait 500 achetés au lieu de 1 000 · 500 crédits payés
 * perdus.
 *
 * Tout passe ici par une VRAIE base Postgres en mémoire (pglite, migrations
 * réelles jusqu'à 0060) et par les fonctions serveur réelles (`reserveCredits`,
 * `refundCredits`, `allouerFormule`). On lit le RÉSULTAT · les colonnes de la
 * ligne `workspaces` · jamais la présence d'un appel. Puis une suite d'opérations
 * pseudo-aléatoires compare la base aux règles pures du noyau, pas à pas : le
 * miroir SQL (`packages/db/src/poches-credits.ts`) ne peut pas s'écarter de la
 * règle (`packages/core/src/credits.ts`) sans faire tomber la garde.
 *
 * Mutations faites à la main (restaurées par `git checkout --`) :
 *  · `allouerFormule` repasse `derniereAllocation` au lieu de la poche restante
 *    (l'ancienne formule) ⇒ « recharge payée conservée » tombe : 2 500 au lieu de 3 000 ;
 *  · le débit SQL prend la poche hors abonnement d'abord ⇒ « le débit consomme
 *    l'abonnement d'abord » et la comparaison au noyau tombent ;
 *  · le remboursement SQL rend tout à l'abonnement ⇒ « rendu dans l'ordre inverse » tombe.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq, sql } from '@tiktrends/db';
import { allouerPoches, debiterPoches, rembourserPoches, pocheAbonnement, pocheHorsAbonnement, type PochesCredits } from '@tiktrends/core';
import { reserveCredits, refundCredits, allouerFormule } from '../lib/credits';

const W = schema.workspaces;

async function espace(valeurs: Partial<typeof W.$inferInsert> = {}): Promise<string> {
  const id = randomUUID();
  await db.insert(W).values({ id, name: 'Poches', plan: 'core', creditsBalance: 0, ...valeurs });
  return id;
}

async function poches(id: string): Promise<PochesCredits> {
  const [w] = await db.select({ solde: W.creditsBalance, restant: W.planCreditsLeft, derniere: W.lastPlanCredits, hors: W.extraCreditsSpent }).from(W).where(eq(W.id, id));
  return { solde: w!.solde, abonnementRestant: w!.restant, derniereAllocation: w!.derniere, horsAbonnementConsommes: w!.hors };
}

/** Lecture humaine d'un espace · solde, poche d'abonnement, poche hors abonnement. */
async function lire(id: string) {
  const p = await poches(id);
  return { solde: p.solde, abonnement: pocheAbonnement(p), achetes: pocheHorsAbonnement(p) };
}

/** Le chemin du webhook pour une recharge payée (`runIntent`, intention `topup`) : le solde seul monte. */
async function recharger(id: string, credits: number) {
  await db.update(W).set({ creditsBalance: sql`${W.creditsBalance} + ${credits}` }).where(eq(W.id, id));
}

describe('allocation mensuelle · les crédits achetés restent', () => {
  it('1 000 crédits achetés + allocation Core : après dépense et renouvellement, les 1 000 achetés sont intacts', async () => {
    const id = await espace();
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    await recharger(id, 1000);
    expect(await lire(id)).toEqual({ solde: 3000, abonnement: 2000, achetes: 1000 });

    expect(await reserveCredits(id, 500, 'Dépense du mois')).toBe(true);
    expect(await lire(id), 'les 500 sont pris sur l’abonnement').toEqual({ solde: 2500, abonnement: 1500, achetes: 1000 });

    const r = await allouerFormule(id, 2000, 'Abonnement core · allocation');
    expect(r?.purchased).toBe(1000);
    expect(await lire(id), 'recharge payée conservée au renouvellement').toEqual({ solde: 3000, abonnement: 2000, achetes: 1000 });
    const journal = await db.select({ delta: schema.creditLedger.delta }).from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, id));
    expect(journal.map((l) => l.delta), 'allocation, dépense, renouvellement · chaque mouvement au registre').toEqual([2000, -500, 500]);
  });

  it('un changement de formule garde aussi les crédits achetés (Core → Plus, puis Plus → Core)', async () => {
    const id = await espace();
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    await recharger(id, 1000);
    await reserveCredits(id, 1200, 'Dépense');
    await allouerFormule(id, 7000, 'Changement de formule -> plus');
    expect(await lire(id)).toEqual({ solde: 8000, abonnement: 7000, achetes: 1000 });
    await allouerFormule(id, 2000, 'Changement de formule -> core');
    expect(await lire(id)).toEqual({ solde: 3000, abonnement: 2000, achetes: 1000 });
  });
});

describe('ordre de débit · l’abonnement d’abord, les crédits achetés ensuite', () => {
  it('le débit consomme l’abonnement d’abord, puis seulement le surplus sur les achetés', async () => {
    const id = await espace();
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    await recharger(id, 1000);
    await reserveCredits(id, 300, 'Petit débit');
    expect(await lire(id)).toEqual({ solde: 2700, abonnement: 1700, achetes: 1000 });
    await reserveCredits(id, 2000, 'Gros débit');
    expect(await lire(id), '1 700 pris sur l’abonnement, 300 sur les achetés').toEqual({ solde: 700, abonnement: 0, achetes: 700 });
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    expect(await lire(id), 'les 700 achetés restants passent le renouvellement').toEqual({ solde: 2700, abonnement: 2000, achetes: 700 });
  });

  it('remboursement rendu dans l’ordre inverse · d’abord les achetés pris, puis l’abonnement', async () => {
    const id = await espace();
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    await recharger(id, 1000);
    await reserveCredits(id, 1800, 'Réserve A');
    await reserveCredits(id, 500, 'Réserve B');
    expect(await lire(id)).toEqual({ solde: 700, abonnement: 0, achetes: 700 });
    await refundCredits(id, 500, 'Annulation B');
    expect(await lire(id), 'B avait pris 300 achetés et 200 d’abonnement').toEqual({ solde: 1200, abonnement: 200, achetes: 1000 });
    await refundCredits(id, 1800, 'Annulation A');
    expect(await lire(id), 'rien ne change de poche : réserver puis annuler ne rend pas l’abonnement permanent').toEqual({ solde: 3000, abonnement: 2000, achetes: 1000 });
  });

  it('solde insuffisant · rien ne bouge, ni le solde ni les poches', async () => {
    const id = await espace();
    await allouerFormule(id, 100, 'Abonnement · allocation');
    const avant = await poches(id);
    expect(await reserveCredits(id, 101, 'Trop cher')).toBe(false);
    expect(await poches(id)).toEqual(avant);
  });
});

describe('espaces d’avant la migration 0060 · même lecture qu’avant', () => {
  it('poche jamais suivie (null) · on retombe sur min(dernière allocation, solde)', async () => {
    const id = await espace({ creditsBalance: 2600, lastPlanCredits: 2000 });
    expect((await poches(id)).abonnementRestant).toBeNull();
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    expect(await lire(id)).toEqual({ solde: 2600, abonnement: 2000, achetes: 600 });
  });

  it('crédits d’essai · conservés au premier abonnement, comme avant (décision de Kevin à part)', async () => {
    const id = await espace({ creditsBalance: 300, trialCredits: 300 });
    await allouerFormule(id, 2000, 'Abonnement core · allocation');
    expect(await lire(id)).toEqual({ solde: 2300, abonnement: 2000, achetes: 300 });
  });
});

describe('la base suit la règle du noyau, opération par opération', () => {
  it('300 opérations pseudo-aléatoires · solde et poches identiques à la règle pure', async () => {
    const id = await espace({ creditsBalance: 150, lastPlanCredits: 0 });
    let attendu = await poches(id);
    let graine = 42;
    const hasard = (n: number) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % n; };
    for (let i = 0; i < 300; i++) {
      const op = hasard(10);
      if (op < 5) {
        const c = 1 + hasard(400);
        const ok = await reserveCredits(id, c, `débit ${i}`);
        const r = debiterPoches(attendu, c);
        expect(ok, `op ${i} · débit ${c} accepté ?`).toBe(r !== null);
        if (r) attendu = r;
      } else if (op < 8) {
        const m = 1 + hasard(300);
        await refundCredits(id, m, `remboursement ${i}`);
        attendu = rembourserPoches(attendu, m);
      } else if (op < 9) {
        const m = 1 + hasard(500);
        await recharger(id, m);
        attendu = { ...attendu, solde: attendu.solde + m };
      } else {
        const a = [0, 200, 2000, 7000][hasard(4)]!;
        await allouerFormule(id, a, `allocation ${i}`);
        attendu = allouerPoches(attendu, a).poches;
      }
      const base = await poches(id);
      expect([base.solde, pocheAbonnement(base), pocheHorsAbonnement(base), base.horsAbonnementConsommes], `op ${i}`)
        .toEqual([attendu.solde, pocheAbonnement(attendu), pocheHorsAbonnement(attendu), attendu.horsAbonnementConsommes]);
    }
  });
});
