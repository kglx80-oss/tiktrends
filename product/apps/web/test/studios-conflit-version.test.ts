import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Enregistrement d'un document · versions immuables et conflit 409.
 *
 * Deux onglets partent de la même version. Le premier enregistre : nouvelle
 * version. Le second enregistre sur la base périmée : 409 `VERSION_CONFLICT`
 * avec le diff, et RIEN n'est écrit (pas d'écrasement). On lit la base pour le
 * prouver. La disposition du canvas ne crée aucune version et ne touche pas
 * l'ordre des plans.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));

import { db, schema, eq } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { contenuVideo } from '../../../packages/core/test/studios-fixtures';
import { creerProjet, enregistrerDocument, enregistrerDisposition, inspecterProjet } from '../app/actions/studios/projets';

const ids = etat.ids;
let projet = '';
let v1 = '';

beforeAll(async () => {
  await semer(db, schema, ids);
  etat.session = session(ids, 'ua');
  const c = await creerProjet({ brandId: ids.brandA1, kind: 'video', title: 'Vidéo sérum', contenu: contenuVideo() });
  if (!c.ok) throw new Error(`${c.code} ${JSON.stringify(c.violations)}`);
  projet = c.projet.id;
  v1 = c.version.id;
});

const versions = async () => db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projet));

describe('enregistrerDocument · baseVersion, version immuable, 409', () => {
  it('onglet 1 · base à jour → nouvelle version n=2, parent v1, empreinte calculée', async () => {
    etat.session = session(ids, 'ua');
    const r = await enregistrerDocument({ projectId: projet, baseVersionId: v1, changes: [{ op: 'replace', path: '/shots/byId/s_fin/narration', newValue: 'Essaie-le.', reason: 'onglet 1' }], raison: 'onglet 1' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.version.n).toBe(2);
    expect(r.version.parentId).toBe(v1);
    expect(r.version.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projet));
    expect(p?.currentVersionId).toBe(r.version.id);
  });

  it('onglet 2 · base périmée → 409 avec diff, et AUCUNE écriture', async () => {
    const avant = await versions();
    const r = await enregistrerDocument({ projectId: projet, baseVersionId: v1, changes: [{ op: 'replace', path: '/shots/byId/s_fin/narration', newValue: 'Version onglet 2', reason: 'onglet 2' }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('VERSION_CONFLICT');
    expect(r.status).toBe(409);
    expect(r.conflit?.versionCouranteId).not.toBe(v1);
    expect(r.conflit?.differences).toEqual([{ chemin: '/shots/byId/s_fin/narration', base: '', courant: 'Essaie-le.' }]);
    const apres = await versions();
    expect(apres.length).toBe(avant.length);
    const courante = apres.find((v) => v.n === 2)!;
    expect((courante.content as { shots: { byId: Record<string, { narration: string }> } }).shots.byId.s_fin!.narration).toBe('Essaie-le.');
  });

  it('sans baseVersion → refus, aucune version', async () => {
    const r = await enregistrerDocument({ projectId: projet, baseVersionId: undefined, changes: [] });
    expect(!r.ok && r.code).toBe('INVALID_SCHEMA');
    expect((await versions()).length).toBe(2);
  });

  it('patch interdit (__proto__, indice positionnel, champ hors du contenu) → INVALID_SCHEMA, aucune version', async () => {
    const insp = await inspecterProjet(projet);
    if (!insp.ok) throw new Error(insp.code);
    const base = insp.version.id;
    for (const changes of [
      [{ op: 'add', path: '/brief/__proto__', newValue: { admin: true }, reason: 'x' }],
      [{ op: 'replace', path: '/shots/order/0', newValue: 's_fin', reason: 'x' }],
      [{ op: 'add', path: '/script', newValue: 'alert(1)', reason: 'x' }],
      [{ op: 'replace', path: '/shots/byId/s_fin/speechMode', newValue: 'chanter', reason: 'x' }],
    ]) {
      const r = await enregistrerDocument({ projectId: projet, baseVersionId: base, changes });
      expect(!r.ok && r.code, JSON.stringify(changes)).toBe('INVALID_SCHEMA');
    }
    expect((await versions()).length).toBe(2);
  });

  it('un enregistrement sans changement réel ne crée pas de version', async () => {
    const insp = await inspecterProjet(projet);
    if (!insp.ok) throw new Error(insp.code);
    const r = await enregistrerDocument({ projectId: projet, baseVersionId: insp.version.id, changes: [{ op: 'replace', path: '/shots/byId/s_fin/narration', newValue: 'Essaie-le.', reason: 'même valeur' }] });
    expect(r.ok && r.inchange).toBe(true);
    expect((await versions()).length).toBe(2);
  });
});

describe('enregistrerDisposition · le canvas ne touche ni la version, ni l’ordre', () => {
  it('positions enregistrées, version et ordre des plans inchangés ; base périmée → 409', async () => {
    const avant = await inspecterProjet(projet);
    if (!avant.ok) throw new Error(avant.code);
    const d1 = await enregistrerDisposition({ projectId: projet, positions: { s_fin: { x: 0, y: 0 }, s_ouverture: { x: 400, y: 0 } }, rowVersion: 0 });
    expect(d1.ok && d1.disposition.rowVersion).toBe(1);
    const perime = await enregistrerDisposition({ projectId: projet, positions: { s_fin: { x: 9, y: 9 } }, rowVersion: 0 });
    expect(!perime.ok && perime.code).toBe('VERSION_CONFLICT');
    const apres = await inspecterProjet(projet);
    if (!apres.ok) throw new Error(apres.code);
    expect(apres.version.id).toBe(avant.version.id);
    expect((apres.version.content as { shots: { order: string[] } }).shots.order).toEqual(['s_ouverture', 's_produit', 's_fin']);
    expect(apres.disposition?.positions).toEqual({ s_fin: { x: 0, y: 0 }, s_ouverture: { x: 400, y: 0 } });
    expect((await versions()).length).toBe(2);
  });
});
