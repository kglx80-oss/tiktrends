import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L5-A · route de lecture des médias studio (SEC-01, SEC-07 contribution).
 *
 * Vraie base (pglite + migrations du dépôt), vrai handler GET, réponses lues :
 * statut, en-têtes, corps. Hors portée ⇒ 404 au corps identique à « inconnu »
 * (seul l'identifiant de trace change) ; type MIME RÉEL ; cache privé ; ni clé
 * de stockage ni adresse dans la réponse ; et la base n'a pas bougé.
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

import { db, schema, sql } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { GET } from '../app/api/studios/media/[id]/route';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { png } from './l5a-outils';

const ids = etat.ids;
const stockage = new Map<string, Uint8Array>();
const A = { a1: '', a2: '', b1: '', altere: '', enAttente: '', svg: '' };
let octetsA1: Buffer;

async function poser(ws: string, brand: string, cle: string, octets: Uint8Array, o: { mime?: string; sha?: string; etat?: 'stored' | 'pending' } = {}): Promise<string> {
  stockage.set(cle, octets);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ws, brandId: brand, storageKey: cle, mime: o.mime ?? 'image/png', bytes: octets.length,
    sha256: o.sha ?? createHash('sha256').update(octets).digest('hex'), origin: 'upload', storageState: o.etat ?? 'stored', width: 64, height: 32,
  }).returning();
  return a!.id;
}

const appeler = (id: string, entetes: Record<string, string> = {}) =>
  GET(new Request(`http://local/api/studios/media/${id}`, { headers: entetes }), { params: Promise.resolve({ id }) });

async function comptes(): Promise<string> {
  const r = await db.execute(sql`select
    (select count(*) from studio_assets) a, (select count(*) from studio_audit_events) au,
    (select count(*) from studio_projects) p, (select count(*) from studio_jobs) j`);
  return JSON.stringify((r as unknown as { rows: unknown[] }).rows ?? r);
}

beforeAll(async () => {
  await semer(db, schema, ids);
  octetsA1 = await png(64, 32, (x) => [x * 4, 10, 200, 255]);
  // La ligne DÉCLARE jpeg : la route doit servir le type RÉEL relu dans les octets.
  A.a1 = await poser(ids.wsA, ids.brandA1, 'studios/a/a1-secret-cle.png', octetsA1, { mime: 'image/jpeg' });
  A.a2 = await poser(ids.wsA, ids.brandA2, 'studios/a/a2.png', await png(8, 8, () => [1, 1, 1, 255]));
  A.b1 = await poser(ids.wsB, ids.brandB1, 'studios/b/b1-secret.png', await png(8, 8, () => [9, 9, 9, 255]));
  A.altere = await poser(ids.wsA, ids.brandA1, 'studios/a/altere.png', await png(8, 8, () => [2, 2, 2, 255]), { sha: 'f'.repeat(64) });
  A.enAttente = await poser(ids.wsA, ids.brandA1, 'studios/a/attente.png', await png(8, 8, () => [3, 3, 3, 255]), { etat: 'pending' });
  A.svg = await poser(ids.wsA, ids.brandA1, 'studios/a/x.svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { mime: 'image/svg+xml' });
  injecterLecteurMedias({ lire: async (m) => stockage.get(m.storageKey) ?? null });
});

describe('GET /api/studios/media/[id] · lecture dans la portée', () => {
  it('membre de l’espace : 200, octets exacts, MIME RÉEL (png malgré la ligne jpeg), cache privé, aucune clé de stockage', async () => {
    etat.session = session(ids, 'ua');
    const r = await appeler(A.a1);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toBe('private, max-age=300');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('vary')).toBe('Cookie');
    expect(r.headers.get('content-security-policy')).toMatch(/default-src 'none'; sandbox/);
    const corps = Buffer.from(await r.arrayBuffer());
    expect(corps.equals(octetsA1)).toBe(true);
    const entetes = JSON.stringify([...r.headers.entries()]);
    expect(entetes).not.toMatch(/secret-cle|studios\/a|https?:\/\//);
  });

  it('même empreinte ⇒ 304 sans corps', async () => {
    etat.session = session(ids, 'ua');
    const r1 = await appeler(A.a1);
    const r2 = await appeler(A.a1, { 'if-none-match': r1.headers.get('etag')! });
    expect(r2.status).toBe(304);
    expect((await r2.arrayBuffer()).byteLength).toBe(0);
  });

  it('lecteur client (client_viewer, studio fermé à son rôle) : 403, aucun octet', async () => {
    etat.session = session(ids, 'uv');
    const r = await appeler(A.a1);
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('SEC-01 · hors portée : 404 neutre, corps identique à « inconnu »', () => {
  const corpsNeutre = async (r: Response) => {
    const j = (await r.json()) as Record<string, unknown>;
    delete j.traceId;
    return { status: r.status, cache: r.headers.get('cache-control'), j };
  };

  it('autre espace, marque restreinte, inconnu, mal formé, non stocké, altéré, SVG : même réponse', async () => {
    etat.session = session(ids, 'ua');
    const inconnu = await corpsNeutre(await appeler('00000000-0000-4000-8000-000000000000'));
    expect(inconnu).toEqual({ status: 404, cache: 'private, no-store', j: { ok: false, code: 'NOT_FOUND', message: expect.any(String) } });
    const cas: Array<[string, SessionTest, string]> = [
      ['autre espace (B)', session(ids, 'ua'), A.b1],
      ['marque restreinte (ur → A2)', session(ids, 'ur'), A.a2],
      ['mal formé', session(ids, 'ua'), '../../etc/passwd'],
      ['non stocké', session(ids, 'ua'), A.enAttente],
      ['empreinte altérée', session(ids, 'ua'), A.altere],
      ['SVG (exécutable)', session(ids, 'ua'), A.svg],
    ];
    for (const [nom, s, id] of cas) {
      etat.session = s;
      const r = await appeler(id);
      const texte = await r.clone().text();
      expect(await corpsNeutre(r), nom).toEqual(inconnu);
      for (const fuite of [ids.wsB, ids.brandB1, ids.brandA2, 'secret', 'studios/']) expect(texte, `${nom} divulgue ${fuite}`).not.toContain(fuite);
    }
  });

  it('B ne lit pas le média de A ; A restreint lit bien A1', async () => {
    etat.session = session(ids, 'ub');
    expect((await appeler(A.a1)).status).toBe(404);
    etat.session = session(ids, 'ur');
    expect((await appeler(A.a1)).status).toBe(200);
  });

  it('sans session : 401, aucun octet', async () => {
    etat.session = null;
    const r = await appeler(A.a1);
    expect(r.status).toBe(401);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('lecture PURE : aucune ligne écrite par toutes ces requêtes', async () => {
    const avant = await comptes();
    etat.session = session(ids, 'ua');
    for (const id of [A.a1, A.b1, A.altere, 'x']) await appeler(id);
    expect(await comptes()).toBe(avant);
  });
});
