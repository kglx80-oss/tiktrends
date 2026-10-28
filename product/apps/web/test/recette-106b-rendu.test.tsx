import { describe, expect, it, vi } from 'vitest';
import { texteVisible } from './helpers/jargon-ecran';

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
vi.mock('../app/actions/competitor', () => ({ analyzeCompetitorAction: async () => ({}), getCompetitorReport: async () => null }));
// Une base factice minimale · `select().from().where().limit()` rend la marque.
const chaine = { select: () => chaine, from: () => chaine, where: () => chaine, limit: async () => [{ id: 'b', name: 'Neva', competitors: [{ name: 'Rival' }] }] };
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: chaine }));




// Vague 2 · le panneau Stockage vit dans l'écran Spatial Espace · garde portée dans `spatial-reglages-gestes.test.tsx`.
describe('Veille · écrans client sans « non configuré sur le serveur »', () => {
  it('« Ce qui scale » en démonstration', async () => {
    // Vague 4 · la page V5 est retirée · l'écran Spatial dit la démonstration dans son sous-titre.
    delete process.env.TRENDTRACK_API_KEY;
    const { default: Page } = await import('../app/(spatial)/sp/veille/scale/page');
    const el = (await Page({ searchParams: Promise.resolve({}) } as never)) as { props: { sous: string } };
    expect(el.props.sous).toBe('Démonstration · un échantillon réel, la recherche en direct n’est pas encore activée pour ton espace');
    expect(texteVisible(el.props.sous), 'le sous-titre parle encore du serveur').not.toMatch(/configur[ée]+ sur le serveur/);
  });
  // Vague 2 · la fiche concurrent est servie par Spatial · copie gardée dans `concurrent-cta.test.tsx`.
});
