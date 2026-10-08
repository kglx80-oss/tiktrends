import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Recette Codex du 8 octobre · SEC-10, la CHAÎNE complète, en base réelle
 * (pglite, migrations), avec la vraie lecture d'équipe (`equipeDeSession`) et la
 * vraie action d'écriture de l'équipe.
 *
 * Scénario d'attaque :
 *  1. l'attaquant possède déjà un compte Y (créé en janvier) ;
 *  2. un e-mail staff X est préinscrit en février, avant que son titulaire ait
 *     un compte ;
 *  3. l'attaquant crée le compte X en mars (aucun e-mail n'est vérifié) : il a
 *     l'accès total d'équipe, mais il n'est PAS admissible ;
 *  4. depuis X, il inscrit Y dans l'équipe. Avant correction, l'inscription de Y
 *     (avril) postdate le compte Y (janvier) : Y devenait admissible et
 *     obtenait les permissions de plateforme du nouveau studio.
 */

const h = vi.hoisted(() => ({ session: null as unknown, RedirectErr: class RedirectErr extends Error { constructor(public url: string) { super(url); } } }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new h.RedirectErr(url); } }));

import { db, schema, eq } from '@tiktrends/db';
import { equipeDeSession } from '../lib/equipe-plateforme';
import { enregistrerStaffAction } from '../app/actions/equipe';

const X = 'nouvelle.recrue@agence.test';
const Y = 'complice@exemple.test';
const L = 'admin.legitime@agence.test';
const Z = 'renfort@agence.test';

async function sessionDe(email: string) {
  return { user: { email, id: 'u' }, role: 'owner', plan: 'core', equipe: await equipeDeSession(email) };
}
async function inscrire(email: string, role: string): Promise<string> {
  const f = new FormData();
  f.set('email', email);
  f.set('role', role);
  try { await enregistrerStaffAction(f); return '(pas de redirect)'; } catch (e) { if (e instanceof h.RedirectErr) return e.url; throw e; }
}

beforeAll(async () => {
  await db.insert(schema.users).values([
    { email: Y, createdAt: new Date('2026-01-01T00:00:00Z') },
    { email: L, createdAt: new Date('2026-01-01T00:00:00Z') },
    { email: Z, createdAt: new Date('2026-01-02T00:00:00Z') },
  ]);
  await db.insert(schema.platformStaff).values([
    { email: X, role: 'adminplus', createdAt: new Date('2026-02-01T00:00:00Z') },
    { email: L, role: 'admin', createdAt: new Date('2026-02-01T00:00:00Z') },
  ]);
  // L'attaquant crée le compte X APRÈS sa préinscription.
  await db.insert(schema.users).values({ email: X, createdAt: new Date('2026-03-01T00:00:00Z') });
});

describe('SEC-10 · un compte capté ne rend personne admissible', () => {
  it('le compte capté a l’accès total mais n’est pas admissible', async () => {
    const s = await sessionDe(X);
    expect(s.equipe).toMatchObject({ role: 'adminplus', plateformeAdmissible: false });
  });

  it('depuis le compte capté, inscrire un second compte ⇒ refusé, rien écrit, le second compte reste sans droit', async () => {
    h.session = await sessionDe(X);
    expect(await inscrire(Y, 'admin')).toBe('/admin/equipe?e=admissible');
    expect(await db.select().from(schema.platformStaff).where(eq(schema.platformStaff.email, Y)), 'le second compte a été inscrit').toEqual([]);
    expect(await equipeDeSession(Y), 'le second compte a obtenu un rôle d’équipe').toBeNull();
  });

  it('un admin admissible inscrit toujours (le chemin légitime tient), et l’inscrit est admissible', async () => {
    h.session = await sessionDe(L);
    expect(h.session).toMatchObject({ equipe: { plateformeAdmissible: true } });
    expect(await inscrire(Z, 'admin')).toBe('/admin/equipe?ok=staff');
    expect(await equipeDeSession(Z)).toMatchObject({ role: 'admin', plateformeAdmissible: true });
  });
});
