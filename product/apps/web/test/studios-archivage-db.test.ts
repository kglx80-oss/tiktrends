import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionTest } from './studios-semis';
const h = vi.hoisted(() => ({ session: null as SessionTest | null }));
vi.mock('@tiktrends/db', async (original) => {
 const actual = await original<typeof import('@tiktrends/db')>();
 const { pgMemoire } = await import('./helpers/pg-memoire');
 return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { db, schema, eq } from '@tiktrends/db';
import { idsStudios, semer, session } from './studios-semis';
import { supprimerProjet, restaurerProjet } from '../app/actions/studios/archivage';
import { listerProjetsCartes } from '../app/actions/studios/sources';
const ids = idsStudios();
beforeAll(async () => { await semer(db, schema, ids); });
async function projet(brandId = ids.brandA1, workspaceId = ids.wsA) {
 const [p] = await db.insert(schema.studioProjects).values({ workspaceId, brandId, title: 'Projet en production', kind: 'image' }).returning();
 const [v] = await db.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId, brandId, n: 1, schemaVersion: 1, content: { titre: 'Ne pas perdre' }, contentHash: 'a'.repeat(64) }).returning();
 return { p: p!, v: v! };
}
const lire = async (id: string) => (await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, id)))[0]!;
describe('Suppression réversible · vraie base et actions', () => {
 it('archive et restaure sans perdre la version, répétitions idempotentes auditées une fois', async () => {
  h.session = session(ids, 'ua'); const { p, v } = await projet();
  for (let n = 0; n < 2; n++) expect(await supprimerProjet({ projectId: p.id })).toEqual({ ok: true });
  expect(await lire(p.id)).toMatchObject({ status: 'archived', rowVersion: 1 });
  expect(await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, v.id))).toHaveLength(1);
  for (let n = 0; n < 2; n++) expect(await restaurerProjet({ projectId: p.id })).toEqual({ ok: true });
  expect(await lire(p.id)).toMatchObject({ status: 'active', rowVersion: 2 });
  expect(await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, p.id))).toHaveLength(2);
 });
 it('Spatial · filtre « Archivés » · un projet archivé quitte la liste et rejoint les archivés relus dans la même portée', async () => {
  h.session = session(ids, 'ua'); const { p } = await projet();
  const ids_ = async (archives: boolean) => { const r = await listerProjetsCartes({ archives }); expect(r.ok).toBe(true); return r.ok ? r.cartes.map((c) => c.id) : []; };
  expect(await ids_(false)).toContain(p.id);
  expect(await ids_(true)).not.toContain(p.id);
  expect(await supprimerProjet({ projectId: p.id })).toEqual({ ok: true });
  expect(await ids_(false)).not.toContain(p.id);
  expect(await ids_(true)).toContain(p.id);
  // Hors portée · un archivé d'un autre espace n'est jamais relu.
  const ailleurs = await projet(ids.brandB1, ids.wsB);
  await db.update(schema.studioProjects).set({ status: 'archived' }).where(eq(schema.studioProjects.id, ailleurs.p.id));
  expect(await ids_(true)).not.toContain(ailleurs.p.id);
  expect(await restaurerProjet({ projectId: p.id })).toEqual({ ok: true });
  expect(await ids_(true)).not.toContain(p.id);
 });
 it('refuse session absente, lecteur et identifiants hors portée', async () => {
  const { p } = await projet(); h.session = null;
  expect(await supprimerProjet({ projectId: p.id })).toMatchObject({ code: 'AUTH_REQUIRED' });
  h.session = session(ids, 'uv'); expect(await supprimerProjet({ projectId: p.id })).toMatchObject({ code: 'FORBIDDEN' });
  h.session = session(ids, 'ua');
  for (const projectId of ['invalid', (await projet(ids.brandB1, ids.wsB)).p.id]) expect(await supprimerProjet({ projectId })).toMatchObject({ code: 'NOT_FOUND', targetIds: [] });
  h.session = session(ids, 'ur'); const autre = await projet(ids.brandA2);
  for (const fn of [supprimerProjet, restaurerProjet]) expect(await fn({ projectId: autre.p.id })).toMatchObject({ code: 'NOT_FOUND', targetIds: [] });
  expect((await lire(p.id)).status).toBe('active');
 });
 it.each(schema.STUDIO_JOB_STATES)('protège les tâches non terminales et conserve le job %s', async (state) => {
  h.session = session(ids, 'ua'); const { p, v } = await projet();
  await db.insert(schema.studioJobs).values({ projectId: p.id, projectVersionId: v.id, workspaceId: p.workspaceId, brandId: p.brandId, state, operation: 'image', idempotencyKey: p.id, inputHash: 'a'.repeat(64), snapshot: {} });
  const terminal = ['completed', 'failed', 'cancelled'].includes(state);
  expect(await supprimerProjet({ projectId: p.id })).toMatchObject(terminal ? { ok: true } : { ok: false, code: 'INVARIANT_CONFLICT' });
  expect((await lire(p.id)).status).toBe(terminal ? 'archived' : 'active');
  expect(await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.projectId, p.id))).toMatchObject([{ state }]);
 });
});
