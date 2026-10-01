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

import { RetourMarques, LienEnteteMarque, OngletsFiche } from '../app/(app)/brands/[id]/NavFiche';
import { RenameMarque } from '../components/RenameMarque';
import { StorageConfigurator } from '../components/StorageConfigurator';

/** Valeur numérique d'une propriété CSS en ligne (px) dans un attribut style rendu. */
const px = (style: string, prop: string) => { const m = style.match(new RegExp(`(?:^|;)${prop}:(-?[\\d.]+)px`)); return m ? Number(m[1]) : 0; };
const styleDe = (html: string, re: RegExp) => (html.match(re)?.[1] ?? '');

describe('Fiche Marque · zone cliquable de 44 px, visuel inchangé', () => {
  it('« ‹ Marques » · lien en ligne, rembourrage 19 + 10 autour de ses 15 px', () => {
    const st = styleDe(renderToStaticMarkup(<RetourMarques />), /<a [^>]*style="([^"]+)"/);
    expect(15 + px(st, 'padding-top') + px(st, 'padding-bottom'), `zone du retour : ${st}`).toBe(44);
    expect(px(st, 'margin-top'), 'le lien en ligne ne doit pas bouger').toBe(0);
  });

  it('onglets · seul l’actif porte aria-current, chaque onglet fait 44 sans repousser le filet', () => {
    const html = renderToStaticMarkup(<OngletsFiche id="b" actif="products" onglets={[{ key: 'overview', label: 'Aperçu' }, { key: 'products', label: 'Produits', count: 3 }]} />);
    const liens = [...html.matchAll(/<a ([^>]*)>/g)].map((m) => m[1] ?? "");
    expect(liens.filter((a) => a.includes('aria-current="page"')).length, 'l’onglet actif ne s’annonce pas').toBe(1);
    expect(liens.find((a) => a.includes('aria-current'))!, 'aria-current sur le mauvais onglet').toContain('tab=products');
    for (const a of liens) {
      const st = styleDe(a, /style="([^"]+)"/);
      // 13.5 px de texte · 18 de ligne + 2 de soulignement · la boîte visuelle mesurée fait 40.
      const [, haut, bas] = st.match(/padding:(\d+)px \d+px (\d+)px/) ?? ['', '9', '9'];
      const zone = 40 - 9 - 9 + Number(haut) + Number(bas);
      expect(zone, `onglet sous 44 : ${st}`).toBe(44);
      expect(px(st, 'margin-top'), 'l’extension n’est pas compensée · la rangée grossit').toBe(-(Number(haut) - 9));
    }
  });

  it('lien d’en-tête · la pilule visible garde sa taille, le lien fait 44', () => {
    const html = renderToStaticMarkup(<LienEnteteMarque href="/connections">Connexions</LienEnteteMarque>);
    const ext = styleDe(html, /<a [^>]*style="([^"]+)"/);
    const pil = styleDe(html, /<span style="([^"]+)"/);
    expect(37 + px(ext, 'padding-top') + px(ext, 'padding-bottom'), `zone : ${ext}`).toBe(44);
    expect(px(ext, 'margin-top') + px(ext, 'padding-top'), 'extension haute non compensée').toBe(0);
    expect(px(ext, 'margin-bottom') + px(ext, 'padding-bottom'), 'extension basse non compensée').toBe(0);
    expect(pil, 'la pilule a changé de taille').toContain('min-height:36px');
    expect(ext, 'la bordure est passée sur le lien étendu').not.toContain('border:');
  });

  it('crayon « Renommer » · bouton 44 transparent, carré visible de 34, marge compensée', () => {
    const html = renderToStaticMarkup(<RenameMarque id="b" name="Neva" />);
    const bt = styleDe(html, /<button [^>]*style="([^"]+)"/);
    expect(px(bt, 'width'), `bouton : ${bt}`).toBe(44);
    expect(px(bt, 'height')).toBe(44);
    const m = bt.match(/margin:(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/);
    expect(m, `marge absente : ${bt}`).toBeTruthy();
    const [, mh, ml, mb] = m!.map(Number);
    expect(34 - mh! - mb!, 'l’extension verticale ne fait pas 44').toBe(44);
    expect(34 - 2 * ml!, 'l’extension horizontale ne fait pas 44').toBe(44);
    expect(mb, 'le crayon déborde sur le sous-titre').toBe(0);
    expect(html).toMatch(/<span style="width:34px;height:34px/);
  });
});

describe('Réglages · panneau Stockage · copie client (recette #106b)', () => {
  it('client, stockage pas activé · ce qui manque, qui agit, aucun terme d’infrastructure', () => {
    const html = renderToStaticMarkup(<StorageConfigurator enabled={false} />);
    expect(jargonEcran(texteVisible(html)), `jargon : ${texteVisible(html)}`).toEqual([]);
    expect(texteVisible(html)).toMatch(/notre équipe l’active sur demande/);
    expect(html).toContain('href="/support"');
  });
  it('client, stockage activé · boutons nommés sans bucket ni CORS', () => {
    const html = renderToStaticMarkup(<StorageConfigurator enabled />);
    expect(jargonEcran(texteVisible(html)), `jargon : ${texteVisible(html)}`).toEqual([]);
  });
  it('opérateur (équipe plateforme) · garde ses consignes techniques', () => {
    expect(texteVisible(renderToStaticMarkup(<StorageConfigurator enabled={false} operateur />))).toContain('.env.deploy');
    expect(texteVisible(renderToStaticMarkup(<StorageConfigurator enabled operateur />))).toContain('Configurer le bucket');
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
