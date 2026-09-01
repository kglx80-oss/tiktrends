import { describe, it, expect } from 'vitest';
import { renduConnu } from '../lib/ad-store';

/**
 * Ce qu'on accepte comme rendu déjà rangé.
 *
 * Le point de vigilance n'est pas le cas nominal, c'est tout ce qui arrive
 * d'une colonne `jsonb` sans forme garantie · une génération d'avant cette
 * fonctionnalité a `output` à `null`, une écriture partielle peut laisser une
 * valeur incomplète, et une redirection vers autre chose qu'une adresse http
 * enverrait le navigateur nulle part.
 */
describe('un rendu déjà rangé se reconnaît, ou ne se reconnaît pas', () => {
  it('rend l’adresse quand elle est là', () => {
    expect(renduConnu({ renders: { 'a:4:5:f:xyz': 'https://cdn/x.png' } }, 'a:4:5:f:xyz'))
      .toBe('https://cdn/x.png');
  });

  it('une autre variante ne répond pas à la place', () => {
    // La vignette et le plein format sont deux images différentes · les
    // confondre servirait une image de 432 px là où on en attend une de 1080.
    expect(renduConnu({ renders: { 'a:4:5:t:xyz': 'https://cdn/thumb.png' } }, 'a:4:5:f:xyz'))
      .toBeNull();
  });

  it('une génération d’avant cette fonctionnalité n’a pas de sortie', () => {
    expect(renduConnu(null, 'k')).toBeNull();
    expect(renduConnu(undefined, 'k')).toBeNull();
    expect(renduConnu({}, 'k')).toBeNull();
  });

  it('une sortie qui existe sans « renders » ne casse pas', () => {
    expect(renduConnu({ error: 'boum' }, 'k')).toBeNull();
  });

  it('refuse ce qui n’est pas une adresse http · sinon on redirige vers rien', () => {
    expect(renduConnu({ renders: { k: '' } }, 'k')).toBeNull();
    expect(renduConnu({ renders: { k: '/local/x.png' } }, 'k')).toBeNull();
    expect(renduConnu({ renders: { k: 42 } }, 'k')).toBeNull();
  });

  it('accepte http comme https · certains buckets internes ne sont pas en TLS', () => {
    expect(renduConnu({ renders: { k: 'http://minio.local/x.png' } }, 'k')).toBe('http://minio.local/x.png');
  });
});
