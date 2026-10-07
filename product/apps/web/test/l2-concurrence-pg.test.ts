import { describe, it, expect, vi } from 'vitest';

/**
 * Concurrence RÉELLE · Postgres 16 local, plusieurs connexions (pool du pilote).
 *
 * pglite n'a qu'une connexion : deux transactions y passent l'une après
 * l'autre. Ici, deux imports et deux publications partent EN MÊME TEMPS sur
 * deux connexions ; on vérifie en base qu'un seul a écrit (verrou consultatif,
 * verrou de ligne du pointeur, compare-and-set sur `row_version`).
 *
 * Lancé seulement si `L2_PG_URL` désigne une base locale VIDE à 55 migrations
 * (restaurée depuis le dump de recette). Sans elle, la suite est ignorée.
 */

const URL_PG = process.env.L2_PG_URL;
vi.hoisted(() => { if (process.env.L2_PG_URL) process.env.DATABASE_URL = process.env.L2_PG_URL; });

describe.skipIf(!URL_PG)('Postgres réel · deux connexions', () => {
  it('deux imports simultanés · un seul écrit, aucun doublon', async () => {
    const depot = await import('../lib/studios/prompts/depot-prompts');
    const { acteurPlateforme } = await import('./l2-outils');
    const { db, schema } = await import('@tiktrends/db');
    const [a, b] = await Promise.all([depot.importerPack(acteurPlateforme()), depot.importerPack(acteurPlateforme())]);
    const crees = [a, b].map((r) => (r.ok ? r.crees : -1)).sort();
    expect(crees).toEqual([0, 33]);
    expect((await db.select().from(schema.studioPromptVersions)).length).toBe(33);
  });

  it('deux publications simultanées sur la même attente · une seule déplace le pointeur', async () => {
    const depot = await import('../lib/studios/prompts/depot-prompts');
    const { acteurPlateforme } = await import('./l2-outils');
    const A = acteurPlateforme();
    for (const l of await depot.listerVersions()) if (l.status === 'draft') expect((await depot.validerVersion(A, { id: l.id })).ok).toBe(true);
    const ids: string[] = [];
    for (const eclairage of ['chaud', 'froid']) {
      const base = (await depot.listerVersions()).filter((l) => l.key === 'photo_clean' && l.status === 'validated').sort((x, y) => y.version - x.version)[0]!;
      const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { lighting: `lumière ${eclairage}` }, motif: 'concurrence' });
      if (!b.ok) throw new Error(JSON.stringify(b));
      expect((await depot.validerVersion(A, { id: b.id })).ok).toBe(true);
      const r = await depot.creerRelease(A, { motif: eclairage });
      if (!r.ok) throw new Error(JSON.stringify(r));
      expect((await depot.evaluerRelease(A, { releaseId: r.id })).ok).toBe(true);
      ids.push(r.id);
    }
    const [x, y] = await Promise.all(ids.map((id) => depot.publierRelease(A, { releaseId: id, attendue: null, environnement: 'test' })));
    expect([x!.ok, y!.ok].filter(Boolean)).toHaveLength(1);
    const perdant = x!.ok ? y! : x!;
    expect(!perdant.ok && perdant.constats.map((c) => c.code)).toContain('VERSION_CONFLICT');
    const p = await depot.lirePointeur();
    expect(p?.rowVersion).toBe(0);
    expect(ids).toContain(p?.releaseId);

    // Rollback et publication concurrents sur la même attente · un seul gagne.
    const gagnant = p!.releaseId;
    const autre = ids.find((i) => i !== gagnant)!;
    const [u, v] = await Promise.all([
      depot.publierRelease(A, { releaseId: autre, attendue: gagnant, environnement: 'test' }),
      depot.publierRelease(A, { releaseId: autre, attendue: gagnant, environnement: 'test' }),
    ]);
    expect([u.ok, v.ok].filter(Boolean)).toHaveLength(1);
    expect((await depot.lirePointeur())?.rowVersion).toBe(1);
  });
});
