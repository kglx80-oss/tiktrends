import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 19C · message 60 · le pont Adsmap fermé DIT pourquoi, sur `/veille/formats`.
 * Mesuré au navigateur (m59, build ba703860) · pour un compte Core, la carte
 * défilée s'arrêtait sur la définition du format · aucun bouton, aucune mention
 * d'Adsmap. On rend la page RÉELLE (pglite) par raison (offre, rôle, marque
 * absente) et le parcours autorisé, et on lit le HTML de la carte.
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), marque: randomUUID(), user: randomUUID() };
});
type EquipeTest = { role: 'membre'; matrice: Record<string, never> } | null;
const session = vi.hoisted(() => ({ plan: 'core' as string, role: 'member' as string, marque: true, equipe: null as EquipeTest }));

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
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/veille/formats',
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));

import { db, schema } from '@tiktrends/db';
import FormatsPage from '../app/(app)/veille/formats/page';

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@agence.test', name: 'Membre' });
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'core' });
  await db!.insert(schema.brands).values({ id: ids.marque, workspaceId: ids.ws, name: 'Marque' });
  await db!.insert(schema.savedAds).values({ workspaceId: ids.ws, brandId: ids.marque, platform: 'meta', externalId: 'p1',
    snapshot: { id: 'p1', platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'Annonceur', formatCreatif: { id: 'packshot', version: 1 } } });
});
beforeEach(() => { session.plan = 'core'; session.role = 'member'; session.marque = true; session.equipe = null; });

const carte = async () => {
  const h = renderToStaticMarkup(await FormatsPage({ searchParams: Promise.resolve({ format: 'packshot' }) }));
  const i = h.indexOf('data-annonce="p1"');
  expect(i, 'la carte n’est pas rendue').toBeGreaterThan(-1);
  return h.slice(i, h.indexOf('</article>', i));
};
const refus = (c: string) => /<p data-pont-refus[^>]*>([^<]*)<\/p>/.exec(c)?.[1] ?? null;

describe('/veille/formats · pont Adsmap fermé · la raison réelle à la place du bouton', () => {
  it('offre (Core) · « inclus dans l’offre Plus », aucun bouton, aucun lien d’achat', async () => {
    const c = await carte();
    expect(refus(c), 'refus muet · aucune explication').toBe('Préparer un test dans Adsmap · inclus dans l’offre Plus.');
    expect(c).not.toContain('Préparer un test · Adsmap');
    expect(c, 'un lien d’achat ou d’offre est proposé').not.toMatch(/href="[^"]*(billing|abonnement|plans|reglages|settings)/i);
  });

  it('rôle (équipe « membre », Adsmap hors de ses rubriques) · « réservé aux rôles… »', async () => {
    session.plan = 'business'; session.equipe = { role: 'membre', matrice: {} };
    const c = await carte();
    expect(refus(c)).toBe('Préparer un test dans Adsmap · réservé aux rôles qui ont accès à Adsmap.');
    expect(c).not.toContain('Préparer un test · Adsmap');
  });

  it('marque active absente (offre Plus) · « choisis d’abord une marque active »', async () => {
    session.plan = 'plus'; session.marque = false;
    const c = await carte();
    expect(refus(c)).toBe('Préparer un test dans Adsmap · choisis d’abord une marque active.');
    expect(c).not.toContain('Préparer un test · Adsmap');
  });

  it('autorisé (Plus, marque active) · inchangé · bouton présent, aucune explication', async () => {
    session.plan = 'plus';
    const c = await carte();
    expect(c).toContain('Préparer un test · Adsmap');
    expect(refus(c), 'une explication de refus s’affiche sur un pont ouvert').toBeNull();
  });
});
