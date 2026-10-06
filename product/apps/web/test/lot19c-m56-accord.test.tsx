import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 19C · message 56 · l'accord au singulier sur `/veille/formats`, RENDU.
 * Mesuré au navigateur avant correction (build f4f60887) · « Classer mes 1
 * sauvegarde » et « 1 sauvegarde à classer · comptées à part, dans aucun format ».
 */
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard="" /> }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('../app/actions/inspo', () => ({ classerFormatSauvegarde: async () => ({ ok: true }) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));

import { CRITERES_FORMATS_DEFAUT, lireFormatCreatif } from '@tiktrends/core';
import { VueFormats, type AnnonceSauvegardee } from '../app/(app)/veille/formats/VueFormats';

const a = (id: string, f: unknown): AnnonceSauvegardee => ({
  id: 'sv-' + id, platform: 'meta', externalId: id, ad: { id, platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'A' } as never,
  mediaType: 'image', daysRunning: 3, sauvegardeLe: '2026-10-01T10:00:00Z', format: lireFormatCreatif({ formatCreatif: f }), auteurNom: null,
});
const texte = (l: AnnonceSauvegardee[]) => renderToStaticMarkup(<VueFormats annonces={l} criteres={CRITERES_FORMATS_DEFAUT} marque="Neva" suivis={[]} adsmap={false} />)
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const classee = { id: 'packshot', version: 1 };

describe('/veille/formats · accord au singulier, rendu', () => {
  it('une seule sauvegarde, non classée · « Classer ma sauvegarde »', () => {
    const h = texte([a('n1', null)]);
    expect(h).toContain('Classer ma sauvegarde');
    expect(h, 'accord faux au singulier').not.toContain('Classer mes 1');
  });
  it('deux non classées · pluriel inchangé', () => {
    expect(texte([a('n1', null), a('n2', null)])).toContain('Classer mes 2 sauvegardes');
  });
  it('une à classer à côté d’une classée · « comptée à part »', () => {
    const h = texte([a('c1', classee), a('n1', null)]);
    expect(h).toContain('1 sauvegarde à classer · comptée à part, dans aucun format');
    expect(h, 'accord faux au singulier').not.toContain('comptées à part');
  });
  it('deux à classer · « comptées à part »', () => {
    expect(texte([a('c1', classee), a('n1', null), a('n2', null)])).toContain('2 sauvegardes à classer · comptées à part, dans aucun format');
  });
});
