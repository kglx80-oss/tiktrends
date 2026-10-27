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

const CAS: Array<{ fichier: string; messages: string[]; canal?: RegExp }> = [
  { fichier: 'components/TrackerFeed.tsx', messages: ['Tout marqué comme vu.'] },       // veille
  // Spatial · le canal est le geste de la rubrique (`useGeste` · toast sur retour sans erreur).
  { fichier: 'spatial/vues/resultats/Tri.tsx', messages: ['validé', 'Proposition écartée'], canal: /useGeste/ },
  { fichier: 'app/(app)/assets/AssetsLibrary.tsx', messages: ['Élément importé.'] },
  { fichier: 'app/(app)/connections/DataConnections.tsx', messages: ['Shopify déconnecté.', 'Meta déconnecté.'] },
  { fichier: 'app/(app)/assets/DriveConnect.tsx', messages: ['Google Drive déconnecté.'] },
  { fichier: 'components/SavedBoards.tsx', messages: ['Rangé dans', 'Retiré du board.'] },
  { fichier: 'spatial/vues/resultats/ActionsLot.tsx', messages: ['ajoutée au lot', 'retirée du lot'], canal: /toast\(t\)/ },
  { fichier: 'spatial/vues/resultats/geste.tsx', messages: [], canal: /if \(t\) \{ setMessage\(\{ texte: t, erreur: false \}\); toast\(t\); \}/ },
];

describe('chaque action autrefois muette émet désormais un retour', () => {
  for (const { fichier, messages, canal = /useToast/ } of CAS) {
    it(`${fichier} · branche le canal et confirme`, () => {
      const src = readFileSync(join(WEB, fichier), 'utf8');
      expect(src, `${fichier} ne branche pas le canal de retour`).toMatch(canal);
      for (const m of messages) {
        expect(src.includes(m), `${fichier} ne confirme plus « ${m} »`).toBe(true);
      }
    });
  }
});
