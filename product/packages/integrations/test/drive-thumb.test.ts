import { describe, it, expect, vi, afterEach } from 'vitest';
import { storeDriveThumb } from '../src/drive-sync';

/**
 * La vraie vignette Drive · persistance sur notre bucket.
 *
 * Le contrat critique est « jamais bloquant » · sans bucket configuré, la
 * synchro ne doit RIEN tenter · pas de réseau, pas d'écriture, juste `null`, et
 * l'appelant retombe sur l'ancien affichage. On l'éprouve en surveillant
 * `fetch` · le court-circuit « pas de bucket » doit passer AVANT tout appel
 * distant. Retirer ce court-circuit fait tomber ce test (fetch est appelé).
 */
afterEach(() => vi.restoreAllMocks());

describe('storeDriveThumb · dégradation propre', () => {
  it('sans bucket, rend null sans le moindre appel réseau', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    const r = await storeDriveThumb({ storage: null, token: 'x', fileId: 'f1', workspaceId: 'w1' });
    expect(r).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
