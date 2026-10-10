import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { sha256Hex, sha256OctetsHex, jsonCanonique, empreinteContenu, ErreurCanonique } from '../src/studios/version';

const ref = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

describe('SHA-256 pur · identique à node:crypto', () => {
  it('vecteurs FIPS 180-4 (vide, « abc », 448 bits)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('toutes les tailles autour des frontières de bloc, octets aléatoires', () => {
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4097]) {
      const b = new Uint8Array(randomBytes(n));
      expect(sha256OctetsHex(b), `taille ${n}`).toBe(ref(b));
    }
  });

  it('texte UTF-8 hors ASCII (accents, émoji, CJK)', () => {
    const t = 'Pubs IA · « été » 夏 🌞 \u0000 fin';
    expect(sha256Hex(t)).toBe(ref(Buffer.from(t, 'utf8')));
  });
});

describe('forme canonique', () => {
  it('l’ordre d’insertion des clés ne change pas l’empreinte', () => {
    const a = { b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } };
    const b = { a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 };
    expect(jsonCanonique(a)).toBe(jsonCanonique(b));
    expect(jsonCanonique(a)).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
    expect(empreinteContenu(a)).toBe(empreinteContenu(b));
  });

  it('l’ordre d’une LISTE compte · elle est une valeur', () => {
    expect(empreinteContenu({ o: ['a', 'b'] })).not.toBe(empreinteContenu({ o: ['b', 'a'] }));
  });

  it('refuse les valeurs hors JSON au lieu de les omettre', () => {
    for (const v of [{ a: undefined }, { a: NaN }, { a: Infinity }, { a: () => 1 }, { a: 1n }, { d: new Date() }]) {
      expect(() => jsonCanonique(v)).toThrow(ErreurCanonique);
    }
    const cyc: Record<string, unknown> = {};
    cyc.moi = cyc;
    expect(() => jsonCanonique(cyc)).toThrow(/circulaire/);
  });
});
