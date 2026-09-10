import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La lightbox plein écran existait dans le studio Pubs IA · un calque à
 * 92vw×88vh, une fermeture étiquetée… mais RIEN ne l'ouvrait : `setPreview`
 * n'était appelé que pour la refermer (`null`). Du code mort déguisé en
 * fonction. On la câble sur l'image de la vue détail, et on garde deux choses
 * sinon le geste ne sert à rien :
 *  · un vrai chemin d'OUVERTURE (souris ET clavier) ;
 *  · un z-index au-dessus de la modale détail, sinon le zoom s'ouvre DERRIÈRE.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('la lightbox du studio Pubs IA n’est plus morte', () => {
  it('l’image de la vue détail OUVRE la lightbox (souris + clavier)', () => {
    // Deux appels d'ouverture attendus · onClick et onKeyDown · au-delà du seul
    // setPreview(null) de fermeture.
    const ouvertures = SRC.split('setPreview(detailSrc)').length - 1;
    expect(ouvertures, 'attendu un clic ET un raccourci clavier qui ouvrent le zoom').toBeGreaterThanOrEqual(2);
  });

  it('le zoom reste accessible au clavier · Entrée ou Espace', () => {
    expect(SRC).toMatch(/onKeyDown=\{[\s\S]{0,160}?setPreview\(detailSrc\)/);
    expect(SRC).toMatch(/role="button"[\s\S]{0,120}?setPreview\(detailSrc\)|setPreview\(detailSrc\)[\s\S]{0,200}?role="button"/);
  });

  it('la lightbox passe AU-DESSUS de la modale détail, pas derrière', () => {
    const zPreview = Number(/zIndex:\s*(\d+)[\s\S]{0,220}?cursor:\s*'zoom-out'/.exec(SRC)?.[1] ?? 0);
    const zModale = Number(/setDetailIdx\(null\)[\s\S]{0,90}?zIndex:\s*(\d+)/.exec(SRC)?.[1] ?? 0);
    expect(zPreview, 'z-index de la lightbox introuvable').toBeGreaterThan(0);
    expect(zModale, 'z-index de la modale détail introuvable').toBeGreaterThan(0);
    expect(zPreview, `lightbox (${zPreview}) doit dépasser la modale (${zModale})`).toBeGreaterThan(zModale);
  });
});
