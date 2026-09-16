import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les sélecteurs du composeur à plat portaient leur état sélectionné par la
 * SEULE couleur · un lecteur d'écran ne savait pas ce qui était choisi (source,
 * mode de fabrication, essai, mise en page, asset). Comme sur les assistants
 * (#525, #530, #531), chaque bascule expose désormais `aria-pressed`. Non
 * couvert par une règle globale.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source, qui lit l'attribut porté par chaque bouton bascule.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

const bascules: Array<[string, string]> = [
  ['source (marque / clone)', "setMode(k); setError(''); }} aria-pressed={mode === k}"],
  ['mode de fabrication', 'onClick={() => choisirFabrication(m)} aria-pressed={on}'],
  ['essai', 'onClick={() => setEssai(e.key)} aria-pressed={on}'],
  ['mise en page', 'onClick={() => setLayout(l.key)} aria-pressed={on}'],
  ['asset', 'onClick={() => toggleAsset(a.id)} aria-pressed={on}'],
];

describe('AdsStudio · l’état des sélecteurs est exposé (aria-pressed)', () => {
  for (const [nom, motif] of bascules) {
    it(`le sélecteur « ${nom} » expose sa sélection`, () => {
      expect(src, `la bascule « ${nom} » n’expose pas son état`).toContain(motif);
    });
  }
});
