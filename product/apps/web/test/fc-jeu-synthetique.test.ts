import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decoder, genererJeu, DROITS_SYNTHETIQUES } from '../lib/studios/benchmark/jeu-synthetique';

/**
 * Lot F-C · jeu de données synthétique (`datasetPolicy`). Les empreintes et
 * les droits sont FIGÉS dans le manifeste commité : la génération doit les
 * reproduire, et chaque fichier commité doit être celui du manifeste.
 */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2/benchmark/jeu-synthetique');
const MANIFESTE = JSON.parse(readFileSync(join(DOSSIER, 'manifeste.json'), 'utf8')) as {
  droits: string; medias: Array<{ id: string; fichier: string; mime: string; sha256: string; contenuSha256: string; octets: number; droits: string; cas: string[] }>;
};
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('jeu synthétique figé', () => {
  it('la génération reproduit chaque empreinte de contenu du manifeste (pixels bruts, sons)', async () => {
    const jeu = await genererJeu();
    expect([...jeu.keys()].sort()).toEqual(MANIFESTE.medias.map((m) => m.id).sort());
    for (const m of MANIFESTE.medias) expect(jeu.get(m.id)!.contenuSha256, m.id).toBe(m.contenuSha256);
  });

  it('chaque fichier commité est celui du manifeste, et se décode vers les mêmes pixels', async () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f !== 'manifeste.json').sort();
    expect(fichiers).toEqual(MANIFESTE.medias.map((m) => m.fichier).sort());
    for (const m of MANIFESTE.medias) {
      const octets = readFileSync(join(DOSSIER, m.fichier));
      expect(sha(octets), m.fichier).toBe(m.sha256);
      expect(octets.length).toBe(m.octets);
      if (m.mime === 'image/png') expect(sha((await decoder(octets)).pixels), m.fichier).toBe(m.contenuSha256);
    }
  });

  it('droits notés sur chaque média : créé pour le test, aucune source client', () => {
    expect(MANIFESTE.droits).toBe(DROITS_SYNTHETIQUES);
    for (const m of MANIFESTE.medias) {
      expect(m.droits).toBe(DROITS_SYNTHETIQUES);
      expect(m.cas.every((c) => /^F\d\d$/.test(c))).toBe(true);
    }
    expect(DROITS_SYNTHETIQUES).toMatch(/créé pour le test/i);
    expect(DROITS_SYNTHETIQUES).toMatch(/aucune source client/);
  });
});
