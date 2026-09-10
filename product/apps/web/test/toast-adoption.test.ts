import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les actions autrefois muettes disent maintenant qu'elles ont réussi.
 *
 * Un audit a trouvé le petit noyau d'actions de mutation qui réussissaient sans
 * un mot à l'écran. Chacune est reliée au canal de retour · ce garde fige cette
 * adoption : retirer le retour (ou l'import du canal) casse ici, pas seulement
 * à l'usage. On vérifie la chaîne de caractères affichée ET l'import du canal ·
 * pas « toast appelé quelque part » dans le vide.
 */
const WEB = process.cwd();

const CAS: Array<{ fichier: string; messages: string[] }> = [
  { fichier: 'components/useScenes.ts', messages: ['Scène enregistrée.'] },           // 3 studios
  { fichier: 'components/TrackerFeed.tsx', messages: ['Tout marqué comme vu.'] },       // veille
  { fichier: 'app/(app)/adsmap/tri/Curation.tsx', messages: ['validé.', 'Proposition écartée.'] },
  { fichier: 'app/(app)/assets/AssetsLibrary.tsx', messages: ['Élément importé.'] },
  { fichier: 'app/(app)/connections/DataConnections.tsx', messages: ['Shopify déconnecté.', 'Meta déconnecté.'] },
  { fichier: 'app/(app)/assets/DriveConnect.tsx', messages: ['Google Drive déconnecté.'] },
  { fichier: 'components/SavedBoards.tsx', messages: ['Rangé dans', 'Retiré du board.'] },
  { fichier: 'app/(app)/adsmap/lots/Lots.tsx', messages: ['Ad ajoutée au lot.', 'Ad retirée du lot.'] },
];

describe('chaque action autrefois muette émet désormais un retour', () => {
  for (const { fichier, messages } of CAS) {
    it(`${fichier} · branche le canal et confirme`, () => {
      const src = readFileSync(join(WEB, fichier), 'utf8');
      expect(src, `${fichier} n'importe pas useToast`).toMatch(/useToast/);
      for (const m of messages) {
        expect(src.includes(m), `${fichier} ne confirme plus « ${m} »`).toBe(true);
      }
    });
  }
});
