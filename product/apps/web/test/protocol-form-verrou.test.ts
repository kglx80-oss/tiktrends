import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le réglage du protocole a deux boutons qui lancent une action serveur ·
 * « Proposer des seuils » (un calcul sur 30 jours) et « Enregistrer ». Le garde
 * d'origine posait `setBusy(true)` sans barrière synchrone · `busy` étant un état
 * qui ne bascule qu'au rendu suivant, deux clics du même tick partaient en
 * double. On pose un verrou synchrone partagé (verrouAction du noyau), pris en
 * tête de CHAQUE handler et relâché dans son finally.
 *
 * Le composant importe des actions serveur · non rendable en test. Adoption par
 * la source, PAR HANDLER (jamais « au moins un »). Le RÉSULTAT du verrou est
 * prouvé dans verrou-action.test.ts.
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/adsmap/protocole/ProtocolForm.tsx'),
  'utf8',
);

describe('ProtocolForm · un seul geste à la fois', () => {
  it('prend le verrou du noyau', () => {
    expect(src).toMatch(/import \{ verrouAction \} from '@tiktrends\/core'/);
    expect(src).toContain('useRef(verrouAction())');
  });

  it('chacun des deux handlers PREND le verrou en tête', () => {
    // proposer + enregistrer · un tenter() chacun.
    expect(src.split('if (!verrou.current.tenter()) return;').length - 1).toBe(2);
  });

  it('chacun des deux handlers RELÂCHE dans un finally', () => {
    // Un relâchement par handler · un oubli sur l'un figerait les DEUX boutons
    // (verrou partagé). On exige la propriété par handler, pas « au moins un ».
    expect(src.split('verrou.current.relacher()').length - 1).toBe(2);
    expect(src.split('} finally {').length - 1).toBe(2);
  });
});
