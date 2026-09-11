import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La révocation de session par époque ne vaut que si elle reste CÂBLÉE aux trois
 * endroits · la règle pure (session-epoch.test) ne dit rien de son branchement.
 * Ce garde lit la source livrée · retirer un maillon le fait tomber.
 */
const lire = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const AUTH = lire('lib/auth.ts');
const RESET = lire('app/actions/auth.ts');
const CHANGE = lire('app/actions/admin.ts');

// L'incrément d'époque, quel que soit l'espacement : `sessionEpoch: sql`… + 1``.
const INCREMENT = /sessionEpoch:\s*sql`[^`]*\+\s*1`/;

describe('la session se révoque à l’époque', () => {
  it('getSession REFUSE un jeton d’époque révolue', () => {
    // Sans ce refus, un cookie volé reste valide 30 j malgré un reset.
    expect(AUTH).toMatch(/if\s*\(!sessionEpochValide\([^)]*\)\)\s*return null;/);
  });
  it('le reset de mot de passe incrémente l’époque', () => {
    expect(RESET).toMatch(INCREMENT);
  });
  it('le changement de mot de passe incrémente l’époque', () => {
    expect(CHANGE).toMatch(INCREMENT);
  });
});
