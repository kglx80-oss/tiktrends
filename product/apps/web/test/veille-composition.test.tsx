import { describe, expect, it } from 'vitest';
import { placementLanceurSupport } from '@tiktrends/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InspoAd } from '@tiktrends/integrations';
import { AdCard } from '../components/AdCard';

/**
 * Lot Veille · l'écran menait autant par la CRÉATION (« Décline cette piste » en
 * rose, pleine largeur) que par l'observation, et empilait la bibliothèque puis
 * la mémoire marché sans hiérarchie. Le cap veut : observer → analyser →
 * préparer un test, la création SECONDAIRE.
 *
 * On cloue le RÉSULTAT là où on peut le rendre (le pont de création de la carte)
 * et la structure à la source (la page est un gros composant serveur, non
 * rendable ici).
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const page = read('app/(app)/veille/page.tsx');
const shell = read('components/AppShell.tsx');
const section = read('app/(app)/jarvis/sections/SectionMarche.tsx');

// Une piste ÉPROUVÉE · c'est le cas où la carte accentuait son pont de création.
const adGagnant: InspoAd = {
  id: 'x1', platform: 'meta', status: 'active', daysRunning: 999, mediaType: 'image',
  advertiserName: 'Marque', reach: 100000, estimatedSpend: 1200, mainCountry: 'FR',
};

describe('Veille · le pont de création est SECONDAIRE (HTML rendu)', () => {
  it('sur une piste éprouvée, le CTA garde son emphase par défaut (autres usages)', () => {
    const h = renderToStaticMarkup(<AdCard ad={adGagnant} />);
    expect(h, 'l’emphase par défaut a disparu').toContain('var(--grad-accent)');
    expect(h).toContain('Décline cette piste');
  });

  it('en mode Veille (ctaSobre) le MÊME lien devient sobre · même texte, sans fond plein', () => {
    const h = renderToStaticMarkup(<AdCard ad={adGagnant} ctaSobre />);
    // Le texte et le lien ne changent pas · seule l'emphase tombe.
    expect(h, 'le pont de création a changé de texte/comportement').toContain('Décline cette piste');
    // Mutation : si le drapeau ne coupait pas l'emphase, le fond plein resterait.
    const iCta = h.lastIndexOf('Décline cette piste');
    const contexte = h.slice(Math.max(0, iCta - 400), iCta);
    expect(contexte, 'le CTA Veille garde un fond accentué au lieu d’être sobre').not.toContain('var(--grad-accent)');
  });

  it('en Veille (cibles44) les liens autonomes et le pont portent la cible tactile 44', () => {
    const n44 = (s: string) => (s.match(/min-height:44px/g) || []).length;
    const avec = renderToStaticMarkup(<AdCard ad={adGagnant} ctaSobre cibles44 />);
    const sans = renderToStaticMarkup(<AdCard ad={adGagnant} ctaSobre />);
    // Mutation : si `cibles44` était ignoré, les deux rendus auraient le même
    // nombre de cibles 44 · le drapeau doit en ajouter (biblio, site, CTA).
    expect(n44(avec), 'les liens de carte restent sous 44 en Veille').toBeGreaterThan(n44(sans));
  });
});

describe('Veille · la page mène par l’observation (source)', () => {
  it('la grille passe le pont de création en mode sobre', () => {
    expect(page).toMatch(/<AdCard[^>]*ctaSobre/);
  });

  it('l’en-tête observe pour préparer un test, sans promettre la rentabilité', () => {
    expect(page).toContain('Observe les publicités du marché pour préparer tes prochains tests');
    expect(page, 'l’ancienneté est encore vendue comme preuve de perf').not.toContain('proxy de performance');
    expect(page).toContain('signaux d’observation');
  });

  it('les 5 filtres avancés sont repliés dans un <details> · recherche et plateforme restent dehors', () => {
    // Recherche + plateforme hors du repli ; les autres filtres dans le details.
    expect(page).toContain('<details');
    expect(page).toMatch(/<select name="p"/);
    // Le repli contient bien les filtres avancés (au moins pays et statut).
    expect(page).toContain('name="country"');
    expect(page).toContain('name="status"');
  });

  it('des accès voisins compacts pointent vers Scale, Radar et Sauvegardes', () => {
    expect(page).toContain('href="/veille/scale"');
    expect(page).toContain('href="/radar"');
    expect(page).toContain('href="/saved"');
  });

  it('un bloc de transition ouvre les tests dans Adsmap · lien explicite, pas de workflow fictif', () => {
    expect(page).toContain('href="/adsmap"');
    expect(page).toContain('Ouvrir mes tests dans Adsmap');
  });

  it('« Lecture du marché » ancre vers la section identifiée après la grille', () => {
    expect(page).toContain('href="#lecture-marche"');
    expect(section).toContain('id="lecture-marche"');
  });
});

describe('Veille · shell', () => {
  it('le support est ANCRÉ sur /veille (comme Dashboard et Pubs)', () => {
    expect(placementLanceurSupport('/veille')).toBe('ancre');
    expect(shell).toContain('supportAncre');
  });
});
