import { describe, it, expect, vi } from 'vitest';
import { attendreEtat } from './helpers/attendre-etat';

/**
 * Contre-recette du 8 octobre (P2) · « une évaluation concurrente peut effacer
 * une révocation ». `evaluerRelease` lisait la release sans verrou puis
 * réécrivait `evaluation` depuis cette lecture : une révocation commitée entre
 * la lecture et l'UPDATE était perdue.
 *
 * Ordre FORCÉ sur Postgres réel, deux connexions :
 *  1. la connexion B pose la révocation (même verrou de ligne et même forme que
 *     `revoquerRelease`) et garde sa transaction ouverte ;
 *  2. l'évaluation part sur une autre connexion, et l'on ATTEND de la voir
 *     bloquée sur le verrou de B (`pg_blocking_pids`, vu par Postgres) ·
 *     jamais « 400 ms ont passé », un pari sur la machine qui, l'évaluation
 *     ralentie au-delà, libérait B avant qu'elle ne lise et passait au vert
 *     sans verrou ;
 *  3. B commite ; l'évaluation se termine.
 * Résultat attendu en base : l'évaluation est écrite ET la révocation est là.
 *
 * Lancé seulement si `L2_PG_URL` désigne une base locale VIDE à 55 migrations
 * (restaurée depuis le dump de recette). Sans elle, la suite est ignorée.
 */

const URL_PG = process.env.L2_PG_URL;
vi.hoisted(() => { if (process.env.L2_PG_URL) process.env.DATABASE_URL = process.env.L2_PG_URL; });

describe.skipIf(!URL_PG)('Postgres réel · révocation pendant une évaluation', () => {
  it('révocation commitée pendant l’évaluation ⇒ ni perdue ni écrasée', async () => {
    const depot = await import('../lib/studios/prompts/depot-prompts');
    const { acteurPlateforme } = await import('./l2-outils');
    const { db, schema, eq, sql } = await import('@tiktrends/db');
    const A = acteurPlateforme();
    const R = schema.studioPromptReleases;
    const lignes = (r: unknown) => (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;

    const imp = await depot.importerPack(A);
    expect(imp.ok).toBe(true);
    for (const l of await depot.listerVersions()) if (l.status === 'draft') expect((await depot.validerVersion(A, { id: l.id })).ok).toBe(true);

    for (let manche = 0; manche < 3; manche++) {
      const base = (await depot.listerVersions()).filter((l) => l.key === 'photo_clean' && l.status === 'validated').sort((x, y) => y.version - x.version)[0]!;
      const b = await depot.enregistrerBrouillon(A, { baseId: base.id, champs: { lighting: `lumière ${manche}` }, motif: `course ${manche}` });
      if (!b.ok) throw new Error(JSON.stringify(b));
      expect((await depot.validerVersion(A, { id: b.id })).ok).toBe(true);
      const rel = await depot.creerRelease(A, { motif: `course ${manche}` });
      if (!rel.ok) throw new Error(JSON.stringify(rel));

      let liberer!: () => void;
      const tenue = new Promise<void>((r) => { liberer = r; });
      let verrouPris!: (pid: number) => void;
      const pris = new Promise<number>((r) => { verrouPris = r; });
      const revocation = db.transaction(async (tx) => {
        const pid = Number(lignes(await tx.execute(sql`select pg_backend_pid() as pid`))[0]!.pid);
        await tx.select({ id: R.id }).from(R).where(eq(R.id, rel.id)).for('update');
        await tx.update(R).set({
          evaluation: sql`coalesce(${R.evaluation}, '{}'::jsonb) || ${JSON.stringify({ revocation: { motif: `course ${manche}`, par: A.userId, le: new Date().toISOString() } })}::jsonb`,
        }).where(eq(R.id, rel.id));
        verrouPris(pid);
        await tenue;
      });
      const pidB = await pris;
      let evaluationFinie = false;
      const evaluation = depot.evaluerRelease(A, { releaseId: rel.id }).finally(() => { evaluationFinie = true; });
      // L'état attendu · l'évaluation est BLOQUÉE sur le verrou de ligne de B (son `SELECT … FOR UPDATE`, ou,
      // sans lui, son UPDATE), vu par Postgres. « Déjà finie » conclut aussi · les constats ci-dessous disent ce qu'elle a écrit.
      await attendreEtat(`manche ${manche} · l’évaluation attend le verrou de la révocation (ou elle est déjà finie)`, async () => {
        const n = Number(lignes(await db.execute(sql`select count(*)::int as n from pg_stat_activity where ${pidB} = any(pg_blocking_pids(pid))`))[0]!.n);
        return n > 0 || evaluationFinie;
      });
      liberer();
      await revocation;
      const ev = await evaluation;
      expect(ev.ok, JSON.stringify(ev)).toBe(true);

      const [l] = await db.select().from(R).where(eq(R.id, rel.id));
      const e = l!.evaluation as { revocation?: { motif: string }; evaluationId?: string };
      expect(e.evaluationId, `manche ${manche} · évaluation non écrite`).toBe(ev.ok ? ev.evaluationId : '');
      expect(e.revocation?.motif, `manche ${manche} · la révocation a été effacée par l’évaluation`).toBe(`course ${manche}`);
    }
  }, 60_000);
});
