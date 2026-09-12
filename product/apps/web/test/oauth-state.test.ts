import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signState, verifyState } from '../lib/oauth-state';

/**
 * Le state OAuth est la protection anti-CSRF des callbacks · sa vérification doit
 * (1) accepter un state authentique, rejeter tout ce qui est falsifié ou périmé,
 * et (2) comparer la signature à TEMPS CONSTANT · sinon un oracle de timing laisse
 * reconstituer la signature octet par octet et forger un state valide.
 */

describe('le state OAuth ne valide que ce qui est authentique', () => {
  it('un state signé se relit', () => {
    const p = verifyState<{ ws: string }>(signState({ ws: 'w1' }));
    expect(p?.ws).toBe('w1');
  });

  it('une signature falsifiée est rejetée', () => {
    const [data] = signState({ ws: 'w1' }).split('.');
    expect(verifyState(`${data}.ZmFrZXNpZw`)).toBeNull();
  });

  it('des données falsifiées (signature qui ne colle plus) sont rejetées', () => {
    const [, sig] = signState({ ws: 'w1' }).split('.');
    const autre = Buffer.from(JSON.stringify({ ws: 'w2', t: Date.now() })).toString('base64url');
    expect(verifyState(`${autre}.${sig}`)).toBeNull();
  });

  it('un state périmé est rejeté', () => {
    expect(verifyState(signState({ ws: 'w1' }), -1)).toBeNull();
  });

  it('une signature de mauvaise longueur ne fait pas lever · elle est rejetée', () => {
    // `timingSafeEqual` exige deux buffers de même taille · la garde de longueur
    // doit court-circuiter sans exception.
    expect(() => verifyState('donnee.AAAA')).not.toThrow();
    expect(verifyState('donnee.AAAA')).toBeNull();
  });

  it('un state malformé ou absent est rejeté', () => {
    expect(verifyState('sans-point')).toBeNull();
    expect(verifyState('')).toBeNull();
    expect(verifyState(null)).toBeNull();
  });
});

describe('la comparaison de signature est à temps constant', () => {
  // Propriété non mesurable par le temps en test · on garde qu'on n'est pas
  // revenu à une comparaison de chaînes court-circuitante.
  const src = readFileSync(join(process.cwd(), 'lib/oauth-state.ts'), 'utf8');
  it('elle passe par timingSafeEqual, pas par un `!==` de chaînes', () => {
    expect(src, 'la comparaison à temps constant a disparu').toContain('timingSafeEqual');
    expect(src, 'un `!==` court-circuitant sur la signature est revenu').not.toMatch(/sig !== expected/);
  });
});
