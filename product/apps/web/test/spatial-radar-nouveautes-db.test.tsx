// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * Planche de banc v4 (G16) · l'en-tête du Radar annonçait « Aroma-Zone a lancé
 * 3 nouvelles pubs cette semaine » et chaque carte de marque disait « Aucune
 * nouveauté ». Deux règles de comptage · l'en-tête comptait les pubs des
 * 7 derniers jours (vues ou non) par NOM d'annonceur, la carte les pubs NON VUES
 * de tout temps par marque suivie.
 *
 * Garde de RÉSULTAT sur une VRAIE base (pglite) · on rend la VRAIE page Radar
 * et on exige, pour chaque marque suivie, que le nombre de l'en-tête soit celui
 * de sa carte · vues comprises, même fenêtre, même marque (même quand le nom
 * d'annonceur relevé diffère du nom suivi).
 */

const h = vi.hoisted(() => ({ session: null as SessionTest | null, marque: null as { id: string; name: string } | null, ids: {} as Record<string, string> }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'u', 'b', 'az', 'ty', 'hu']) h.ids[k] = randomUUID();
});
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/radar',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema } from '@tiktrends/db';
import RadarSpatial from '../app/(spatial)/sp/radar/page';
import { avecSpatial } from './spatial/fournisseur';

const I = h.ids;
const JOUR = 86_400_000;
const il = (j: number) => new Date(Date.now() - j * JOUR);

/** Ce que l'écran dit, marque par marque · le nombre de l'en-tête et celui de la carte. */
async function radar() {
  h.session = { user: { id: I.u!, email: 'proprio@radar.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: 'owner', plan: 'business', equipe: null };
  h.marque = { id: I.b!, name: 'Neva' };
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(avecSpatial(await RadarSpatial()));
  const entete = new Map<string, number>();
  for (const a of d.querySelectorAll('article strong')) {
    const m = /^(.+) a lancé (\d+) nouvelles? pubs? cette semaine$/.exec(a.textContent ?? '');
    if (m) entete.set(m[1]!, Number(m[2]));
  }
  const cartes = new Map<string, { n: number; texte: string }>();
  for (const t of d.querySelectorAll('.grid3 > .tile')) {
    const nom = t.querySelector('h3')?.textContent ?? '';
    const pied = [...t.querySelectorAll('.member')][1]?.textContent ?? '';
    const n = /(\d+) nouvelles? pubs? cette semaine/.exec(pied);
    cartes.set(nom, { n: n ? Number(n[1]) : 0, texte: pied });
  }
  return { entete, cartes };
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'business' });
  await db!.insert(schema.users).values({ id: I.u!, email: 'proprio@radar.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: I.ws!, userId: I.u!, role: 'owner' });
  await db!.insert(schema.brands).values({ id: I.b!, workspaceId: I.ws!, name: 'Neva', description: 'Maillots' });
  await db!.insert(schema.followedBrands).values([
    { id: I.az!, workspaceId: I.ws!, brandId: I.b!, platform: 'meta', name: 'Aroma-Zone' },
    { id: I.ty!, workspaceId: I.ws!, brandId: I.b!, platform: 'meta', name: 'Typology' },
    { id: I.hu!, workspaceId: I.ws!, brandId: I.b!, platform: 'meta', name: 'Huygens' },
  ]);
  const ev = (fb: string, nom: string, j: number, vu: boolean) => ({ workspaceId: I.ws!, followedBrandId: fb, platform: 'meta', advertiserName: nom, snapshot: {}, createdAt: il(j), seenAt: vu ? il(0) : null });
  await db!.insert(schema.brandTrackerEvents).values([
    // Le cas du banc · trois pubs de la semaine, toutes déjà VUES · dont une relevée sous un autre nom d'annonceur.
    ev(I.az!, 'Aroma-Zone', 1, true), ev(I.az!, 'Aroma-Zone', 2, true), ev(I.az!, 'AROMA-ZONE SAS', 3, true),
    // Deux vieilles non vues, hors fenêtre · ni alerte, ni nouveauté de la semaine.
    ev(I.ty!, 'Typology', 20, false), ev(I.ty!, 'Typology', 30, false),
    // Deux de la semaine, dont une non vue.
    ev(I.hu!, 'Huygens', 1, false), ev(I.hu!, 'Huygens', 4, true),
  ]);
});

describe('Radar · l’en-tête et les cartes comptent pareil', () => {
  it('pour chaque marque suivie, le nombre de l’en-tête EST celui de sa carte', async () => {
    const { entete, cartes } = await radar();
    expect([...cartes.keys()].sort()).toEqual(['Aroma-Zone', 'Huygens', 'Typology']);
    for (const [nom, c] of cartes) expect(c.n, `${nom} · en-tête ${entete.get(nom) ?? 0}, carte « ${c.texte} »`).toBe(entete.get(nom) ?? 0);
    expect(entete.get('Aroma-Zone'), 'le cas du banc · trois pubs vues de la semaine').toBe(3);
    expect(cartes.get('Aroma-Zone')!.texte).toContain('3 nouvelles pubs cette semaine');
    expect(cartes.get('Aroma-Zone')!.texte).not.toContain('Aucune nouveauté');
    expect(cartes.get('Huygens')!.texte).toContain('2 nouvelles pubs cette semaine · 1 non vue');
    expect(entete.has('Typology'), 'des pubs hors fenêtre ne font pas une alerte').toBe(false);
    expect(cartes.get('Typology')!.texte).toContain('Aucune nouveauté cette semaine');
  });

  it('tout marqué vu · les nombres ne bougent pas, en-tête et cartes restent d’accord', async () => {
    await db!.update(schema.brandTrackerEvents).set({ seenAt: new Date() });
    const { entete, cartes } = await radar();
    for (const [nom, c] of cartes) expect(c.n, `${nom} · en-tête ${entete.get(nom) ?? 0}, carte « ${c.texte} »`).toBe(entete.get(nom) ?? 0);
    expect(cartes.get('Huygens')!.texte).toContain('2 nouvelles pubs cette semaine');
    expect(cartes.get('Huygens')!.texte).not.toContain('non vue');
  });
});
