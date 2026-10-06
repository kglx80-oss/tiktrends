import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 19C · les sorties de l'écran Formats qui restent sur `/veille/formats`
 * (même chemin, autre recherche) sont des navigations COMPLÈTES. Mesuré en
 * recette au navigateur (build local de production) · « Classer mes 2
 * sauvegardes », en lien client, laissait l'URL et l'écran sur place une fois
 * sur deux (même défaut que #106b sur la Veille). On marque le lien client et on
 * lit le HTML rendu · aucune sortie vers `/veille/formats` ne doit être un lien
 * client.
 */
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a data-lien-client href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));
vi.mock('../app/actions/inspo', () => ({ classerFormatSauvegarde: async () => ({ ok: true }) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));

import { CRITERES_FORMATS_DEFAUT, LECTURE_NON_CLASSE, type CriteresFormats } from '@tiktrends/core';
import { VueFormats, type AnnonceSauvegardee } from '../app/(app)/veille/formats/VueFormats';

const annonce = (n: string): AnnonceSauvegardee => ({
  id: 's' + n, externalId: n, platform: 'meta', mediaType: 'image', daysRunning: 1, sauvegardeLe: '2026-10-01T00:00:00Z',
  format: LECTURE_NON_CLASSE, auteurNom: null, ad: { id: n, platform: 'meta', status: 'active', daysRunning: 1, mediaType: 'image' },
});
const rendre = (annonces: AnnonceSauvegardee[], c: CriteresFormats = CRITERES_FORMATS_DEFAUT) =>
  renderToStaticMarkup(<VueFormats annonces={annonces} criteres={c} marque={null} suivis={[]} adsmap={false} />);
const liensClient = (h: string) => [...h.matchAll(/<a data-lien-client="true" href="([^"]*)"/g)].map((m) => m[1]!);
const liensClientVersFormats = (h: string) => liensClient(h).filter((u) => u.startsWith('/veille/formats'));

describe('Formats · sorties sur le même chemin', () => {
  it('témoin · le marqueur voit bien un lien client (« Ouvrir la veille »)', () => {
    expect(liensClient(rendre([]))).toEqual(['/veille']);
  });
  it('« Classer mes 2 sauvegardes » est une navigation complète', () => {
    const h = rendre([annonce('a'), annonce('b')]);
    expect(h).toContain('Classer mes 2 sauvegardes');
    expect(h).toContain('href="/veille/formats?format=non_classe"');
    expect(liensClientVersFormats(h)).toEqual([]);
  });
  it('vides de la grille · navigations complètes aussi', () => {
    expect(liensClientVersFormats(rendre([annonce('a')], { ...CRITERES_FORMATS_DEFAUT, format: 'packshot' }))).toEqual([]);
    expect(liensClientVersFormats(rendre([annonce('a')], { ...CRITERES_FORMATS_DEFAUT, media: 'video' }))).toEqual([]);
  });
});
