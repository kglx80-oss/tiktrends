import { describe, it, expect, vi, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Lot F-D · consigne de la contre-recette du 8 octobre (P2) : réévaluer ou
 * approuver le benchmark d'une release RÉVOQUÉE laisse la révocation intacte.
 * Vraie base (pglite) ; la course réelle sur deux connexions est éprouvée par
 * `fd-revocation-pg.test.ts`.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { acteurPlateforme } from './l2-outils';
import { releaseApprouvable } from './fd-revocation-outils';

const ADMIN = randomUUID();
let rel: { releaseId: string; evaluationId: string };
const revocation = async () => ((await depot.lireReleaseParId(rel.releaseId))!.evaluation as { revocation?: unknown } | null)?.revocation;

beforeAll(async () => {
  await db.insert(schema.users).values({ id: ADMIN, email: 'admin-revocation@studios.test' });
  rel = await releaseApprouvable(ADMIN, 'garde de révocation');
}, 60_000);

describe('révocation · jamais effacée par une évaluation ni par le geste « benchmark approuvé »', () => {
  it('contrôle positif : la même préparation, NON révoquée, est approuvée (la garde regarde le bon geste)', async () => {
    const temoin = await releaseApprouvable(ADMIN, 'témoin non révoqué');
    const a = await depot.approuverBenchmark(acteurPlateforme(ADMIN), { releaseId: temoin.releaseId, evaluationId: temoin.evaluationId, motif: 'Fiches relues' });
    expect(a).toMatchObject({ ok: true });
    expect((await depot.lireReleaseParId(temoin.releaseId))!.evaluation).toMatchObject({ benchmarkApprouve: true });
  });

  it('révoquée : le geste est refusé, la réévaluation passe, la révocation reste à l’identique', async () => {
    const r = await depot.revoquerRelease(acteurPlateforme(ADMIN), { releaseId: rel.releaseId, motif: 'Fuite de consigne découverte' });
    expect(r).toMatchObject({ ok: true, deja: false });
    const avant = await revocation();
    expect(avant).toMatchObject({ motif: 'Fuite de consigne découverte', par: ADMIN });

    const a = await depot.approuverBenchmark(acteurPlateforme(ADMIN), { releaseId: rel.releaseId, evaluationId: rel.evaluationId, motif: 'Fiches relues' });
    expect(a.ok ? [] : a.constats.map((c) => c.code)).toEqual(['RELEASE_REVOQUEE']);
    expect(await revocation()).toEqual(avant);

    const ev = await depot.evaluerRelease(acteurPlateforme(ADMIN), { releaseId: rel.releaseId });
    expect(ev.ok).toBe(true);
    expect(await revocation()).toEqual(avant);
    expect(((await depot.lireReleaseParId(rel.releaseId))!.evaluation as { benchmarkApprouve?: boolean }).benchmarkApprouve).toBe(false);
  });
});
