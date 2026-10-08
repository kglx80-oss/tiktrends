import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Lot F-D · contre-recette du 8 octobre (P2) sur Postgres RÉEL, deux connexions.
 *
 * La course : une révocation est en cours (ligne verrouillée, révocation
 * écrite, transaction pas encore validée) quand le geste « benchmark approuvé »
 * part. Sans verrou de ligne AVANT la lecture, le geste lit l'ancienne ligne
 * (sans révocation), attend sur l'UPDATE, puis écrase la révocation validée
 * entre-temps. Avec `SELECT … FOR UPDATE` en tête, il attend, relit la ligne
 * révoquée, et refuse : la révocation reste.
 *
 * Lancé seulement si `FD_PG_URL` désigne une base locale VIDE à 55 migrations
 * (restaurée depuis le dump de recette). Sans elle, la suite est ignorée.
 */

const URL_PG = process.env.FD_PG_URL;
vi.hoisted(() => { if (process.env.FD_PG_URL) process.env.DATABASE_URL = process.env.FD_PG_URL; });

describe.skipIf(!URL_PG)('Postgres réel · révocation concurrente du geste « benchmark approuvé »', () => {
  it('la révocation validée pendant le geste n’est jamais effacée', async () => {
    const depot = await import('../lib/studios/prompts/depot-prompts');
    const { db, schema, eq } = await import('@tiktrends/db');
    const { acteurPlateforme } = await import('./l2-outils');
    const { releaseApprouvable } = await import('./fd-revocation-outils');
    const ADMIN = randomUUID();
    await db.insert(schema.users).values({ id: ADMIN, email: `admin-${ADMIN}@studios.test` });
    const rel = await releaseApprouvable(ADMIN, 'course de révocation');
    const R = schema.studioPromptReleases;

    let lacher!: () => void;
    const porte = new Promise<void>((r) => { lacher = r; });
    let verrouille!: () => void;
    const pris = new Promise<void>((r) => { verrouille = r; });
    // Connexion 1 · la révocation, retenue avant sa validation.
    const revocation = db.transaction(async (tx) => {
      const [l] = await tx.select().from(R).where(eq(R.id, rel.releaseId)).for('update');
      const evaluation = { ...(l!.evaluation as Record<string, unknown>), revocation: { motif: 'Révocation concurrente', par: ADMIN, le: new Date().toISOString() } };
      await tx.update(R).set({ evaluation }).where(eq(R.id, rel.releaseId));
      verrouille();
      await porte;
    });
    await pris;
    // Connexion 2 · le geste part pendant que la révocation tient la ligne.
    const geste = depot.approuverBenchmark(acteurPlateforme(ADMIN), { releaseId: rel.releaseId, evaluationId: rel.evaluationId, motif: 'Fiches relues' });
    await new Promise((r) => setTimeout(r, 400));
    lacher();
    await revocation;
    const r = await geste;

    const fin = (await depot.lireReleaseParId(rel.releaseId))!.evaluation as { revocation?: { motif: string }; benchmarkApprouve?: boolean };
    expect(fin.revocation?.motif, 'la révocation a été effacée par le geste').toBe('Révocation concurrente');
    expect(r.ok ? [] : r.constats.map((c) => c.code)).toEqual(['RELEASE_REVOQUEE']);
    expect(fin.benchmarkApprouve).toBe(false);
  }, 120_000);
});
