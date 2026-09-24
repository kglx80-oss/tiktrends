import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le garde d'ÉCRITURE de l'équipe · éprouvé en le faisant TOMBER.
 *
 * Les actions serveur (enregistrer/retirer un membre, enregistrer la matrice)
 * ne doivent écrire QUE pour un accès total plateforme (adminplus/admin) lu dans
 * `s.equipe`, jamais depuis le rôle d'espace ni « owner » (toute inscription libre
 * crée un owner). On vérifie le RÉSULTAT : un client, un rôle gradé, une absence
 * de session → aucune écriture, redirection ; et l'auto-rétrogradation est
 * refusée (anti-verrouillage). Une régression qui lirait le mauvais rôle
 * ouvrirait l'écriture de platform_staff à n'importe quel inscrit · ce test la
 * fait échouer.
 */

// État mutable partagé avec les factories de mock · `vi.hoisted` car `vi.mock`
// est remonté en tête de fichier (il ne peut pas lire une variable de module).
const h = vi.hoisted(() => {
  const ecritures: string[] = [];
  const chaineInsert = { values: () => ({ onConflictDoUpdate: async () => { ecritures.push('insert'); } }) };
  const chaineDelete = { where: async () => { ecritures.push('delete'); } };
  class RedirectErr extends Error { url: string; constructor(url: string) { super(`REDIRECT ${url}`); this.url = url; } }
  return {
    ecritures,
    dbMock: { insert: () => chaineInsert, delete: () => chaineDelete },
    ref: { session: null as unknown },
    RedirectErr,
  };
});

vi.mock('@tiktrends/db', () => ({
  db: h.dbMock,
  schema: { platformStaff: { email: 'email' }, platformRoleRights: { role: 'role' } },
}));
vi.mock('../lib/auth', () => ({ getSession: async () => h.ref.session }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new h.RedirectErr(url); } }));

import { enregistrerStaffAction, retirerStaffAction, enregistrerMatriceAction } from '../app/actions/equipe';

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const client = { user: { email: 'owner@client.fr' }, role: 'owner', plan: 'starter', equipe: null };
const gradee = { user: { email: 'membre@agence.fr' }, role: 'owner', plan: 'starter', equipe: { role: 'membre', matrice: {} } };
const admin = { user: { email: 'boss@agence.fr' }, role: 'owner', plan: 'starter', equipe: { role: 'admin', matrice: {} } };

async function urlDe(p: Promise<void>): Promise<string> {
  try { await p; return '(pas de redirect)'; } catch (e) { if (e instanceof h.RedirectErr) return e.url; throw e; }
}

beforeEach(() => { h.ecritures.length = 0; h.ref.session = null; });

describe('actions équipe · le garde d’accès total tient', () => {
  for (const action of [
    { nom: 'enregistrerStaff', fn: () => enregistrerStaffAction(fd({ email: 'x@y.fr', role: 'membre' })) },
    { nom: 'retirerStaff', fn: () => retirerStaffAction(fd({ email: 'x@y.fr' })) },
    { nom: 'enregistrerMatrice', fn: () => enregistrerMatriceAction(fd({ role: 'membre' })) },
  ]) {
    it(`${action.nom} · sans session → /login, aucune écriture`, async () => {
      h.ref.session = null;
      expect(await urlDe(action.fn())).toBe('/login');
      expect(h.ecritures).toEqual([]);
    });

    it(`${action.nom} · client (equipe absent) → /dashboard, aucune écriture`, async () => {
      h.ref.session = client;
      expect(await urlDe(action.fn())).toBe('/dashboard');
      expect(h.ecritures).toEqual([]);
    });

    it(`${action.nom} · rôle gradé (membre) → /dashboard, aucune écriture`, async () => {
      h.ref.session = gradee;
      expect(await urlDe(action.fn())).toBe('/dashboard');
      expect(h.ecritures).toEqual([]);
    });
  }

  it('un accès total écrit bien (le garde laisse passer le légitime)', async () => {
    h.ref.session = admin;
    expect(await urlDe(enregistrerStaffAction(fd({ email: 'x@y.fr', role: 'membre' })))).toBe('/admin/equipe?ok=staff');
    expect(h.ecritures).toEqual(['insert']);
  });

  it('auto-rétrogradation refusée · un accès total ne se coupe pas l’accès', async () => {
    h.ref.session = admin;
    // boss@agence.fr (soi) posté en rôle gradé → refus, aucune écriture.
    expect(await urlDe(enregistrerStaffAction(fd({ email: 'boss@agence.fr', role: 'lecture' })))).toBe('/admin/equipe?e=soi');
    expect(h.ecritures).toEqual([]);
  });

  it('se retirer soi-même refusé', async () => {
    h.ref.session = admin;
    expect(await urlDe(retirerStaffAction(fd({ email: 'boss@agence.fr' })))).toBe('/admin/equipe?e=soi');
    expect(h.ecritures).toEqual([]);
  });
});
