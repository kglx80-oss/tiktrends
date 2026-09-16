import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deux écrans de la MARQUE active affichaient un agrégat de tout l'ESPACE ·
 * même classe que #514 / #516, plus bénigne.
 *
 * - Page Studio · le panneau atelier comptait « pub/visuel/vidéo/brief » par
 *   marque (`generations.brandId`) mais « jugées / en attente » par espace.
 * - Analytics · le nuage de tags maison agrégeait les assets brand-spécifiques
 *   de toutes les marques, à côté de générations pourtant brand-scopées.
 *
 * Le code serveur utilise le singleton `db` (non injectable) · on vérifie la
 * propriété sur la source. Le test tombe si l'un des deux redevient scopé espace.
 */
const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('les écrans de marque lisent la marque, pas tout l’espace', () => {
  it('Studio · les compteurs jugées/en attente filtrent par marque', () => {
    const src = lit('app/(app)/studio/page.tsx');
    const parMarque = (src.match(/eq\(schema\.personas\.brandId, brandId\)/g) ?? []).length;
    expect(parMarque, 'les deux comptes de juger() doivent filtrer par personas.brandId').toBeGreaterThanOrEqual(2);
  });

  it('Analytics · le nuage de tags scope les assets à la marque (ou communs)', () => {
    const src = lit('app/(app)/analytics/page.tsx');
    expect(src, 'les assets du nuage de tags doivent être scopés marque-ou-commun, pas tout l’espace')
      .toMatch(/isNull\(schema\.assets\.brandId\)/);
  });
});
