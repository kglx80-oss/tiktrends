import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Unité de crédit ÷ 10 · la conversion des soldes est prouvée SANS PERTE sur
 * une vraie base Postgres en mémoire (pglite, migrations réelles jusqu'à
 * 0061) et par les fonctions serveur réelles (`convertirTousLesEspaces`,
 * `reserveCredits`, `refundCredits`, `allouerFormule`). On lit le RÉSULTAT ·
 * les colonnes de `workspaces` et le journal · jamais la présence d'un appel.
 *
 * Mutations faites à la main (restaurées par `git checkout --`) :
 *  · facteur 9 au lieu de 10 dans `setConversionUnite` ⇒ « espace … : 22 500 au lieu de 25 000 » ;
 *  · condition `credit_unit = 1` retirée ⇒ le second balayage multiplie encore, « idempotent » tombe ;
 *  · conversion retirée de `debiterCreditsDans` ⇒ « un débit sur un espace non converti » tombe.
 */
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq, FACTEUR_UNITE_DB, MOTIF_CONVERSION_UNITE_DB, REF_CONVERSION_UNITE_DB } from '@tiktrends/db';
import { FACTEUR_UNITE, MOTIF_CONVERSION_UNITE, REF_CONVERSION_UNITE, analyserMigrationSql, pocheAbonnement, pocheHorsAbonnement } from '@tiktrends/core';
import { allouerFormule, convertirTousLesEspaces, refundCredits, reserveCredits } from '../lib/credits';

const W = schema.workspaces;

/** Un espace dans l'ANCIENNE unité, tel que la base le contient avant cette PR. */
async function ancien(v: { solde: number; derniere?: number; essai?: number; restant?: number | null; hors?: number }): Promise<string> {
  const id = randomUUID();
  await db.insert(W).values({
    id, name: 'Ancienne unité', plan: 'core', creditUnit: 1,
    creditsBalance: v.solde, lastPlanCredits: v.derniere ?? 0, trialCredits: v.essai ?? 0, planCreditsLeft: v.restant ?? null, extraCreditsSpent: v.hors ?? 0,
  });
  return id;
}

async function lire(id: string) {
  const [w] = await db.select().from(W).where(eq(W.id, id));
  const p = { solde: w!.creditsBalance, abonnementRestant: w!.planCreditsLeft, derniereAllocation: w!.lastPlanCredits, horsAbonnementConsommes: w!.extraCreditsSpent };
  return { solde: p.solde, abonnement: pocheAbonnement(p), achetes: pocheHorsAbonnement(p), derniere: w!.lastPlanCredits, essai: w!.trialCredits, restant: w!.planCreditsLeft, hors: w!.extraCreditsSpent, unite: w!.creditUnit };
}
async function journal(id: string) {
  return db.select({ delta: schema.creditLedger.delta, reason: schema.creditLedger.reason, refId: schema.creditLedger.refId }).from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, id));
}

describe('migration 0061 · additive et rejouable', () => {
  it('aucune écriture de données au passage, aucune destruction', () => {
    const a = analyserMigrationSql(readFileSync(join(process.cwd(), '../../packages/db/drizzle/0061_unite_credits.sql'), 'utf8'));
    expect(a.ecritures).toEqual([]);
    expect(a.destructives).toEqual([]);
    expect(a.inconnues).toEqual([]);
    expect(a.rejouable).toBe(true);
  });

  it('la base et le noyau disent le même facteur et le même motif', () => {
    expect([FACTEUR_UNITE_DB, MOTIF_CONVERSION_UNITE_DB, REF_CONVERSION_UNITE_DB]).toEqual([FACTEUR_UNITE, MOTIF_CONVERSION_UNITE, REF_CONVERSION_UNITE]);
  });
});

describe('conversion des soldes ×10 · sans perte', () => {
  it('solde, crédits d’abonnement, crédits achetés, essai et journal · tout ×10', async () => {
    // Core 2 000 alloués, 500 dépensés sur l'abonnement, 1 000 achetés : 2 500 = 1 500 + 1 000.
    const a = await ancien({ solde: 2500, derniere: 2000, essai: 300, restant: 1500, hors: 0 });
    // Espace d'avant 0060 (poche jamais suivie) · 700 dont 200 hors abonnement consommés.
    const b = await ancien({ solde: 700, derniere: 2000, restant: null, hors: 200 });
    const avantA = await lire(a), avantB = await lire(b);

    expect(await convertirTousLesEspaces()).toBeGreaterThanOrEqual(2);

    const fautes: string[] = [];
    for (const [id, avant] of [[a, avantA], [b, avantB]] as const) {
      const apres = await lire(id);
      for (const k of ['solde', 'abonnement', 'achetes', 'derniere', 'essai', 'hors'] as const) {
        if (apres[k] !== avant[k] * FACTEUR_UNITE) fautes.push(`espace ${id.slice(0, 4)} · ${k} : ${apres[k].toLocaleString('fr-FR')} au lieu de ${(avant[k] * FACTEUR_UNITE).toLocaleString('fr-FR')}`);
      }
      expect(apres.unite).toBe(10);
    }
    expect(fautes).toEqual([]);
    expect((await lire(a)).restant).toBe(15000);
    expect((await lire(b)).restant).toBeNull();
    expect(await journal(a)).toEqual([{ delta: 22500, reason: MOTIF_CONVERSION_UNITE, refId: REF_CONVERSION_UNITE }]);
  });

  it('idempotent · un second balayage ne touche plus rien', async () => {
    const a = await ancien({ solde: 40, derniere: 0 });
    await convertirTousLesEspaces();
    const une = await lire(a);
    expect(await convertirTousLesEspaces()).toBe(0);
    expect(await lire(a)).toEqual(une);
    expect((await journal(a)).length).toBe(1);
  });

  it('un débit sur un espace non converti le convertit d’abord · jamais le nouveau barème sur l’ancien solde', async () => {
    const c = await ancien({ solde: 30 }); // 30 anciens = 300 nouveaux
    expect(await reserveCredits(c, 40, 'Génération image')).toBe(true); // 4 anciens = 40 nouveaux
    expect((await lire(c)).solde).toBe(260);
    const d = await ancien({ solde: 3 });
    expect(await reserveCredits(d, 40, 'Génération image')).toBe(false); // 3 anciens = 30 nouveaux < 40
    expect((await lire(d)).solde).toBe(30);
  });

  it('un remboursement et une allocation convertissent aussi d’abord', async () => {
    const e = await ancien({ solde: 10 });
    await refundCredits(e, 40, 'Remboursement');
    expect((await lire(e)).solde).toBe(140);
    const f = await ancien({ solde: 1200, derniere: 2000, restant: 200 }); // 200 d'abonnement + 1 000 achetés
    await allouerFormule(f, 20000, 'Abonnement core · allocation');
    expect(await lire(f)).toMatchObject({ solde: 30000, abonnement: 20000, achetes: 10000 });
  });

  it('un espace créé par le nouveau code est déjà dans la nouvelle unité · jamais converti', async () => {
    const id = randomUUID();
    await db.insert(W).values({ id, name: 'Nouveau', creditsBalance: 3000, trialCredits: 3000 });
    await convertirTousLesEspaces();
    expect(await lire(id)).toMatchObject({ solde: 3000, essai: 3000, unite: 10 });
    expect(await journal(id)).toEqual([]);
  });
});
