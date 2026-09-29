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
const shell = read('components/AppShell.tsx');
const form = read('app/(app)/adsmap/protocole/ProtocolForm.tsx');
const page = read('app/(app)/adsmap/protocole/page.tsx');

describe('Protocole · le support est ANCRÉ (il ne recouvre plus le contenu)', () => {
  it('/adsmap/protocole entre dans la liste des écrans à support ancré', () => {
    expect(shell, 'le support de /adsmap/protocole flotte encore et recouvre le contenu au défilement')
      .toContain("pathname === '/adsmap/protocole'");
  });
});

describe('Protocole · permissions et champs INCHANGÉS (non-régression)', () => {
  it('l’édition reste réservée aux admins · canEdit pilote le disabled des champs', () => {
    // La page calcule canEdit = admin, le formulaire désactive tout sinon.
    expect(page).toContain("roleAtLeast(s.role, 'admin')");
    expect(form).toContain('disabled={!canEdit}');
    expect(form).toContain('Lecture seule');
  });

  it('les champs % restent saisis en % et stockés en fraction (R06 · calcul inchangé)', () => {
    expect(form).toContain('Math.round(s.protocol.budgetVarianceTolerance * 100)');
    expect(form).toContain('Number(e.target.value) / 100');
  });
});
