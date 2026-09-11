import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'itération attribuable passe devant.
 *
 * Dans le détail d'une créa, la CTA forte était « ✨ Varier (3) » (toolPrimary),
 * placée AVANT « Décliner ». Or le code dit lui-même que Varier change tout à la
 * fois et n'attribue l'écart à rien · c'est « Décliner » (une seule chose change,
 * le reste tenu) qui apprend. Le bouton qui criait était celui qui n'enseigne
 * rien. On vérifie l'emphase : Décliner premier et primaire, Varier secondaire.
 */
const ADS = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const iDecliner = ADS.indexOf('pour itérer</span>'); // la pastille de primauté de Décliner
const iVarier = ADS.indexOf('Varier (3) · explorer vite'); // le libellé secondaire de Varier

describe('Décliner (attribuable) porte la primauté sur Varier', () => {
  it('Décliner est présenté AVANT Varier dans le détail', () => {
    expect(iDecliner, 'la pastille de primauté de Décliner a disparu').toBeGreaterThan(-1);
    expect(iVarier, 'le libellé secondaire de Varier a disparu').toBeGreaterThan(-1);
    expect(iVarier, 'Varier repasse avant Décliner').toBeGreaterThan(iDecliner);
  });

  it('Varier n’est plus la CTA forte · il porte le style secondaire, jamais toolPrimary', () => {
    const anchor = ADS.indexOf('onClick={() => vary(detailAd)}');
    expect(anchor).toBeGreaterThan(-1);
    const bloc = ADS.slice(anchor - 60, anchor + 160);
    expect(bloc, 'Varier n’est plus en secondaire').toContain('toolBtn');
    expect(bloc, 'Varier reprend la CTA forte').not.toContain('toolPrimary');
  });

  it('Décliner garde l’accent primaire (en-tête en accent-strong)', () => {
    // L'en-tête « Décliner » et sa pastille vivent dans le même bloc accentué.
    const bloc = ADS.slice(iDecliner - 400, iDecliner + 40);
    expect(bloc).toContain('var(--accent-strong)');
  });
});
