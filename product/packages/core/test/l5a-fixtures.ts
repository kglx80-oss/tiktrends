import type { DocumentStudio, CalqueImage, CalqueTexte, CalqueLogo } from '../src/studios/document';

/**
 * Document de recette L5-A · une publicité 1:1 : fond plein cadre, produit 420 × 630,
 * titre en haut, appel à l'action en bas, logo.
 * Produit source 800 × 1200 (portrait), fond source 1080 × 1080.
 */
export function pub11(): DocumentStudio {
  const fond: CalqueImage = { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1080, rotationDeg: 0, opacity: 1, z: 0, assetId: 'a_fond', sourceWidth: 1080, sourceHeight: 1080, mask: null };
  const produit: CalqueImage = { id: 'produit', kind: 'image', name: 'Produit', visible: true, locked: true, x: 330, y: 260, width: 420, height: 630, rotationDeg: 0, opacity: 1, z: 10, assetId: 'a_produit', sourceWidth: 800, sourceHeight: 1200, mask: null };
  const titre: CalqueTexte = { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 60, width: 960, height: 150, rotationDeg: 0, opacity: 1, z: 20, text: 'La crème qui tient 24 h', fontId: 'f_titre', fontSizePx: 64, color: '#1a1a1a', align: 'center', lineHeight: 1.1 };
  const cta: CalqueTexte = { id: 'cta', kind: 'text', name: 'Appel', visible: true, locked: false, x: 290, y: 940, width: 500, height: 60, rotationDeg: 0, opacity: 1, z: 21, text: 'Je la teste', fontId: 'f_corps', fontSizePx: 40, color: '#ffffff', align: 'center', lineHeight: 1.2 };
  const logo: CalqueLogo = { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 22, assetId: 'a_logo' };
  return {
    width: 1080, height: 1080, colorSpace: 'sRGB',
    layers: { fond, produit, titre, cta, logo },
    fonts: { f_titre: { family: 'Sans Bold', assetId: null }, f_corps: { family: 'Sans', assetId: null } },
  };
}

export const gele = <T>(x: T): T => {
  if (x && typeof x === 'object') { Object.values(x as object).forEach(gele); Object.freeze(x); }
  return x;
};
