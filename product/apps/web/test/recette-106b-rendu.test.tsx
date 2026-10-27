import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { jargonEcran, texteVisible } from './helpers/jargon-ecran';
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

import { StorageConfigurator } from '../components/StorageConfigurator';



describe('Réglages · panneau Stockage · copie client (recette #106b)', () => {
  it('client, stockage pas activé · ce qui manque, qui agit, aucun terme d’infrastructure', () => {
    const html = renderToStaticMarkup(<StorageConfigurator enabled={false} />);
    expect(jargonEcran(texteVisible(html)), `jargon : ${texteVisible(html)}`).toEqual([]);
    expect(texteVisible(html)).toMatch(/côté plateforme, pas depuis ton espace/);
    // Lot 11 · le lien dit ce qu'il fait · un ticket interne, lu par les admins de l'espace.
    expect(html).toMatch(/<a [^>]*href="\/support"[^>]*>Ouvrir un ticket interne<\/a>/);
    expect(texteVisible(html)).toContain('seuls ses admins le lisent');
  });
  it('client, stockage activé · aucune commande globale du bucket', () => {
    const html = renderToStaticMarkup(<StorageConfigurator enabled />);
    expect(html).not.toContain('<button');
    expect(jargonEcran(texteVisible(html)), `jargon : ${texteVisible(html)}`).toEqual([]);
  });
  it('opérateur (équipe plateforme) · garde ses consignes techniques', () => {
    expect(texteVisible(renderToStaticMarkup(<StorageConfigurator enabled={false} operateur />))).toContain('.env.deploy');
    expect(texteVisible(renderToStaticMarkup(<StorageConfigurator enabled operateur />))).toContain('Configurer le stockage privé');
  });
});

describe('Veille · écrans client sans « non configuré sur le serveur »', () => {
  it('« Ce qui scale » en démonstration', async () => {
    delete process.env.TRENDTRACK_API_KEY;
    const { default: Page } = await import('../app/(app)/veille/scale/page');
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) } as never));
    expect(html).toContain('Mode démonstration');
    expect(html, 'le bandeau client n’est pas rendu').toContain(BANDEAU_DEMO_VEILLE);
    expect(texteVisible(html), 'le bandeau parle encore du serveur').not.toMatch(/configur[ée]+ sur le serveur/);
  });
  it('fiche concurrent · retour « bibliothèque indisponible »', async () => {
    const { default: Page } = await import('../app/(app)/brands/[id]/competitors/[name]/page');
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'b', name: 'Rival' }), searchParams: Promise.resolve({ e: 'nolibrary' }) } as never));
    const t = texteVisible(html);
    expect(t, 'le message d’erreur n’est pas rendu').toMatch(/pas encore activée pour ton espace/);
    expect(jargonEcran(t), `jargon : ${t}`).toEqual([]);
  });
});
