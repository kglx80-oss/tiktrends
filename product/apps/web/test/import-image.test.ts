import { describe, expect, it } from 'vitest';
import { decideImportedImage } from '../lib/import-image';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('decideImportedImage · capture durable ou refus clair', () => {
  it('un fetch échoué (null) est REFUSÉ, pas stocké · plus d’asset qui pointe dans le vide', () => {
    const d = decideImportedImage(null);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toMatch(/n’est pas une image accessible|accessible/i);
  });

  it('un contenu non-image est refusé', () => {
    const d = decideImportedImage({ body: Buffer.from('<html>'), contentType: 'text/html' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toMatch(/pas vers une image|image/i);
  });

  it('une vraie image devient un data URI durable', () => {
    const octets = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // en-tête JPEG
    const d = decideImportedImage({ body: octets, contentType: 'image/jpeg' });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.mimeType).toBe('image/jpeg');
      expect(d.dataUri).toBe(`data:image/jpeg;base64,${octets.toString('base64')}`);
    }
  });

  it('le type vient des OCTETS, jamais de l’en-tête distant (avant : `image/png; charset=…` + deux octets passait)', () => {
    // Deux octets quelconques annoncés image/png · ce n'est pas une image.
    expect(decideImportedImage({ body: Buffer.from([1, 2]), contentType: 'image/png; charset=binary' }).ok).toBe(false);
    // Un vrai PNG annoncé text/html · c'est une image, retenue en image/png.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const d = decideImportedImage({ body: png, contentType: 'text/html' });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.mimeType).toBe('image/png');
      expect(d.dataUri.startsWith('data:image/png;base64,')).toBe(true);
    }
  });

  it('un SVG (qui porte du script) est refusé, quel que soit le type annoncé', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const contentType of ['image/svg+xml', 'IMAGE/SVG+XML', 'image/png', 'image/jpeg; charset=binary']) {
      const d = decideImportedImage({ body: svg, contentType });
      expect(d.ok, contentType).toBe(false);
    }
  });
});

describe('l’import par lien d’image capture une copie durable · câblage', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/actions/assets.ts'), 'utf8');
  it('un lien image non-Drive est récupéré (safeFetch) et tranché (decideImportedImage)', () => {
    expect(SRC).toMatch(/!drive\.isDrive && kind === 'image'/);
    expect(SRC).toMatch(/safeFetch\(url\)/);
    expect(SRC).toMatch(/decideImportedImage\(fetched\)/);
    // Refus quand ce n'est pas une image accessible · on ne crée pas d'asset cassé.
    expect(SRC).toMatch(/if \(!decision\.ok\) return \{ error: decision\.error \}/);
  });
});
