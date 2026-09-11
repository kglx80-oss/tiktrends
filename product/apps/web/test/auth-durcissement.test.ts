import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Durcissements auth (findings faibles du relecteur).
 *
 * `auth.ts` est server-only (cookies + base) · on lit la source livrée plutôt
 * que de l'importer. On vérifie une VALEUR (le coût bcrypt extrait, pas sa
 * simple présence) et la restriction d'algorithme · retirer l'un fait tomber.
 */
const AUTH = readFileSync(join(process.cwd(), 'lib/auth.ts'), 'utf8');

describe('durcissements auth', () => {
  it('bcrypt coûte au moins 12', () => {
    const m = AUTH.match(/bcrypt\.hash\([^,]+,\s*(\d+)\)/);
    expect(m, 'appel bcrypt.hash introuvable').not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(12);
  });

  it('jwtVerify restreint l’algorithme à HS256', () => {
    // Sans `algorithms`, on accepte tout algo que la clé permet · on le fige.
    expect(AUTH).toMatch(/jwtVerify\([\s\S]*?algorithms:\s*\[\s*'HS256'\s*\]/);
  });
});
