import { describe, it, expect } from 'vitest';
import { cleTeleversable, adresseRedirigeable, typeMediaDebutBase64, typeMediaReel } from '../src';

const BASE = 'https://cdn.exemple.test/bucket';
const NATIVE = 'https://s3.gra.test/bucket';
const WS = '11111111-2222-3333-4444-555555555555';

describe('cleTeleversable · un téléversement n’enregistre jamais une clé de la synchro Drive', () => {
  it('clé de téléversement ordinaire ⇒ la clé', () => {
    expect(cleTeleversable(`${BASE}/assets/${WS}/1728900000-ab12cd34-photo.jpg`, BASE, WS)).toBe(`assets/${WS}/1728900000-ab12cd34-photo.jpg`);
  });
  it.each([`drive-1AbC.png`, `drive-1AbC-thumb.jpg`, `DRIVE-x.png`])('%s ⇒ refusé', (f) => {
    expect(cleTeleversable(`${BASE}/assets/${WS}/${f}`, BASE, WS)).toBeNull();
  });
  it('hors espace ⇒ refusé (règle de base conservée)', () => {
    expect(cleTeleversable(`${BASE}/assets/autre/x.jpg`, BASE, WS)).toBeNull();
  });
});

describe('adresseRedirigeable · redirection seulement vers le bucket ou Drive', () => {
  const B = [BASE, NATIVE];
  it.each([
    `${BASE}/assets/${WS}/x.jpg`,
    `${NATIVE}/assets/${WS}/x.jpg`,
    'https://drive.google.com/file/d/abc/view',
    'https://docs.google.com/uc?id=abc',
    'https://lh3.googleusercontent.com/abc',
  ])('%s ⇒ redirigé', (u) => expect(adresseRedirigeable(u, B)).toBe(new URL(u).toString()));

  it.each([
    ['autre hôte', 'https://evil.test/x.jpg'],
    ['bucket voisin au même préfixe', 'https://cdn.exemple.test/bucket-voisin/x.jpg'],
    ['remontée hors du bucket', `${BASE}/../autre/x.jpg`],
    ['identifiants (hôte déguisé)', 'https://drive.google.com@evil.test/x'],
    ['identifiants sur le bucket', `https://u:p@cdn.exemple.test/bucket/x.jpg`],
    ['sous-domaine piégé', 'https://drive.google.com.evil.test/x'],
    ['faux googleusercontent', 'https://evilgoogleusercontent.com/x'],
    ['Drive en http', 'http://drive.google.com/file/d/abc/view'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['illisible', 'pas une adresse'],
  ])('%s ⇒ null (servi par le proxy ou refusé)', (_n, u) => expect(adresseRedirigeable(u, B)).toBeNull());

  it('sans bucket configuré, seul Drive reste redirigeable', () => {
    expect(adresseRedirigeable(`${BASE}/assets/${WS}/x.jpg`, [])).toBeNull();
    expect(adresseRedirigeable('https://drive.google.com/file/d/a/view', [])).not.toBeNull();
  });
});

describe('typeMediaDebutBase64 · même verdict que typeMediaReel sur le seul début', () => {
  const b64 = (s: string) => Buffer.from(s, 'base64');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=';
  const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  const GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  it.each([['PNG', PNG], ['SVG', SVG], ['GIF', GIF], ['texte', Buffer.from('bonjour tout le monde').toString('base64')]])('%s', (_n, s) => {
    expect(typeMediaDebutBase64(s.slice(0, 344))).toBe(typeMediaReel(b64(s)));
  });
  it('début vide, trop court ou illisible ⇒ null', () => {
    expect(typeMediaDebutBase64('')).toBeNull();
    expect(typeMediaDebutBase64('iVBO')).toBeNull();
    expect(typeMediaDebutBase64(null)).toBeNull();
  });
});
