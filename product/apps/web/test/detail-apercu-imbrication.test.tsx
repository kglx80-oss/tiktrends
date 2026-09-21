import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { CarteCreative } from '../components/CarteCreative';
import { AdMedia } from '../components/AdMedia';

/**
 * CDC v8 · F04 · l'aperçu d'une carte ne doit contenir AUCUN interactif imbriqué.
 *
 * Le bouton d'aperçu enveloppe `AdMedia` · si celui-ci pose un `<a>` (image) ou un
 * bouton de lecture (vidéo) à l'intérieur, on a un interactif DANS un bouton ·
 * invalide, et au clic ça ouvrait un onglet de miniature EN PLUS du détail. On
 * rend le HTML et on vérifie qu'il n'y a ni `<a>` ni bouton imbriqué dans
 * l'aperçu. On vérifie aussi le contrat de bornage du dialogue détail (source ·
 * composant client volumineux non rendable).
 */
const props = (o?: Partial<Parameters<typeof CarteCreative>[0]>) => ({
  media: { url: 'https://x/p.png', isVideo: false, fit: 'contain' as const },
  titre: 'Une créa',
  onApercu: () => {},
  actionPrincipale: { cle: 'ouvrir', label: 'Ouvrir', onClick: () => {} },
  ...o,
});

describe('F04 · l’aperçu d’une carte n’imbrique aucun interactif', () => {
  it('image · le bouton d’aperçu ne contient pas de lien (plus d’onglet parasite)', () => {
    const h = renderToStaticMarkup(<CarteCreative {...props()} />);
    expect(h).toContain('Ouvrir · Une créa');          // le bouton d'aperçu est là
    expect(h, 'aucun <a> ne doit être imbriqué dans l’aperçu').not.toContain('<a ');
  });

  it('vidéo · pas de bouton de lecture imbriqué dans le bouton d’aperçu', () => {
    // Un seul <button> pour l'aperçu (+ l'action « Ouvrir ») · pas de bouton de
    // lecture d'AdMedia à l'intérieur. On compte les <button> · l'aperçu et
    // l'action principale, jamais un lecteur imbriqué.
    const h = renderToStaticMarkup(<CarteCreative {...props({ media: { url: 'https://x/v.mp4', isVideo: true } })} />);
    const boutons = (h.match(/<button/g) ?? []).length;
    expect(boutons, 'aperçu + action principale, sans lecteur imbriqué').toBe(2);
  });

  it('AdMedia non interactif ne rend ni lien ni bouton', () => {
    const h = renderToStaticMarkup(<AdMedia mediaUrl="https://x/p.png" interactive={false} />);
    expect(h).not.toContain('<a ');
    expect(h).not.toContain('<button');
  });

  it('AdMedia interactif (autonome) garde son lien d’ouverture', () => {
    const h = renderToStaticMarkup(<AdMedia mediaUrl="https://x/p.png" />);
    expect(h).toContain('<a ');
  });
});

describe('F04 · le dialogue détail borne la zone média et fait défiler le rail', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

  it('la zone média est bornée à la hauteur visible hors empilement', () => {
    expect(src).toContain("maxHeight: detailEmpile ? undefined : '92vh'");
  });
  it('le dialogue ne défile en bloc QUE lorsqu’il empile', () => {
    expect(src).toContain("overflowY: detailEmpile ? 'auto' : 'hidden'");
  });
});
