import { describe, it, expect } from 'vitest';
import { mettreEnPage, hauteurNecessaire } from '../src/studios/rendu/texte';
import { POLICES_EMBARQUEES, policeDuDocument } from '../src/studios/rendu/polices';

const SANS = POLICES_EMBARQUEES.Sans!;
const base = { fontSizePx: 100, lineHeight: 1.2, align: 'left' as const, width: 1000, height: 1000 };

describe('mise en page · métriques embarquées (mesurées dans le TTF)', () => {
  it('« Hello » à 100 px : avances H e l l o = 1479+1139+455+455+1139 unités', () => {
    const m = mettreEnPage({ ...base, text: 'Hello' }, SANS);
    expect(m.lignes).toHaveLength(1);
    expect(m.lignes[0]!.largeur).toBeCloseTo(((1479 + 1139 + 455 + 455 + 1139) * 100) / 2048, 9);
    // Encre : bord gauche du H (xMin 168), bord droit du o (xMax 1053).
    expect(m.lignes[0]!.encre!.gauche).toBeCloseTo((168 * 100) / 2048, 9);
    // Ligne de base = demi-interligne + ascendant.
    expect(m.lignes[0]!.ligneDeBase).toBeCloseTo((120 - (1854 + 434) * 100 / 2048) / 2 + (1854 * 100) / 2048, 9);
  });

  it('coupe aux espaces, respecte les retours à la ligne, jamais à l’espace insécable', () => {
    const m = mettreEnPage({ ...base, width: 500, text: 'Prix\u00a0doux et livraison offerte\nD\u00e8s 20 \u20ac' }, SANS);
    const lignes = m.lignes.map((l) => l.texte);
    expect(lignes).toEqual(['Prix\u00a0doux', 'et livraison', 'offerte', 'D\u00e8s 20 \u20ac']);
    expect(m.lignes.every((l) => l.largeur <= 500)).toBe(true);
    // Glouton : la ligne + le mot suivant aurait dépassé 500 px ; l'insécable ne coupe jamais.
    const w = (t: string) => mettreEnPage({ ...base, width: 1e9, text: t }, SANS).lignes[0]!.largeur;
    expect(w('Prix\u00a0doux et')).toBeGreaterThan(500);
    expect(w('et livraison offerte')).toBeGreaterThan(500);
    expect(m.coupureForcee).toBe(false);
  });

  it('alignements centre et droite', () => {
    const c = mettreEnPage({ ...base, align: 'center', text: 'Hi' }, SANS).lignes[0]!;
    const d = mettreEnPage({ ...base, align: 'right', text: 'Hi' }, SANS).lignes[0]!;
    expect(c.x).toBeCloseTo((1000 - c.largeur) / 2, 9);
    expect(d.x + d.largeur).toBeCloseTo(1000, 9);
  });

  it('mot trop long coupé (signalé), débordement en hauteur signalé, caractère absent signalé', () => {
    const m = mettreEnPage({ ...base, width: 200, height: 100, text: 'Anticonstitutionnellement 🙂' }, SANS);
    expect(m.coupureForcee).toBe(true);
    expect(m.deborde).toBe(true);
    expect(m.nonCouverts).toEqual([0x1f642]);
    expect(hauteurNecessaire({ ...base, text: 'a\nb\nc' }, SANS)).toBe(360);
  });

  it('police non embarquée ou téléversée : refus, aucune police de repli', () => {
    expect(policeDuDocument({ f: { family: 'Sans', assetId: null } }, 'f').ok).toBe(true);
    expect(policeDuDocument({ f: { family: 'Helvetica', assetId: null } }, 'f')).toMatchObject({ ok: false });
    expect(policeDuDocument({ f: { family: 'Sans', assetId: 'a_police' } }, 'f')).toMatchObject({ ok: false });
    expect(policeDuDocument({}, 'f')).toMatchObject({ ok: false });
  });
});
