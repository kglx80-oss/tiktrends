import { describe, it, expect, vi, afterAll } from 'vitest';

/**
 * R6 · le REGISTRE du budget d'essai (`scripts/recette/registre.ts`) lit les
 * réconciliations (R5, `ai_spend_reconciliations`, 0056).
 *
 * Le défaut réparé : `lireBaseDepuis` ne joignait pas la table ; une ligne
 * réconciliée par le propriétaire restait « à réconcilier », comptée au
 * maximum réservé, et l'engagement incertain qui la portait aussi. La facture
 * saisie ne libérait rien des 15 $.
 *
 * Vraie base (pglite, migrations réelles dont 0056), vraie fonction de
 * réconciliation (`reconcilierDepense` + décision du noyau), vrai registre sur
 * disque (engagement, clôture sous verrou). On lit le BILAN et le TEXTE de
 * `recette:budget`, jamais la présence d'un appel.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, schema, reconcilierDepense, type BaseDepense } from '@tiktrends/db';
import { decisionReconciliation } from '@tiktrends/core';
import { cloreEssai, ecrireRegistre, engagerEssai, lireBaseDepuis, lireEtatEssai, registreVierge, texteBilan } from '../scripts/recette/registre';
import { sousVerrou } from '../scripts/recette/verrou';

const dossiers: string[] = [];
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });
const auteur = randomUUID();
const base = () => db as unknown as BaseDepense;

async function registre(): Promise<string> {
  const d = mkdtempSync(join(tmpdir(), 'r6-registre-'));
  dossiers.push(d);
  await sousVerrou(d, (v) => ecrireRegistre(d, registreVierge(new Date('2026-10-09T09:00:00Z')), v));
  return d;
}
async function ligne(o: { provider: string; usd: number; cause?: string; tokens?: number; le: Date }): Promise<string> {
  const [l] = await db!.insert(schema.aiSpend).values({
    provider: o.provider, model: o.provider === 'fal' ? 'fal_image' : 'claude-sonnet-5', action: 'r6:essai', estimatedUsd: o.usd, actualUsd: o.usd,
    inputTokens: o.tokens ?? null, outputTokens: o.tokens ?? null, reconcileReason: o.cause ?? null, createdAt: o.le,
  }).returning();
  return l!.id;
}
async function reconcilier(aiSpendId: string, billedMicros: number) {
  const r = await reconcilierDepense(base(), {
    aiSpendId, billedMicros, currency: 'USD', providerRef: 'inv_r6_registre', reason: 'appel retrouvé sur la facture', authorId: auteur, idempotencyKey: `cle-${randomUUID()}`,
  }, (e) => decisionReconciliation(e, aiSpendId));
  expect(r).toMatchObject({ ok: true, statut: 'creee' });
}

describe('R6 · registre d’essai et réconciliations', () => {
  it('la lecture de la base porte le facturé ; la ligne réconciliée est comptée au facturé, le restant suit', async () => {
    await db!.insert(schema.users).values({ id: auteur, email: `fondateur-${auteur}@r6.exemple.test` });
    const d = await registre();
    const le = new Date('2026-10-09T09:30:00Z');
    const image = await ligne({ provider: 'fal', usd: 0.08, le });
    const vision = await ligne({ provider: 'anthropic', usd: 0.147024, cause: 'coupure', le: new Date(le.getTime() + 1_000) });

    const avant = await lireEtatEssai(d, new Date('2026-10-09T10:00:00Z'), () => lireBaseDepuis(db!));
    if (!avant.ok) throw new Error(avant.raison);
    expect([avant.bilan.regleMicros, avant.bilan.incertainMicros]).toEqual([80_000, 147_024]);

    await reconcilier(vision, 90_000);
    const lu = await lireBaseDepuis(db!);
    expect(lu.lignes.map((l) => [l.id === image, l.factureMicros])).toEqual([[true, null], [false, 90_000]]);
    expect(lu.depenseFenetreUsd, 'la somme de la fenêtre ne retient pas le facturé, comme le plafond commun').toBeCloseTo(0.17, 9);

    const apres = await lireEtatEssai(d, new Date('2026-10-09T10:01:00Z'), async () => lu);
    if (!apres.ok) throw new Error(apres.raison);
    expect([apres.bilan.regleMicros, apres.bilan.incertainMicros], 'la ligne réconciliée reste comptée au maximum dans le budget d’essai').toEqual([170_000, 0]);
    expect(apres.bilan.restantMicros - avant.bilan.restantMicros).toBe(57_024);
    expect(apres.registre.lignes[vision]).toMatchObject({ etat: 'reconciliee', regleMicros: 90_000, incertainMicros: 0, factureMicros: 90_000, actualMicros: 147_024 });
    const texte = texteBilan(apres.registre, apres.bilan);
    expect(texte).toContain(`- ${vision} · anthropic · r6:essai · réservé 0,1470 $ → facturé 0,0900 $`);
    expect(texte).not.toContain('à réconcilier :');
  });

  it('engagement INCERTAIN (E3) · au maximum tant qu’une ligne reste à réconcilier, au facturé quand toutes le sont', async () => {
    const d = await registre();
    const total = (x: { anterieuresMicros: number; regleMicros: number; incertainMicros: number }) => x.anterieuresMicros + x.regleMicros + x.incertainMicros;
    // Les lignes du cas précédent restent en base (réconciliations en ajout seul) : on compte à partir d'elles.
    const depart = await lireEtatEssai(d, new Date('2026-10-09T10:59:00Z'), () => lireBaseDepuis(db!));
    if (!depart.ok) throw new Error(depart.raison);
    const fond = total(depart.bilan);
    const t0 = new Date('2026-10-09T11:00:00Z');
    const g = await engagerEssai(d, { commande: 'recette:pas1', reservationMicros: 1_000_000, lu: await lireBaseDepuis(db!), maintenant: t0 });
    if (!g.ok) throw new Error(g.raison);
    const a = await ligne({ provider: 'anthropic', usd: 0.3, cause: 'coupure', le: new Date('2026-10-09T11:00:01Z') });
    const b = await ligne({ provider: 'anthropic', usd: 0.2, cause: 'service', le: new Date('2026-10-09T11:00:02Z') });
    const c = await cloreEssai(d, g.engagement.id, { etat: 'incertain', cause: 'commande interrompue' }, { lecteur: () => lireBaseDepuis(db!), maintenant: new Date('2026-10-09T11:01:00Z') });
    if (!c.ok) throw new Error(c.raison);
    expect(c.engagement.etat).toBe('incertain');
    expect(total(c.bilan) - fond).toBe(1_000_000);

    await reconcilier(a, 100_000);
    const partiel = await lireEtatEssai(d, new Date('2026-10-09T11:02:00Z'), () => lireBaseDepuis(db!));
    if (!partiel.ok) throw new Error(partiel.raison);
    expect(total(partiel.bilan) - fond, 'un engagement incertain PARTIELLEMENT réconcilié est descendu sous son maximum').toBe(1_000_000);
    // Réservation qui ne tient que si l'engagement compte le facturé (0,15 $) et non son maximum (1 $).
    const juste = 15_000_000 - fond - 150_000;
    const refus = await engagerEssai(d, { commande: 'recette:bench', reservationMicros: juste, lu: await lireBaseDepuis(db!), maintenant: new Date('2026-10-09T11:02:30Z') });
    expect(refus.ok, 'le maximum d’un engagement non entièrement réconcilié n’est plus compté').toBe(false);

    await reconcilier(b, 50_000);
    const fini = await lireEtatEssai(d, new Date('2026-10-09T11:03:00Z'), () => lireBaseDepuis(db!));
    if (!fini.ok) throw new Error(fini.raison);
    expect(total(fini.bilan) - fond, 'l’engagement incertain entièrement réconcilié reste compté au maximum').toBe(150_000);
    expect(fini.bilan.incertainMicros).toBe(0);
    expect(texteBilan(fini.registre, fini.bilan)).toContain(`${g.engagement.id} · recette:pas1 · 1,0000 $ · commande interrompue`);
    expect(texteBilan(fini.registre, fini.bilan)).toContain('lignes toutes réconciliées, compté au facturé');

    // La décision suit : la réservation que le maximum refusait passe une fois la facture saisie.
    const r = await engagerEssai(d, { commande: 'recette:bench', reservationMicros: juste, lu: await lireBaseDepuis(db!), maintenant: new Date('2026-10-09T11:04:00Z') });
    expect(r.ok, r.ok ? '' : r.raison).toBe(true);
  });
});
