import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Consulter n'écrit rien · ouvrir le Studio, une fiche marque ou toute autre page
 * ne doit ni écrire en base ni appeler un site extérieur.
 *
 * ── Le défaut (recette #106) ─────────────────────────────────────────────────
 *
 * Le rendu de /studio/ads, /studio/video et /brands/[id] appelait
 * `ensureBrandEnriched` : dès que la date d'enrichissement avait plus de 6 h,
 * afficher la page ÉCRIVAIT `brands.enriched_at` et, pour une marque avec site,
 * interrogeait ce site (DA, catalogue Shopify, photos produit). Mesuré en local
 * sur main (bf6ef06), sonde réseau active · une DNS et quatre requêtes vers le
 * site de la marque au simple affichage du Studio.
 *
 * ── La règle gardée ──────────────────────────────────────────────────────────
 *
 * Aucun fichier de RENDU (page, layout, template, loading, default) n'importe un
 * module d'enrichissement réseau ni n'appelle une action d'enrichissement.
 * L'enrichissement reste entier, derrière ses gestes EXPLICITES · « Récupérer la
 * DA » (fiche marque), la synchronisation Shopify, la récupération des photos
 * produit (Studio). La preuve au résultat (base identique, zéro sortie réseau)
 * est la recette locale sondée · ce test empêche la régression à la source.
 */
const APP = join(process.cwd(), 'app');
const RENDU = /^(page|layout|template|loading|default)\.tsx?$/;

function fichiersRendu(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiersRendu(p));
    else if (RENDU.test(n)) out.push(p);
  }
  return out;
}

// Modules qui vont chercher dehors · et actions qui enrichissent la marque.
const MODULES_RESEAU = /from\s+['"][^'"]*lib\/(enrich|brand-da|shopify|product-image)['"]/;
const APPELS = /\b(ensureBrandEnriched|extractBrandDA|discoverShopify|resolveProductImage|importBrandDAAction|syncShopifyProductsAction|importAllProductImagesAction|importProductsAction)\s*\(/;

describe('Consulter n’écrit rien · aucun enrichissement au rendu', () => {
  const fichiers = fichiersRendu(APP);

  it('le scanner voit bien les pages concernées (Studio, vidéo, fiche marque)', () => {
    const noms = fichiers.map((f) => relative(APP, f));
    for (const attendu of ['(app)/studio/ads/page.tsx', '(app)/studio/video/page.tsx', '(app)/brands/[id]/page.tsx']) {
      expect(noms, `le scanner ne voit pas ${attendu} · il regarderait ailleurs`).toContain(attendu);
    }
  });

  it('aucune page ni layout n’importe un module d’enrichissement réseau', () => {
    const fautifs = fichiers.filter((f) => MODULES_RESEAU.test(readFileSync(f, 'utf8'))).map((f) => relative(APP, f));
    expect(fautifs, `rendu qui importe un module d’enrichissement réseau : ${fautifs.join(', ')}`).toEqual([]);
  });

  it('aucune page ni layout n’appelle un enrichissement pendant le rendu', () => {
    const fautifs = fichiers.filter((f) => APPELS.test(readFileSync(f, 'utf8'))).map((f) => relative(APP, f));
    expect(fautifs, `rendu qui enrichit la marque (écriture + réseau) : ${fautifs.join(', ')}`).toEqual([]);
  });
});

describe('L’enrichissement reste disponible · par ses gestes explicites', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('« Récupérer la DA » · bouton de la fiche marque', () => {
    expect(src('app/(app)/brands/[id]/BrandDA.tsx'), 'le bouton ne déclenche plus la récupération de la DA').toMatch(/importBrandDAAction\(/);
  });
  it('synchronisation du catalogue Shopify · bouton de la fiche marque', () => {
    expect(src('app/(app)/brands/[id]/ShopifyConnect.tsx'), 'la synchronisation Shopify n’est plus branchée').toMatch(/syncShopifyProductsAction\(/);
  });
  it('photos produit manquantes · bouton du Studio, dans un gestionnaire de clic (pas un effet)', () => {
    const s = src('app/(app)/studio/ads/AdsStudio.tsx');
    const i = s.indexOf('await importAllProductImagesAction()');
    expect(i, 'la récupération des photos produit n’est plus branchée').toBeGreaterThan(-1);
    const avant = s.slice(Math.max(0, i - 200), i);
    expect(avant, 'la récupération des photos n’est plus dans le gestionnaire importAll').toContain('async function importAll()');
  });
});
