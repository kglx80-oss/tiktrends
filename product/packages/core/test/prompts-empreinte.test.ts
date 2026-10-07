import { createHash } from 'node:crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { empreinteContenu, ErreurEmpreinte, jsonCanonique, sha256Octets, sha256Texte } from '../src/prompts/empreinte';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const pack = JSON.parse(readFileSync(join(DOSSIER, '02-PROMPTS.json'), 'utf8')) as {
  templates: Array<Record<string, unknown> & { key: string; contentHash: string }>;
  commonSystemInstructions: string;
  commonSystemHash: string;
};

/**
 * Valeur et résultats calculés par Python 3 (`json.dumps(v, sort_keys=True,
 * ensure_ascii=False, separators=(',', ':'))` puis `hashlib.sha256`), la
 * référence de `verify-pack.py`. Clés non ASCII, hors BMP, caractères de
 * contrôle, guillemet, barre oblique inverse et DEL : tout ce qui sépare
 * Python de `JSON.stringify` ou de l'ordre UTF-16.
 */
const VALEUR = { b: 1, a: [true, null, 'é"\\\n\t\u0001\u001f\u007f'], 'é': 'x', z: '😀', '\ue000': 0, '😀': -5 };
const CANONIQUE_PYTHON = '{"a":[true,null,"é\\"\\\\\\n\\t\\u0001\\u001f\u007f"],"b":1,"z":"😀","é":"x","\ue000":0,"😀":-5}';
const SHA_PYTHON = '660a9d5b4c2215a4c8f94f50d6ccabade01d61ca230553a45e56dd6de9cc772a';

describe('empreinte · SHA-256 pur', () => {
  it('égale node:crypto sur des longueurs autour des frontières de bloc', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_000]) {
      const octets = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
      expect(sha256Octets(octets), `longueur ${n}`).toBe(createHash('sha256').update(octets).digest('hex'));
    }
  });

  it('encode le texte en UTF-8 comme Python', () => {
    expect(sha256Texte('Kévin · prompt')).toBe('5763860d8ad64a60f9d8abb1d0905aef304e3a58200b1622ee89c30ed7347630');
  });
});

describe('empreinte · JSON canonique de verify-pack.py', () => {
  it('reproduit json.dumps(sort_keys, ensure_ascii=False) octet pour octet', () => {
    expect(jsonCanonique(VALEUR)).toBe(CANONIQUE_PYTHON);
    expect(sha256Texte(jsonCanonique(VALEUR))).toBe(SHA_PYTHON);
  });

  it('refuse un décimal en mode python, l’accepte en mode js', () => {
    expect(() => jsonCanonique({ x: 0.55 })).toThrow(ErreurEmpreinte);
    expect(jsonCanonique({ x: 0.55 }, 'js')).toBe('{"x":0.55}');
  });

  it('refuse une surrogate isolée', () => {
    expect(() => jsonCanonique({ x: '\ud800' }, 'js')).toThrow(/SURROGATE_ISOLEE/);
  });

  it('retrouve le contentHash déclaré de chacun des 22 templates et le commonSystemHash', () => {
    expect(pack.templates).toHaveLength(22);
    for (const t of pack.templates) expect(empreinteContenu(t), t.key).toBe(t.contentHash);
    expect(sha256Texte(pack.commonSystemInstructions)).toBe(pack.commonSystemHash);
  });
});
