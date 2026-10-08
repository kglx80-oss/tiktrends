import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * F-A · UN seul plafond pour le web et le worker.
 *
 * Le worker des studios ne peut pas importer `lib/spend-guard.ts`. Il applique
 * la même règle par `BarriereDepenseStudio` (`@tiktrends/integrations`) sur la
 * même table, via `reserverDepense` (`@tiktrends/db`). Ce fichier le prouve AU
 * RÉSULTAT, sur la même base (pglite, migrations réelles) :
 *  · le plafond se lit pareil des deux côtés (table de valeurs) ;
 *  · la somme de la fenêtre est la même ;
 *  · une dépense du worker ferme la porte au web, et inversement.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq, reserverDepense, annulerDepense, depenseDepuis, type BaseDepense } from '@tiktrends/db';
import { plafondDepenseUsd, debutFenetrePlafond, idDepenseDuJob, ErreurFournisseurCertaine, ErreurFournisseurIncertaine } from '@tiktrends/core';
import { BarriereDepenseStudio, DepenseRefusee, type PortDepense } from '@tiktrends/integrations';
import { spendCapUsd, spendStatus, spentUsd, sousPlafond, SpendBlockedError } from '../lib/spend-guard';

const CLE = 'AI_SPEND_CAP_USD';
const avant = process.env[CLE];
afterEach(() => { if (avant === undefined) delete process.env[CLE]; else process.env[CLE] = avant; });

const ESPACE = randomUUID();
const port: PortDepense = {
  reserver: (l, o) => reserverDepense(db as unknown as BaseDepense, l, o),
  annuler: (id) => annulerDepense(db as unknown as BaseDepense, id),
};
const barriere = () => new BarriereDepenseStudio({ port, env: process.env });

describe('le plafond se lit pareil côté web et côté worker', () => {
  it.each([undefined, '', '0', '0.2', '10', '50', '100', 'beaucoup', '-5', 'NaN', 'Infinity', ' 7 ', '1e2'])('AI_SPEND_CAP_USD=%s', (v) => {
    if (v === undefined) delete process.env[CLE]; else process.env[CLE] = v;
    expect(plafondDepenseUsd(process.env[CLE])).toBe(spendCapUsd());
  });
});

describe('web + worker · une seule somme, un seul plafond', () => {
  it('la dépense du worker ferme la porte au web, et le web la ferme au worker', async () => {
    await db!.insert(schema.workspaces).values({ id: ESPACE, name: 'Plafond commun' });
    process.env[CLE] = '0.2';

    // Web : 0,08 $.
    await sousPlafond('fal_image', { workspaceId: ESPACE, action: 'fa:web' }, async () => 'ok');
    // Worker : 0,08 $ pour un job · la ligne tombe dans la même table.
    const jobA = randomUUID();
    let appelsWorker = 0;
    await barriere().sousPlafondStudio({ workspaceId: ESPACE, jobId: jobA, usd: 0.08, modele: 'fal_image' }, async () => { appelsWorker += 1; return 'ok'; });
    expect(appelsWorker).toBe(1);

    // La somme est la même des deux côtés, et elle compte les deux lignes.
    expect(await spentUsd()).toBeCloseTo(0.16, 10);
    expect(await depenseDepuis(db as unknown as BaseDepense, debutFenetrePlafond(new Date()))).toBeCloseTo(0.16, 10);
    expect((await spendStatus()).spentUsd).toBeCloseTo(0.16, 10);

    // 0,16 + 0,08 > 0,20 : le web refuse À CAUSE de la dépense du worker…
    await expect(sousPlafond('fal_image', { workspaceId: ESPACE, action: 'fa:web' }, async () => 'ne doit pas partir')).rejects.toBeInstanceOf(SpendBlockedError);
    // … et le worker refuse aussi, sans appeler le fournisseur.
    const e = await barriere().sousPlafondStudio({ workspaceId: ESPACE, jobId: randomUUID(), usd: 0.08, modele: 'fal_image' }, async () => { appelsWorker += 1; return 'ok'; }).catch((x) => x);
    expect(e).toBeInstanceOf(DepenseRefusee);
    expect(appelsWorker).toBe(1);

    // Un échec CERTAIN du worker rend sa dépense : le web peut de nouveau passer.
    const jobB = randomUUID();
    process.env[CLE] = '0.3';
    await barriere().sousPlafondStudio({ workspaceId: ESPACE, jobId: jobB, usd: 0.08, modele: 'fal_image' }, async () => { throw new ErreurFournisseurCertaine('refus 503'); }).catch(() => null);
    expect(await spentUsd()).toBeCloseTo(0.16, 10);
    process.env[CLE] = '0.2';
    await barriere().rendrePourJob(jobA);
    expect(await spentUsd()).toBeCloseTo(0.08, 10);
    await expect(sousPlafond('fal_image', { workspaceId: ESPACE, action: 'fa:web' }, async () => 'ok')).resolves.toBe('ok');

    const lignes = await db!.select().from(schema.aiSpend);
    expect(lignes.map((l) => [l.action, l.provider, l.workspaceId, l.estimatedUsd, l.actualUsd]).sort()).toEqual([
      ['fa:web', 'fal', ESPACE, 0.08, 0.08],
      ['fa:web', 'fal', ESPACE, 0.08, 0.08],
      ['studio.generation', 'fal', ESPACE, 0.08, 0],
      ['studio.generation', 'fal', ESPACE, 0.08, 0],
    ].sort());
  });

  it('une seconde réservation pour le même job est refusée en INCERTAIN, sans toucher la première ligne ni appeler', async () => {
    process.env[CLE] = '50';
    const job = randomUUID();
    await barriere().sousPlafondStudio({ workspaceId: ESPACE, jobId: job, usd: 0.08, modele: 'fal_image' }, async () => 'ok');
    let appels = 0;
    const e = await barriere().sousPlafondStudio({ workspaceId: ESPACE, jobId: job, usd: 0.08, modele: 'fal_image' }, async () => { appels += 1; return 'ok'; }).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect(appels).toBe(0);
    const lignes = await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.id, idDepenseDuJob(job)));
    expect(lignes.map((l) => l.actualUsd)).toEqual([0.08]);
  });
});
