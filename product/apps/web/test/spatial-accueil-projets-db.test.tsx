// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Spatial · l'Accueil « Reprendre » · sur une VRAIE base (pglite). Portée de
 * `uxv2-accueil-projets-db` (l'ancien Accueil V5 est retiré).
 *
 * On rend la vraie page Spatial `/dashboard` (la vraie action de liste, ses
 * gardes, sa portée) et on LIT le HTML :
 *  · le projet repris est le plus récemment modifié DE LA PORTÉE · un projet
 *    d'un autre espace, d'une marque hors restriction, ou archivé n'apparaît
 *    JAMAIS ;
 *  · l'aperçu est la sortie livrée réelle du projet repris, servie par la
 *    route gardée · sans sortie, aucune image ;
 *  · les états · capacité coupée, panne de lecture, premier usage · dits, sans
 *    geste mort, et le reste de l'Accueil s'affiche toujours ;
 *  · une visite n'écrit RIEN (empreinte de toutes les tables avant/après).
 */

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios & { wsC: string },
  session: null as SessionTest | null,
  panne: false,
  /** Marque active simulée · `null` = « Toutes les marques » (défaut). */
  marque: null as { id: string; name: string } | null,
  /** Chaque requête envoyée à la base · une écriture idempotente ne change pas l'empreinte, elle se lit ici. */
  requetes: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), wsC: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  // Le journal des requêtes · posé sur le client pglite lui-même (requêtes et transactions).
  type Client = { query: (t: unknown, ...r: unknown[]) => Promise<unknown>; transaction: (cb: (tx: Client) => Promise<unknown>) => Promise<unknown> };
  const espionner = (c: Client) => { const q = c.query.bind(c); c.query = (t, ...r) => { h.requetes.push(String(t)); return q(t, ...r); }; };
  const client = (db as unknown as { session: { client: Client } }).session.client;
  espionner(client);
  const tr = client.transaction.bind(client);
  client.transaction = (cb) => tr((tx) => { espionner(tx); return cb(tx); });
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
// La panne de lecture · l'action RÉELLE, sauf quand le test la fait tomber.
vi.mock('../app/actions/studios/sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/actions/studios/sources')>();
  return { ...actual, listerProjetsCartes: async (...a: Parameters<typeof actual.listerProjetsCartes>) => { if (h.panne) throw new Error('base indisponible'); return actual.listerProjetsCartes(...a); } };
});

import { db, schema, eq, sql } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';

const ids = h.ids;
const P: Record<string, string> = {};
let apercuA2 = '';

async function projet(cle: string, o: { ws: string; brand: string; titre: string; le: string; status?: 'active' | 'archived' }) {
  const [p] = await db.insert(schema.studioProjects).values({
    workspaceId: o.ws, brandId: o.brand, kind: 'ads', title: o.titre, status: o.status ?? 'active', ownerId: ids.ua,
    createdAt: new Date(o.le), updatedAt: new Date(o.le),
  }).returning();
  P[cle] = p!.id;
}
async function sortie(projectId: string, ws: string, brand: string, o: { origin?: 'render' | 'upload'; le: string }) {
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ws, brandId: brand, projectId, storageKey: `rendus/${projectId}/${o.le}.png`, mime: 'image/png', bytes: 1234,
    sha256: 'a'.repeat(64), origin: o.origin ?? 'render', storageState: 'stored', createdAt: new Date(o.le),
  }).returning();
  return a!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.insert(schema.workspaces).values({ id: ids.wsC, name: 'Espace C', plan: 'core' });
  // Espace A · A1 : trois projets ; A2 : le plus récent de l'espace (hors portée de `ur`) ; un archivé encore plus récent.
  await projet('a1Ancien', { ws: ids.wsA, brand: ids.brandA1, titre: 'A1 · le plus ancien', le: '2026-10-01T08:00:00Z' });
  await projet('a1Recent', { ws: ids.wsA, brand: ids.brandA1, titre: 'A1 · le plus récent', le: '2026-10-05T08:00:00Z' });
  await projet('a1Milieu', { ws: ids.wsA, brand: ids.brandA1, titre: 'A1 · au milieu', le: '2026-10-03T08:00:00Z' });
  await projet('a2', { ws: ids.wsA, brand: ids.brandA2, titre: 'A2 · repris en premier', le: '2026-10-09T08:00:00Z' });
  await projet('archive', { ws: ids.wsA, brand: ids.brandA1, titre: 'A1 · archivé', le: '2026-10-11T08:00:00Z', status: 'archived' });
  // Espace B · le projet le plus récent de toute la base · ne doit JAMAIS sortir chez A.
  await projet('b', { ws: ids.wsB, brand: ids.brandB1, titre: 'B · projet secret', le: '2026-10-10T08:00:00Z' });
  // Sorties · A2 a un rendu livré (et un dépôt plus récent, qui n'est PAS un aperçu) ; B en a un aussi.
  apercuA2 = await sortie(P.a2!, ids.wsA, ids.brandA2, { le: '2026-10-09T09:00:00Z' });
  await sortie(P.a2!, ids.wsA, ids.brandA2, { origin: 'upload', le: '2026-10-09T10:00:00Z' });
  await sortie(P.b!, ids.wsB, ids.brandB1, { le: '2026-10-10T09:00:00Z' });
});
afterEach(async () => {
  h.panne = false;
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA)));
});

async function accueil(s: SessionTest) {
  h.session = s;
  const html = renderToStaticMarkup(await AccueilSpatial({ searchParams: Promise.resolve({}) }));
  const d = document.createElement('div');
  d.innerHTML = html;
  return { html, d, texte: d.textContent ?? '' };
}
/** Les lignes de « Reprendre », dans l'ordre · titre et lien. */
const lignes = (d: HTMLElement) => [...d.querySelectorAll('a.prow')].map((a) => [a.querySelector('strong')?.textContent, a.getAttribute('href')]);
const TOUS_TITRES = ['A1 · le plus ancien', 'A1 · le plus récent', 'A1 · au milieu', 'A2 · repris en premier', 'A1 · archivé', 'B · projet secret'];

/** Empreinte de TOUTES les tables · une écriture, quelle qu'elle soit, la change. */
async function empreinteBase(): Promise<Record<string, string>> {
  const r = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`);
  const out: Record<string, string> = {};
  for (const { table_name } of (r as unknown as { rows: Array<{ table_name: string }> }).rows) {
    const e = await db.execute(sql.raw(`select count(*)::text || ':' || coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as h from "${table_name}" t`));
    out[table_name] = (e as unknown as { rows: Array<{ h: string }> }).rows[0]!.h;
  }
  return out;
}


describe('Spatial · Accueil · reprendre le dernier projet DE LA PORTÉE', () => {
  it('membre de l’espace A · le plus récent d’abord, les suivants dans l’ordre, aperçu réel du repris', async () => {
    const { d } = await accueil(session(ids, 'ua'));
    expect(lignes(d), 'le projet repris n’est pas le plus récemment modifié de la portée, ou l’ordre est faux').toEqual([
      ['A2 · repris en premier', `/studio/projets/${P.a2}`], ['A1 · le plus récent', `/studio/projets/${P.a1Recent}`],
      ['A1 · au milieu', `/studio/projets/${P.a1Milieu}`], ['A1 · le plus ancien', `/studio/projets/${P.a1Ancien}`],
    ]);
    // L'aperçu · la sortie LIVRÉE (rendu), pas le dépôt plus récent · par la route gardée.
    expect(d.querySelector('a.prow img')?.getAttribute('src'), 'aperçu absent ou faux').toBe(`/api/studios/media/${apercuA2}`);
    expect([...d.querySelectorAll('a.more')].find((a) => a.textContent?.startsWith('Tous les projets'))?.getAttribute('href')).toBe('/studio/projets?toutes=1');
    expect(d.querySelector('nav[aria-label="Raccourcis"] a[data-route="nouveau"]')?.getAttribute('href')).toBe('/studio/projets/nouveau');
  });

  it('jamais un projet d’un autre espace, ni archivé', async () => {
    const { texte } = await accueil(session(ids, 'ua'));
    expect(texte, 'un projet de l’espace B fuit dans l’Accueil de A').not.toContain('B · projet secret');
    expect(texte, 'un projet archivé est proposé à la reprise').not.toContain('A1 · archivé');
  });

  it('membre restreint à A1 · le projet de A2 (plus récent) n’apparaît jamais, ni son aperçu', async () => {
    const { d, texte, html } = await accueil(session(ids, 'ur'));
    expect(lignes(d)[0]?.[0]).toBe('A1 · le plus récent');
    expect(texte, 'un projet d’une marque hors restriction fuit').not.toContain('A2 · repris en premier');
    expect(html).not.toContain(P.a2!);
    expect(html, 'l’aperçu d’une marque hors portée fuit').not.toContain(apercuA2);
    expect(d.querySelector('a.prow img'), 'une image inventée').toBeNull();
  });

  it('espace B · son seul projet, aucun projet de A', async () => {
    const { d, texte } = await accueil(session(ids, 'ub'));
    expect(lignes(d).map((l) => l[0])).toEqual(['B · projet secret']);
    for (const t of TOUS_TITRES.filter((x) => !x.startsWith('B'))) expect(texte, `projet de A visible depuis B · ${t}`).not.toContain(t);
  });
});

describe('Spatial · Accueil · états dégradés · le reste s’affiche toujours', () => {
  it('capacité « projets » coupée pour l’espace · une note, aucun projet, aucun geste mort', async () => {
    const value = { actives: [], coupees: ['projets'] };
    await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
    const { d, html, texte } = await accueil(session(ids, 'ua'));
    expect(d.querySelector('[data-reprendre-etat="coupee"]')?.getAttribute('role')).toBe('status');
    expect(texte).toContain('non activé pour cet espace');
    for (const t of TOUS_TITRES) expect(texte, `projet montré malgré la coupure · ${t}`).not.toContain(t);
    expect(html, 'un lien vers la préparation reste malgré la coupure').not.toMatch(/href="\/studio\/projets\/nouveau"/);
    expect(html, 'un lien vers la liste coupée reste').not.toMatch(/href="\/studio\/projets(\?[^"]*)?"/);
    expect(d.querySelector('h1')?.textContent).toMatch(/^Bonjour/);
  });

  it('panne de lecture · dite, discrète · le reste de l’Accueil s’affiche', async () => {
    h.panne = true;
    const { d, texte } = await accueil(session(ids, 'ua'));
    expect(d.querySelector('[data-reprendre-etat="erreur"]')?.getAttribute('role'), 'la panne n’est pas dite').toBe('status');
    expect(texte).toContain('n’ont pas pu être lus');
    expect(d.querySelector('h1')?.textContent).toMatch(/^Bonjour/);
    expect(d.querySelector('nav[aria-label="Raccourcis"]'), 'la panne a emporté le reste de l’Accueil').not.toBeNull();
  });

  it('premier usage (aucun projet) · « Nouveau projet » proposé, aucun projet inventé', async () => {
    const { d, texte } = await accueil(session(ids, 'ua', { workspaceId: ids.wsC, workspaceName: 'Espace C' }));
    expect(texte).toContain('Aucun projet pour l’instant');
    expect(d.querySelector('a.prow'), 'un projet à reprendre inventé').toBeNull();
    for (const t of TOUS_TITRES) expect(texte).not.toContain(t);
  });
});

describe('Spatial · Accueil · une visite n’écrit RIEN', () => {
  it('membre, restreint, lecteur, propriétaire, espace vide, panne · base identique', async () => {
    const avant = await empreinteBase();
    h.requetes = [];
    expect(Object.keys(avant).length, 'l’empreinte ne lit pas les tables').toBeGreaterThan(20);
    for (const s of [session(ids, 'ua'), session(ids, 'ur'), session(ids, 'uv'), session(ids, 'ub'), session(ids, 'ua', { role: 'owner' }), session(ids, 'ua', { workspaceId: ids.wsC })]) {
      await accueil(s);
    }
    h.panne = true;
    await accueil(session(ids, 'ua'));
    const lues = h.requetes.filter((t) => /^\s*select\b/i.test(t));
    expect(lues.length, 'le journal ne voit pas les requêtes de l’Accueil').toBeGreaterThan(10);
    expect(h.requetes.filter((t) => /^\s*(insert|update|delete|truncate|alter|create|drop)\b/i.test(t)), 'la visite de l’Accueil envoie une écriture').toEqual([]);
    expect(await empreinteBase(), 'la visite de l’Accueil a écrit en base').toEqual(avant);
  });
});
