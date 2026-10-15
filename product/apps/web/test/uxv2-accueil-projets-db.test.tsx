// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * UX V2 · lot 5 · l'Accueil part du PROJET · sur une VRAIE base (pglite).
 *
 * On rend la vraie page `/dashboard` (la vraie action de liste, ses gardes, sa
 * portée) et on LIT le HTML :
 *  · le projet repris est le plus récemment modifié DE LA PORTÉE · un projet
 *    d'un autre espace, d'une marque hors restriction, ou archivé n'apparaît
 *    JAMAIS (ni repris, ni dans « Tes autres projets ») ;
 *  · l'aperçu est la sortie livrée réelle du projet repris, servie par la
 *    route gardée · sans sortie, aucune image ;
 *  · les états · rôle sans Studios, capacité coupée, panne de lecture,
 *    premier usage · le reste de l'Accueil s'affiche toujours ;
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
import Dashboard from '../app/(app)/dashboard/page';

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
  const html = renderToStaticMarkup(await Dashboard({ searchParams: Promise.resolve({}) }));
  const d = document.createElement('div');
  d.innerHTML = html;
  return { html, d, texte: d.textContent ?? '' };
}
const titres = (d: HTMLElement) => ({
  reprendre: d.querySelector('[data-reprendre] h3')?.textContent ?? null,
  autres: [...d.querySelectorAll('[data-autres-projets] [data-projet] h3')].map((e) => e.textContent),
});
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

describe('Accueil · reprendre le dernier projet DE LA PORTÉE', () => {
  it('membre de l’espace A · le plus récent repris, les suivants dans l’ordre, aperçu réel', async () => {
    const { d } = await accueil(session(ids, 'ua'));
    expect(d.querySelector('[data-accueil-projets]')?.getAttribute('data-accueil-projets')).toBe('liste');
    const t = titres(d);
    expect(t.reprendre, 'le projet repris n’est pas le plus récemment modifié de la portée').toBe('A2 · repris en premier');
    expect(t.autres, '« Tes autres projets » faux ou dans le désordre').toEqual(['A1 · le plus récent', 'A1 · au milieu', 'A1 · le plus ancien']);
    expect(d.querySelector('a[data-reprendre-lien]')?.getAttribute('href')).toBe(`/studio/projets/${P.a2}`);
    expect(d.querySelector('a[data-reprendre-lien]')?.textContent).toBe('Reprendre le projet');
    // L'aperçu · la sortie LIVRÉE (rendu), pas le dépôt plus récent · par la route gardée.
    expect(d.querySelector('[data-apercu-reprise] img')?.getAttribute('src'), 'aperçu absent ou faux').toBe(`/api/studios/media/${apercuA2}`);
    expect(d.querySelector('a[data-nouveau-projet-accueil]')?.getAttribute('href')).toBe('/studio/projets/nouveau');
    expect([...d.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Voir tous les projets'))?.getAttribute('href')).toBe('/studio/projets?toutes=1');
  });

  it('jamais un projet d’un autre espace, ni archivé', async () => {
    const { texte } = await accueil(session(ids, 'ua'));
    expect(texte, 'un projet de l’espace B fuit dans l’Accueil de A').not.toContain('B · projet secret');
    expect(texte, 'un projet archivé est proposé à la reprise').not.toContain('A1 · archivé');
  });

  it('membre restreint à A1 · le projet de A2 (plus récent) n’apparaît jamais, ni son aperçu', async () => {
    const { d, texte, html } = await accueil(session(ids, 'ur'));
    expect(titres(d).reprendre).toBe('A1 · le plus récent');
    expect(texte, 'un projet d’une marque hors restriction fuit').not.toContain('A2 · repris en premier');
    expect(html).not.toContain(P.a2!);
    expect(html, 'l’aperçu d’une marque hors portée fuit').not.toContain(apercuA2);
    // Aucune sortie livrée pour ce projet · aucune image inventée.
    expect(d.querySelector('[data-apercu-reprise]')).toBeNull();
  });

  it('espace B · son seul projet, aucun projet de A', async () => {
    const { d, texte } = await accueil(session(ids, 'ub'));
    expect(titres(d).reprendre).toBe('B · projet secret');
    expect(titres(d).autres).toEqual([]);
    for (const t of TOUS_TITRES.filter((x) => !x.startsWith('B'))) expect(texte, `projet de A visible depuis B · ${t}`).not.toContain(t);
  });
});

describe('Accueil · le nouveau bloc est EN TÊTE, tout l’existant reste dessous', () => {
  it('projets → pilotage → bandeau → marques → prochaine étape → analyse → assistant → exemple', async () => {
    const { html, d } = await accueil(session(ids, 'ua', { role: 'admin' }));
    const etape = html.includes('aria-label="Ta prochaine étape"') ? 'aria-label="Ta prochaine étape"' : 'aria-label="Prépare ta prochaine itération"';
    const ordre = [
      'data-accueil-projets="liste"', 'data-accueil-pilotage', 'aria-label="À la une"', 'aria-label="Tes marques"', etape,
      'Analyser &amp; décider', 'Demande à l’assistant', 'Données de démonstration',
    ].map((m) => [m, html.indexOf(m)] as const);
    for (const [m, i] of ordre) expect(i, `section absente · ${m}`).toBeGreaterThan(-1);
    for (let k = 1; k < ordre.length; k++) expect(ordre[k - 1]![1], `${ordre[k - 1]![0]} doit précéder ${ordre[k]![0]}`).toBeLessThan(ordre[k]![1]);
    // Onglets Accueil · Analytics toujours là.
    expect(d.querySelector('nav[aria-label="Vues de l’accueil"]')).not.toBeNull();
    // La rangée Studios d'avant ne double pas les gestes de la tête.
    expect(html, 'la rangée Studios double « Nouveau projet »').not.toContain('Créer les variantes de ton test');
  });
});

describe('Accueil · le bandeau se tait quand la tête porte déjà ses gestes', () => {
  it('marque active, projets et Résultats en tête · plus de « Prépare ton prochain test » (Voir mes tests, Créer une pub en doublon)', async () => {
    h.marque = { id: ids.brandA1, name: 'A1' };
    try {
      const { html } = await accueil(session(ids, 'ua', { role: 'admin' }));
      expect(html, 'la tête de projets manque').toContain('data-accueil-projets="liste"');
      expect(html, 'le bandeau double la tête (Voir mes tests, Créer une pub)').not.toContain('aria-label="À la une"');
    } finally { h.marque = null; }
  });

  it('sans marque active · « Choisir une marque » n’est porté nulle part · le bandeau reste', async () => {
    const { html } = await accueil(session(ids, 'ua', { role: 'admin' }));
    expect(html).toContain('aria-label="À la une"');
  });
});

describe('Accueil · piloter l’activité selon les droits', () => {
  const pilotage = (d: HTMLElement) => [...d.querySelectorAll('[data-accueil-pilotage] a')].map((a) => a.getAttribute('href'));
  it('membre · Résultats et Jarvis, PAS Activité et coûts (réservée aux admins)', async () => {
    const { d } = await accueil(session(ids, 'ua'));
    expect(pilotage(d)).toEqual(['/adsmap', '/jarvis']);
  });
  it('propriétaire · Résultats, Activité et coûts, Jarvis', async () => {
    const { d, texte } = await accueil(session(ids, 'ua', { role: 'owner' }));
    expect(pilotage(d)).toEqual(['/adsmap', '/usage', '/jarvis']);
    expect(texte).toContain('Activité et coûts');
  });
  it('équipe plateforme au rôle d’espace « membre » · la matrice voit /usage, la page la refuserait · absent', async () => {
    // Lot 12 · `/usage` est gardée par le rôle d'ESPACE (admin) · le menu de compte suit cette garde.
    const s = session(ids, 'ua', { equipe: { role: 'admin', matrice: {}, plateformeAdmissible: false } as SessionTest['equipe'] });
    const { d } = await accueil(s);
    expect(pilotage(d), 'lien vers une page qui renverrait à l’accueil').not.toContain('/usage');
    expect(pilotage(d)).toEqual(['/adsmap', '/jarvis']);
  });
  it('client en lecture · aucun bloc projet, aucun pilotage, l’Accueil d’avant reste', async () => {
    const { d, texte } = await accueil(session(ids, 'uv'));
    expect(d.querySelector('[data-accueil-projets]'), 'bloc projet montré à un rôle sans Studios').toBeNull();
    expect(d.querySelector('[data-accueil-pilotage]'), 'pilotage sans aucun accès ouvert').toBeNull();
    for (const t of TOUS_TITRES) expect(texte).not.toContain(t);
    expect(texte).toContain('Bonjour');
    expect(d.querySelector('[aria-label="Tes marques"]'), 'les marques ont disparu').not.toBeNull();
  });
});

describe('Accueil · états dégradés · le reste s’affiche toujours', () => {
  it('capacité « projets » coupée pour l’espace · une note, aucun projet, aucun geste mort', async () => {
    const value = { actives: [], coupees: ['projets'] };
    await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
    const { d, html, texte } = await accueil(session(ids, 'ua'));
    expect(d.querySelector('[data-accueil-projets]')?.getAttribute('data-accueil-projets')).toBe('coupee');
    expect(texte).toContain('non activé pour cet espace');
    for (const t of TOUS_TITRES) expect(texte, `projet montré malgré la coupure · ${t}`).not.toContain(t);
    expect(html, 'un lien vers la préparation reste malgré la coupure').not.toMatch(/href="\/studio\/projets\/nouveau"/);
    expect(d.querySelector('[aria-label="Tes marques"]')).not.toBeNull();
  });

  it('panne de lecture · bloc discret, le reste de l’Accueil s’affiche', async () => {
    h.panne = true;
    const { d, texte } = await accueil(session(ids, 'ua'));
    const bloc = d.querySelector('[data-accueil-projets="erreur"]');
    expect(bloc, 'la panne n’est pas dite').not.toBeNull();
    expect(bloc!.getAttribute('role')).toBe('status');
    expect(texte).toContain('n’ont pas pu être lus');
    expect(d.querySelector('[aria-label="Tes marques"]'), 'la panne a emporté le reste de l’Accueil').not.toBeNull();
    expect(texte).toContain('Demande à l’assistant');
    // La rangée Studios d'avant reste la porte vers les projets.
    expect(texte).toContain('Créer les variantes de ton test');
  });

  it('premier usage (aucun projet) · « Nouveau projet » proposé, l’accompagnement reste', async () => {
    const { d, texte } = await accueil(session(ids, 'ua', { workspaceId: ids.wsC, workspaceName: 'Espace C' }));
    const bloc = d.querySelector('[data-accueil-projets="premier-usage"]');
    expect(bloc, 'le premier usage n’est pas rendu').not.toBeNull();
    expect(bloc!.querySelector('a[href="/studio/projets/nouveau"]')?.textContent).toBe('Nouveau projet');
    expect(d.querySelector('[data-reprendre]'), 'un projet à reprendre inventé').toBeNull();
    for (const t of TOUS_TITRES) expect(texte).not.toContain(t);
    // L'accompagnement existant (prochaine étape / parcours) est toujours rendu.
    expect(texte).toMatch(/Prochaine étape|Prépare ta prochaine itération|En attente/);
  });
});

describe('Accueil · une visite n’écrit RIEN', () => {
  it('membre, restreint, lecteur, propriétaire, espace vide, capacité coupée, panne · base identique', async () => {
    const avant = await empreinteBase();
    h.requetes = [];
    expect(Object.keys(avant).length, 'l’empreinte ne lit pas les tables').toBeGreaterThan(20);
    for (const s of [session(ids, 'ua'), session(ids, 'ur'), session(ids, 'uv'), session(ids, 'ub'), session(ids, 'ua', { role: 'owner' }), session(ids, 'ua', { workspaceId: ids.wsC })]) {
      await accueil(s);
    }
    h.panne = true;
    await accueil(session(ids, 'ua'));
    // Aucune instruction d'écriture n'est même ENVOYÉE (une écriture idempotente ne changerait pas l'empreinte).
    const lues = h.requetes.filter((t) => /^\s*select\b/i.test(t));
    expect(lues.length, 'le journal ne voit pas les requêtes de l’Accueil').toBeGreaterThan(10);
    expect(h.requetes.filter((t) => /^\s*(insert|update|delete|truncate|alter|create|drop)\b/i.test(t)), 'la visite de l’Accueil envoie une écriture').toEqual([]);
    expect(await empreinteBase(), 'la visite de l’Accueil a écrit en base').toEqual(avant);
  });
});
