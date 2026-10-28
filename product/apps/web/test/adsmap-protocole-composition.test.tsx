import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot UI Protocole · audit /adsmap/protocole. Un seul défaut de présentation :
 * le support flottait (il recouvrait l'aide d'un champ au défilement à 390) au
 * lieu d'être ancré en pied comme sur les autres écrans Adsmap. On ne touche NI
 * seuils, NI calculs, NI permissions, NI fonctions.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
// Spatial · la page Protocole et ses réglages détaillés.
const form = read('spatial/vues/resultats/ReglagesProtocole.tsx');
const page = read('app/(spatial)/sp/adsmap/protocole/page.tsx');

describe('Protocole · permissions et champs INCHANGÉS (non-régression)', () => {
  it('l’édition reste réservée aux admins · canEdit pilote le disabled des champs', () => {
    // La page calcule canEdit = admin, le formulaire désactive tout sinon.
    expect(page).toContain('peutModifier={g.admin}');
    expect(form).toContain('const off = !peutModifier;');
    expect((form.match(/disabled=\{off\}/g) ?? []).length, 'un champ échappe à la lecture seule').toBeGreaterThanOrEqual(12);
    expect(form).toContain('Réservé aux administrateurs de l’espace.');
  });

  it('les champs % restent saisis en % et stockés en fraction (R06 · calcul inchangé)', () => {
    expect(form).toContain('Math.round(s.protocol.budgetVarianceTolerance * 100)');
    expect(form).toContain('nombre(e.target.value) / 100');
  });
});
