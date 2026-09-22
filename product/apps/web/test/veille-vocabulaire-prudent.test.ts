import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDC v8 · F10 · la Veille parlait de « gagnants installés » alors que les
 * cartes portent un badge prudent (« Piste forte » · une pub qui tient est un
 * proxy de traction, pas une preuve de rentabilité). Le vocabulaire de l'écran
 * doit s'aligner sur celui des badges · « pistes installées », jamais
 * « gagnants ». On lit la source de la page (composant serveur non montable).
 */
describe('F10 · la Veille ne parle plus de « gagnants » installés', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(join(here, '../app/(app)/veille/page.tsx'), 'utf8');

  it('emploie « pistes installées », jamais « gagnants installés »', () => {
    expect(page).toContain('pistes installées');
    expect(page).not.toContain('gagnants installés');
  });
});
