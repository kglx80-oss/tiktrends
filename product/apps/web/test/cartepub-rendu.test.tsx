import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartePub } from '../app/(app)/studio/ads/CartePub';
import type { AdItem } from '../app/actions/ads';

/**
 * L'adaptateur Pubs IA · il branche une `AdItem` sur la carte commune. On
 * vérifie le RÉSULTAT rendu · la relecture devient une synthèse qualité, le
 * verdict et la prédiction vont dans la zone performance, l'aperçu ne rogne pas.
 */

const ad = (o: Partial<AdItem> = {}): AdItem => ({
  id: 'a1', template: 'benefits', headline: 'Ma piscine n’a jamais été aussi nette',
  url: '/api/ad/a1?r=4:5', createdAt: '2026-01-01T00:00:00Z', ...o,
});

const rendre = (o: Partial<AdItem> = {}, trackable = true) => renderToStaticMarkup(
  <CartePub ad={ad(o)} format="Bénéfices" vignetteUrl="/api/ad/a1?t=1" fullUrl="/api/ad/a1?r=4:5"
    onOpen={() => {}} onArchive={() => {}} trackable={trackable} />,
);

describe('CartePub · la carte d’une pub générée', () => {
  it('traduit un défaut de relecture en synthèse qualité bloquante', () => {
    const h = rendre({ controle: { copieResume: '', copieGrave: false, produitFidele: false, ecarts: ['couleur'], texteLisible: true, problemesLisibilite: [] } });
    expect(h).toContain('À revoir'); // qualité bloquante, à l’endroit « Qualité »
    expect(h).toContain('Qualité');
  });

  it('porte le verdict marché et la prédiction dans la zone performance', () => {
    const h = rendre({ verdict: 'gagnante', score: 82 });
    expect(h).toContain('A gagné');       // verdict
    expect(h).toContain('Préd. 82');      // prédiction (pronostic distinct)
    expect(h).toContain('Performance');
  });

  it('sans verdict, la performance reste inconnue · pas déduite de la note', () => {
    expect(rendre({ verdict: null })).toContain('Performance inconnue');
  });

  it('l’aperçu d’une création interne est contenu, jamais rogné', () => {
    expect(rendre(), 'l’aperçu rogne (cover)').toContain('object-fit:contain');
  });

  it('l’action principale « Ouvrir » est nommée et stable', () => {
    expect(rendre()).toContain('Ouvrir');
  });
});

describe('la grille Pubs IA adopte la carte commune', () => {
  const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
  it('rend chaque pub via CartePub, plus l’ancienne carte à la main', () => {
    expect(src, 'la grille n’utilise pas la carte commune').toContain('<CartePub');
    // L'ancienne barre d'actions comprimée ne pilote plus la grille.
    expect(src, 'l’ancienne barre CreativeActions pilote encore la grille').not.toContain('<CreativeActions');
  });
});
