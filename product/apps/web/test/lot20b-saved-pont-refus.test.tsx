import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 20B · Sauvegardes · le pont Adsmap fermé DIT pourquoi.
 *
 * Mesuré avant correction (70200777) · quand `adsmapOpen` est faux (offre sans
 * Adsmap, rôle d'équipe sans la rubrique, ou aucune marque active), chaque carte
 * s'arrêtait sur son choix « Format » · aucun bouton, aucune mention d'Adsmap,
 * le geste disparaissait sans un mot. Même règle que `/veille/formats` (message
 * 60) · raison RÉELLE calculée côté serveur (`denyReason(access, Adsmap)` puis
 * marque active), texte du noyau, aucun bouton actif ni lien d'achat. On rend la
 * page RÉELLE (pglite) et on lit le HTML de chaque carte.
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), marque: randomUUID(), user: randomUUID() };
});
type EquipeTest = { role: 'membre'; matrice: Record<string, never> } | null;
const session = vi.hoisted(() => ({ plan: 'starter' as string, role: 'member' as string, marque: true, equipe: null as EquipeTest }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.user, email: 'membre@agence.test', name: 'Membre' },
    workspaceId: ids.ws, workspaceName: 'Agence', role: session.role, plan: session.plan, equipe: session.equipe,
  }),
}));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => (session.marque ? { id: ids.marque, name: 'Marque', workspaceId: ids.ws } : null) }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/saved',
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));

import { db, schema } from '@tiktrends/db';
import SavedPage from '../app/(app)/saved/page';

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@agence.test', name: 'Membre' });
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'starter' });
  await db!.insert(schema.brands).values({ id: ids.marque, workspaceId: ids.ws, name: 'Marque' });
  for (const n of ['p1', 'p2']) {
    await db!.insert(schema.savedAds).values({ workspaceId: ids.ws, brandId: ids.marque, platform: 'meta', externalId: n, folder: n === 'p1' ? 'Hooks' : null,
      snapshot: { id: n, platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'Annonceur ' + n } });
  }
});
beforeEach(() => { session.plan = 'starter'; session.role = 'member'; session.marque = true; session.equipe = null; });

const page = async () => renderToStaticMarkup(await SavedPage({ searchParams: Promise.resolve({ onglet: 'creations' }) }));
const nCartes = (h: string) => (h.match(/data-format-choix/g) ?? []).length;
const refus = (h: string) => [...h.matchAll(/<p data-pont-refus[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
const boutonsPont = (h: string) => (h.match(/<button[^>]*>(?:(?!<\/button>).)*Suivre dans Adsmap(?:(?!<\/button>).)*<\/button>/g) ?? []).length;
const lienAchat = /href="[^"]*(billing|abonnement|plans|reglages|settings|upgrade|tarif)/i;

describe('Sauvegardes · pont Adsmap fermé · la raison réelle à la place du bouton', () => {
  it('offre (Starter · droits inchangés) · « inclus dans l’offre Plus » sur chaque carte, aucun bouton, aucun lien d’achat', async () => {
    const h = await page();
    expect(nCartes(h), 'les cartes ne sont pas rendues').toBe(2);
    expect(refus(h), 'refus muet · aucune explication').toEqual(['Suivre dans Adsmap · inclus dans l’offre Plus.', 'Suivre dans Adsmap · inclus dans l’offre Plus.']);
    expect(boutonsPont(h), 'un bouton Adsmap est proposé à un compte sans Adsmap').toBe(0);
    expect(h, 'un lien d’achat ou d’offre est proposé').not.toMatch(lienAchat);
  });

  it('rôle (équipe « membre », Adsmap hors de ses rubriques) · « réservé aux rôles… »', async () => {
    session.plan = 'business'; session.equipe = { role: 'membre', matrice: {} };
    const h = await page();
    expect(nCartes(h)).toBe(2);
    expect(refus(h)).toEqual(['Suivre dans Adsmap · réservé aux rôles qui ont accès à Adsmap.', 'Suivre dans Adsmap · réservé aux rôles qui ont accès à Adsmap.']);
    expect(boutonsPont(h)).toBe(0);
  });

  it('marque active absente (offre Plus) · « choisis d’abord une marque active »', async () => {
    session.plan = 'plus'; session.marque = false;
    const h = await page();
    expect(nCartes(h)).toBe(2);
    expect(refus(h)).toEqual(['Suivre dans Adsmap · choisis d’abord une marque active.', 'Suivre dans Adsmap · choisis d’abord une marque active.']);
    expect(boutonsPont(h)).toBe(0);
  });

  it('autorisé (Plus, marque active) · inchangé · un bouton actif par carte, aucune explication', async () => {
    session.plan = 'plus';
    const h = await page();
    expect(nCartes(h)).toBe(2);
    expect(boutonsPont(h), 'le bouton Adsmap a disparu du parcours autorisé').toBe(2);
    expect(h).not.toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Suivre dans Adsmap/);
    expect(refus(h), 'une explication de refus s’affiche sur un pont ouvert').toEqual([]);
  });
});
