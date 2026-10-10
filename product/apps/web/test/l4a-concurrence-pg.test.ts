import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';

/**
 * L4-A · concurrence RÉELLE sur Postgres 16 · DEUX connexions distinctes (pglite
 * sérialise tout et ne prouve rien ici). Lancé seulement si `L4A_PG_URL`
 * désigne une base LOCALE ; sinon ignoré (la CI n'a pas de Postgres).
 *
 *   L4A_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_l4a \
 *   L4A_JOURNAL=/chemin/journal.json pnpm exec vitest run test/l4a-concurrence-pg.test.ts
 *
 * FLOW-06 · deux onglets appliquent deux propositions sur la MÊME version de
 * base, en même temps : une seule nouvelle version, l'autre onglet reçoit 409
 * avec les différences, jamais d'écrasement silencieux.
 * Double clic sur deux connexions · la même proposition appliquée deux fois en
 * même temps : une version, la seconde réponse dit « déjà appliquée ».
 *
 * Réécrit des lignes immuables : restaurer la base ensuite (`pg_restore --clean`).
 */

const URL_PG = process.env.L4A_PG_URL ?? '';
const LOCALE = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);
const MANCHES = 15;

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import { schema, sql, eq } from '@tiktrends/db';
import type { ContenuVersion } from '@tiktrends/core';
import { semer, idsStudios } from './studios-semis';
import { ctxDe, projetVideo } from './l4a-outils';
import { creerPropositionManuelle } from '../lib/studios/propositions/proposer';
import { appliquerProposition } from '../lib/studios/propositions/depot-propositions';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = idsStudios();
let c1: BaseStudio;
let c2: BaseStudio;
const journal: unknown[] = [];

async function connexion(): Promise<BaseStudio> {
  vi.resetModules();
  process.env.DATABASE_URL = URL_PG;
  const m = await import('@tiktrends/db');
  delete process.env.DATABASE_URL;
  return m.db as BaseStudio;
}

async function pid(b: BaseStudio): Promise<number> {
  const r = await b.transaction(async (tx) => tx.execute(sql`select pg_backend_pid() as pid`));
  const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ pid: number }>;
  return Number(rows[0]!.pid);
}

async function proposer(b: BaseStudio, projectId: string, versionId: string, narration: string): Promise<string> {
  const m = await creerPropositionManuelle(ctxDe(ids, 'ua'), {
    projectId, baseVersionId: versionId, cible: 'shot:s_produit',
    changes: [{ op: 'replace', path: '/shots/byId/s_produit/narration', newValue: narration, reason: 'onglet' }],
  }, b);
  if (!m.ok || m.statut !== 'proposee') throw new Error(JSON.stringify(m));
  return m.proposition.id;
}

describe.skipIf(!LOCALE)('Postgres réel · deux connexions', () => {
  beforeAll(async () => {
    c1 = await connexion();
    c2 = await connexion();
    await semer(c1, schema, ids);
  });
  afterAll(async () => {
    if (process.env.L4A_JOURNAL) writeFileSync(process.env.L4A_JOURNAL, JSON.stringify(journal, null, 2));
    for (const c of [c1, c2]) await (c as unknown as { session: { client: { end: () => Promise<void> } } }).session.client.end().catch(() => {});
  });

  it('les deux clients sont deux sessions Postgres distinctes', async () => {
    const [a, b] = await Promise.all([pid(c1), pid(c2)]);
    journal.push({ pids: [a, b] });
    expect(a).not.toBe(b);
  });

  it(`FLOW-06 · deux propositions, même base, en même temps · ${MANCHES} manches ⇒ une version, un 409 avec différences`, async () => {
    const issues: string[] = [];
    for (let manche = 0; manche < MANCHES; manche++) {
      const p = await projetVideo(c1, ids, ids.brandA1, ids.ua);
      const [p1, p2] = [await proposer(c1, p.projectId, p.versionId, 'Onglet 1'), await proposer(c2, p.projectId, p.versionId, 'Onglet 2')];
      const [r1, r2] = await Promise.all([
        appliquerProposition(ctxDe(ids, 'ua'), { proposalId: p1, projectId: p.projectId, baseVersionId: p.versionId }, c1),
        appliquerProposition(ctxDe(ids, 'ua'), { proposalId: p2, projectId: p.projectId, baseVersionId: p.versionId }, c2),
      ]);
      const gagnant = r1.ok ? 'Onglet 1' : r2.ok ? 'Onglet 2' : null;
      const perdant = r1.ok ? r2 : r1;
      const versions = await c1.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, p.projectId));
      const [projet] = await c1.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, p.projectId));
      const courante = versions.find((v) => v.id === projet!.currentVersionId)!;
      const narration = (courante.content as ContenuVersion).shots.byId.s_produit!.narration;
      const props = await c1.select().from(schema.studioProposals).where(eq(schema.studioProposals.projectId, p.projectId));
      const bilan = {
        manche, oks: [r1.ok, r2.ok].filter(Boolean).length, versions: versions.length, narration, gagnant,
        perdant: perdant.ok ? 'ok' : perdant.code, differences: perdant.ok ? null : perdant.conflit?.differences ?? null,
        etats: props.map((x) => x.state).sort(),
      };
      journal.push({ scenario: 'deux-propositions', ...bilan });
      const attendu = {
        oks: 1, versions: 2, narration: gagnant, perdant: 'VERSION_CONFLICT',
        differences: [{ chemin: '/shots/byId/s_produit/narration', base: 'Voici le sérum.', courant: gagnant }],
        etats: ['approved', 'proposed'],
      };
      const { manche: _m, gagnant: _g, ...lu } = bilan;
      if (JSON.stringify(lu) !== JSON.stringify(attendu)) issues.push(`manche ${manche}: ${JSON.stringify(lu)}`);
    }
    expect(issues).toEqual([]);
  });

  it(`double clic sur deux connexions · même proposition · ${MANCHES} manches ⇒ une version, l’autre « déjà appliquée »`, async () => {
    const issues: string[] = [];
    for (let manche = 0; manche < MANCHES; manche++) {
      const p = await projetVideo(c1, ids, ids.brandA1, ids.ua);
      const id = await proposer(c1, p.projectId, p.versionId, 'Un seul clic compte');
      const entree = { proposalId: id, projectId: p.projectId, baseVersionId: p.versionId };
      const [r1, r2] = await Promise.all([appliquerProposition(ctxDe(ids, 'ua'), entree, c1), appliquerProposition(ctxDe(ids, 'ua'), entree, c2)]);
      const versions = await c1.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, p.projectId));
      const audits = await c1.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, id));
      const bilan = {
        oks: [r1.ok, r2.ok].filter(Boolean).length,
        deja: [r1, r2].map((r) => (r.ok ? r.deja : r.code)).sort(),
        memeVersion: r1.ok && r2.ok && r1.version.id === r2.version.id,
        versions: versions.length,
        applications: audits.filter((a) => a.action === 'proposal.apply').length,
      };
      journal.push({ scenario: 'double-clic', manche, ...bilan });
      const attendu = { oks: 2, deja: [false, true], memeVersion: true, versions: 2, applications: 1 };
      if (JSON.stringify(bilan) !== JSON.stringify(attendu)) issues.push(`manche ${manche}: ${JSON.stringify(bilan)}`);
    }
    expect(issues).toEqual([]);
  });
});
