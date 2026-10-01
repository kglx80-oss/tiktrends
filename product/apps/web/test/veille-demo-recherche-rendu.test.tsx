import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette #106 · constat Codex · en démonstration (aucune source branchée), la
 * Veille ignorait le mot-clé · `/veille?q=zzzzzzzz` montrait encore les deux
 * cartes d'échantillon et l'état « aucun résultat » était inatteignable.
 *
 * On REND la page elle-même (serveur simulé · pas de base, pas de réseau, pas
 * de source) et on lit le HTML · un mot-clé sans correspondance montre l'état
 * vide, un mot-clé qui correspond ne garde que sa carte.
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/veille', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null }));
vi.mock('../lib/veille-recette-base', () => ({ baseUrlRecette: () => undefined, cleEffective: () => undefined }));
vi.mock('../app/(app)/jarvis/sections/SectionMarche', () => ({ SectionMarche: () => null }));
vi.mock('../components/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string; advertiserName?: string } }) => <article data-carte={ad.id}>{ad.advertiserName}</article>,
  compact: (n: number) => String(n),
}));

import InspoPage from '../app/(app)/veille/page';

const rendre = async (sp: Record<string, string>) => renderToStaticMarkup(await InspoPage({ searchParams: Promise.resolve(sp) }));
const cartes = (html: string) => [...html.matchAll(/data-carte="([^"]+)"/g)].map((m) => m[1]);

describe('Veille · démonstration · la recherche filtre vraiment l’échantillon', () => {
  it('sans mot-clé, l’échantillon entier', async () => {
    expect(cartes(await rendre({})).length).toBeGreaterThanOrEqual(2);
  });

  it('un mot-clé sans correspondance montre l’état vide, plus aucune carte', async () => {
    const html = await rendre({ q: 'zzzzzzzz' });
    expect(cartes(html), 'le mot-clé est ignoré en démonstration').toEqual([]);
    expect(html, 'l’état « aucun résultat » ne s’affiche pas').toContain('Aucune annonce de l’échantillon pour « zzzzzzzz »');
    expect(html).toContain('href="/veille"');
  });

  it('un mot-clé qui correspond ne garde que sa carte', async () => {
    const html = await rendre({ q: 'neutrogena' });
    expect(cartes(html)).toEqual(['sample_neutrogena']);
    expect(html).not.toContain('Aucune annonce de l’échantillon');
  });

  it('un filtre posé s’applique aussi (média image · aucun visuel dans l’échantillon)', async () => {
    expect(cartes(await rendre({ media: 'image' })), 'le filtre média est ignoré en démonstration').toEqual([]);
  });

  it('le bandeau de démonstration ne parle plus de configuration serveur', async () => {
    const html = await rendre({});
    expect(html).toContain('Mode démonstration');
    expect(html).not.toMatch(/configur[ée]+ sur le serveur/);
  });
});
