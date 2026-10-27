import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONNECTEURS_DISPONIBLES, feuilleDeRouteConnecteurs } from '@tiktrends/core';

/**
 * CDC v7 · N09 · l'écran Connexions ne compte plus la feuille de route comme
 * « disponible », et un connecteur déjà branché (Google Drive) ne reparaît pas
 * « à venir ». Vague 2 · l'écran V5 est retiré · la garde porte sur la règle du
 * noyau et sur l'écran Spatial (`app/(spatial)/sp/connections/page.tsx`).
 */
const page = readFileSync(join(process.cwd(), 'app/(spatial)/sp/connections/page.tsx'), 'utf8');

describe('N09 · le catalogue dit une seule vérité', () => {
  it('le compte « branchables » vient du registre commun, pas d’un nombre écrit à la main', () => {
    expect(page).toContain('branchables={CONNECTEURS_DISPONIBLES.length}');
    expect(page).toContain("feuilleDeRoute={feuilleDeRouteConnecteurs(['Dropbox'])}");
  });
  it('la feuille de route exclut ce qui est déjà disponible, et compte ce qu’elle liste', () => {
    const f = feuilleDeRouteConnecteurs();
    const noms = f.categories.flatMap((c) => c.noms);
    for (const d of CONNECTEURS_DISPONIBLES) expect(noms, `${d} listé « à venir »`).not.toContain(d);
    expect(f.enPreparation).toBe(noms.length);
  });
  it('Google Drive est déclaré disponible · plus « à venir »', () => {
    expect(CONNECTEURS_DISPONIBLES).toContain('Google Drive');
  });
});

describe('N09 · une carte connectée dit sa phase, pas juste « connecté »', () => {
  it('Meta connecté sans compte choisi le dit, et une carte sans synchro le dit', () => {
    expect(page).toContain("meta.adAccountId ?? 'compte à choisir'");
    expect(page).toContain('fraicheurConnecteur(iso, FUSEAU_ACCUEIL)');
  });
});
