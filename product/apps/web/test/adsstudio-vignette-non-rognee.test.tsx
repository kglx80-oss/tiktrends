import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartePub } from '../app/(app)/studio/ads/CartePub';
import type { AdItem } from '../app/actions/ads';

/**
 * La grille « Tes pubs » rognait les créas · elle forçait un cadre en
 * `object-fit: cover`. Une pub ENTIÈRE sort du modèle en 3:4 / 2:3, plus haute ·
 * le cover lui coupait le haut et le bas (accroche, CTA, produit cuits dans
 * l'image). La grille passe désormais par la carte commune, qui CONTIENT
 * l'aperçu · l'image reste entière, jamais rognée.
 *
 * On vérifie le RÉSULTAT rendu de la carte de grille (CartePub), pas seulement
 * la source · le style `object-fit: contain` doit sortir dans le HTML.
 */

const ad: AdItem = { id: 'a1', template: 'benefits', headline: 'Une pub entière', url: '#', createdAt: '2026-01-01T00:00:00Z' };

describe('AdsStudio · la grille ne rogne plus les pubs', () => {
  it('la carte de grille CONTIENT l’aperçu (contain), jamais cover', () => {
    const html = renderToStaticMarkup(
      <CartePub ad={ad} format="Bénéfices" vignetteUrl="/api/ad/a1?t=1" fullUrl="#" onOpen={() => {}} onArchive={() => {}} trackable={false} />,
    );
    expect(html, 'l’aperçu de la grille rogne (cover)').toContain('object-fit:contain');
    expect(html, 'un cadre en cover rogne la pub').not.toContain('object-fit:cover');
  });

  it('la grille Pubs IA adopte bien la carte commune', () => {
    const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
    expect(src, 'la grille n’utilise pas CartePub').toContain('<CartePub');
  });
});
