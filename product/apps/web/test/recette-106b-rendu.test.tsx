import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { texteVisible } from './helpers/jargon-ecran';
import { BANDEAU_DEMO_VEILLE } from '@tiktrends/core';

/**
 * Recette #106b · rendus lus au HTML ·
 *  · fiche Marque · 44 px de zone cliquable sans grossir le visuel, onglet actif annoncé ;
 *  · Réglages · panneau Stockage · copie client sans infrastructure (l'opérateur garde ses consignes) ;
 *  · « Ce qui scale » et fiche concurrent · plus de « non configuré sur le serveur ».
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('404'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/brands', () => ({ renameBrandAction: async () => ({}) }));
vi.mock('../app/actions/storage', () => ({ configureBucketAction: async () => ({}), testStorageAction: async () => ({}), embeddedImagesStatusAction: async () => ({}), migrateEmbeddedImagesAction: async () => ({}) }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid' } }) }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));
vi.mock('../lib/veille-cache', () => ({ getVeilleCache: async () => null, isFresh: () => false, setVeilleCache: async () => {}, refreshAllowed: () => false }));
vi.mock('../app/(app)/veille/scale/SwipeFile', () => ({ SwipeFile: () => null }));
vi.mock('../app/actions/competitor', () => ({ analyzeCompetitorAction: async () => ({}), getCompetitorReport: async () => null }));
// Une base factice minimale · `select().from().where().limit()` rend la marque.
const chaine = { select: () => chaine, from: () => chaine, where: () => chaine, limit: async () => [{ id: 'b', name: 'Neva', competitors: [{ name: 'Rival' }] }] };
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: chaine }));




// Vague 2 · le panneau Stockage vit dans l'écran Spatial Espace · garde portée dans `spatial-reglages-gestes.test.tsx`.
describe('Veille · écrans client sans « non configuré sur le serveur »', () => {
  it('« Ce qui scale » en démonstration', async () => {
    delete process.env.TRENDTRACK_API_KEY;
    const { default: Page } = await import('../app/(app)/veille/scale/page');
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) } as never));
    expect(html).toContain('Mode démonstration');
    expect(html, 'le bandeau client n’est pas rendu').toContain(BANDEAU_DEMO_VEILLE);
    expect(texteVisible(html), 'le bandeau parle encore du serveur').not.toMatch(/configur[ée]+ sur le serveur/);
  });
  // Vague 2 · la fiche concurrent est servie par Spatial · copie gardée dans `concurrent-cta.test.tsx`.
});
