import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette #106b · Veille · le périmètre de recherche, rendu et lu au HTML ·
 * visible à côté du champ, exemple accordé, compteur « Filtres » sans les
 * défauts, lien direct et formulaire équivalents, état vide qui nomme le
 * périmètre et propose « Marque ». Serveur simulé, ni base ni réseau.
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
const resume = (html: string) => (html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '').trim()).find((t) => t.startsWith('Filtres')) ?? '';
const puces = (html: string) => [...html.matchAll(/title="Retirer ce critère"[^>]*>([^<]+)/g)].map((m) => m[1]!.trim());

describe('Veille · périmètre visible à côté du champ', () => {
  it('« Dans » et ses trois choix sont dans la barre principale, pas dans Filtres', async () => {
    const html = await rendre({});
    const barre = html.slice(0, html.indexOf('<details'));
    expect(barre, 'le périmètre est caché dans Filtres').toMatch(/<select name="searchIn"[^>]*aria-label="Chercher dans"/);
    expect(barre).toContain('>Texte de l’annonce</option>');
    expect(barre).toContain('>Marque</option>');
    expect(html.slice(html.indexOf('<details')), 'le périmètre est encore dans Filtres').not.toContain('name="searchIn"');
  });
  it('l’exemple du champ suit le périmètre', async () => {
    expect(await rendre({})).toMatch(/<input[^>]*placeholder="Ex : routine du soir[^>]*name="q"/);
    expect(await rendre({ searchIn: 'brand' })).toMatch(/<input[^>]*placeholder="Ex : Neutrogena[^>]*name="q"/);
  });
});

describe('Veille · « Filtres · N actifs » ne compte que les écarts au défaut', () => {
  it('formulaire soumis au défaut (texte + Récentes) · aucun filtre, aucune puce', async () => {
    const html = await rendre({ q: 'serum', searchIn: 'ad_copy', sort: 'newest' });
    expect(resume(html), 'les valeurs par défaut comptent comme filtres').toBe('Filtres▾');
    expect(puces(html), 'des puces retirables pour des défauts').toEqual([]);
  });
  it('« Marque » choisi · 1 actif, une puce « Dans : Marque »', async () => {
    const html = await rendre({ q: 'neutrogena', searchIn: 'brand', sort: 'reach' });
    expect(resume(html)).toBe('Filtres · 1 actif▾');
    expect(puces(html)).toEqual(['Dans : Marque ✕'.replace(' ✕', '')]);
  });
});

describe('Veille · lien direct et formulaire ont le même sens', () => {
  it('`?q=neutrogena` = formulaire au défaut · mêmes cartes, même état vide', async () => {
    const lien = await rendre({ q: 'neutrogena' });
    const formulaire = await rendre({ q: 'neutrogena', searchIn: 'ad_copy', sort: 'newest' });
    expect(cartes(lien), 'le lien direct ne cherche pas au même endroit que le formulaire').toEqual(cartes(formulaire));
    expect(lien.includes('Aucune annonce dont le texte de l’annonce contient « neutrogena »')).toBe(formulaire.includes('Aucune annonce dont le texte de l’annonce contient « neutrogena »'));
  });
});

describe('Veille · une marque introuvable ne ressemble pas à une panne', () => {
  it('l’état vide nomme le périmètre et propose « Chercher dans Marque »', async () => {
    const html = await rendre({ q: 'neutrogena' });
    expect(cartes(html)).toEqual([]);
    expect(html, 'l’état vide ne dit pas où l’on a cherché').toContain('Aucune annonce dont le texte de l’annonce contient « neutrogena »');
    expect(html, 'pas de passage vers « Marque »').toMatch(/<a href="\/veille\?q=neutrogena&amp;searchIn=brand&amp;page=1"[^>]*>Chercher dans « Marque »<\/a>/);
  });
  it('et dans « Marque », la marque est trouvée', async () => {
    expect(cartes(await rendre({ q: 'neutrogena', searchIn: 'brand' }))).toEqual(['sample_neutrogena']);
  });
});
