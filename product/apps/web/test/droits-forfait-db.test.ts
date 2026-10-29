import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Droits échelonnés appliqués au SERVEUR (29/10, point 6) · sur une vraie base
 * (pglite) et les actions réelles. On lit la base et la réponse · jamais la
 * présence d'un appel. Les limites ne valent que sous `TARIFS_V2` · sans lui,
 * un forfait V2 se lit comme le forfait actuel qu'il remplace (aucune limite).
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
// La commande canonique des sources · garde studio et capacités ouvertes pour l'espace de la session.
vi.mock('../lib/studios/sources/acces', () => ({
  gardeSources: async () => ({ ok: true, ctx: { workspaceId: (etat.session as { workspaceId: string }).workspaceId, traceId: 'trace-test', marques: [] }, veilleOuverte: true }),
}));
vi.mock('../lib/studios/interrupteurs', () => ({ refusCapacite: async () => null }));
// `redirect` de Next lève · on lit OÙ l'action renvoie.
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { refusMarqueEspace } from '../lib/droits-forfait';
import { ajouterConcurrents } from '../app/actions/competitor';
import { createBrandAction } from '../app/actions/brands';
import { creerProjetDepuisSources } from '../app/actions/studios/sources';

async function espace(plan: string, marques: number, concurrents: string[] = []) {
  const ws = randomUUID();
  await db.insert(schema.workspaces).values({ id: ws, name: `Espace ${plan}`, plan });
  const ids: string[] = [];
  for (let i = 0; i < marques; i++) {
    const id = randomUUID(); ids.push(id);
    await db.insert(schema.brands).values({ id, workspaceId: ws, name: `Marque ${i}`, competitors: i === 0 ? concurrents : [] });
  }
  return { ws, marque: ids[0]! };
}
const session = (ws: string, plan: string) => ({ workspaceId: ws, plan, role: 'owner', user: { id: randomUUID(), email: 'client@exemple.fr' } });

beforeEach(() => { vi.stubEnv('TARIFS_V2', '1'); });

describe('marques par forfait', () => {
  it('Essentiel · une seconde marque refusée, Pro nommé ; Pro · trois, pas quatre ; Core (actuel) · sans limite', async () => {
    expect(await refusMarqueEspace((await espace('essentiel', 0)).ws, 'essentiel')).toBeNull();
    expect(await refusMarqueEspace((await espace('essentiel', 1)).ws, 'essentiel')).toBe('Ton forfait Essentiel inclut 1 marque. Le forfait Pro en ouvre 3 · change de forfait depuis Réglages · Forfaits.');
    expect(await refusMarqueEspace((await espace('pro', 2)).ws, 'pro')).toBeNull();
    expect(await refusMarqueEspace((await espace('pro', 3)).ws, 'pro')).toContain('Le forfait Agence en ouvre 20');
    expect(await refusMarqueEspace((await espace('core', 25)).ws, 'core')).toBeNull();
  });

  it('l’action de création · Essentiel avec une marque ⇒ renvoyée vers la liste avec le motif, aucune marque écrite', async () => {
    const e = await espace('essentiel', 1);
    etat.session = session(e.ws, 'essentiel');
    const fd = new FormData(); fd.set('name', 'Deuxième');
    await expect(createBrandAction(fd)).rejects.toThrow('REDIRECT /brands?e=limite_marques');
    expect((await db.select().from(schema.brands).where(eq(schema.brands.workspaceId, e.ws))).map((b) => b.name)).toEqual(['Marque 0']);
  });

  it('sans TARIFS_V2 · un espace Essentiel n’a aucune limite (comportement d’aujourd’hui)', async () => {
    vi.stubEnv('TARIFS_V2', '');
    expect(await refusMarqueEspace((await espace('essentiel', 4)).ws, 'essentiel')).toBeNull();
  });
});

describe('concurrents suivis par marque', () => {
  it('Pro · le sixième concurrent est refusé, Agence nommé, et rien n’est écrit', async () => {
    const e = await espace('pro', 1, ['A', 'B', 'C', 'D']);
    etat.session = session(e.ws, 'pro');
    expect(await ajouterConcurrents(e.marque, ['E'])).toEqual({ ok: true });
    const r = await ajouterConcurrents(e.marque, ['F']);
    expect(r).toEqual({ error: 'Ton forfait Pro suit 5 concurrents par marque. Le forfait Agence en suit 20 · change de forfait depuis Réglages · Forfaits.' });
    const [b] = await db.select({ c: schema.brands.competitors }).from(schema.brands).where(eq(schema.brands.id, e.marque));
    expect(b!.c).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('Business (actuel) · aucune limite, ses droits d’aujourd’hui restent', async () => {
    const e = await espace('business', 1, Array.from({ length: 30 }, (_, i) => `C${i}`));
    etat.session = session(e.ws, 'business');
    expect(await ajouterConcurrents(e.marque, ['Nouveau'])).toEqual({ ok: true });
  });
});

describe('clone d’une pub en vidéo · dès Pro', () => {
  const entree = (kind: string) => ({ sources: [{ type: 'sauvegarde', id: randomUUID() }], brandId: randomUUID(), kind, titre: 'Adaptation', objectif: 'Cloner', cleClic: randomUUID() });

  it('Essentiel · refusé par la commande canonique, Pro nommé, aucun projet écrit', async () => {
    const e = await espace('essentiel', 1);
    etat.session = session(e.ws, 'essentiel');
    const r = await creerProjetDepuisSources(entree('video'));
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'Le clone de pubs en vidéo est inclus dès le forfait Pro · ton forfait Essentiel clone en image. Pour la vidéo, change de forfait depuis Réglages · Forfaits.' });
    expect(await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.workspaceId, e.ws))).toEqual([]);
  });

  it('Essentiel en image, Pro en vidéo, Essentiel sans TARIFS_V2 · la commande poursuit (la sauvegarde inconnue est ensuite introuvable)', async () => {
    const e = await espace('essentiel', 1);
    etat.session = session(e.ws, 'essentiel');
    expect(await creerProjetDepuisSources(entree('image'))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const p = await espace('pro', 1);
    etat.session = session(p.ws, 'pro');
    expect(await creerProjetDepuisSources(entree('video'))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    vi.stubEnv('TARIFS_V2', '');
    etat.session = session(e.ws, 'essentiel');
    expect(await creerProjetDepuisSources(entree('video'))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
