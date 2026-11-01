import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHEMINS_DEPOT_PUIS_ECRITURE, cleDuDepot, decisionRetraitDepot, fichiersRecensesDepot, formesRechercheesObjet,
} from '../src/retrait-depot';

/**
 * Stockage · retrait d'un dépôt dont l'écriture a échoué · la règle pure et le
 * tableau des chemins. Les chemins eux-mêmes sont éprouvés sur vraie base
 * (`apps/web/test/stockage-retrait-depot-db.test.ts`, worker
 * `apps/workers/test/stockage-retrait-depot-worker.test.ts`).
 */
const WS = 'a1111111-2222-4333-8444-55555555555b';
const AUTRE = 'b1111111-2222-4333-8444-55555555555b';
const BASE = 'https://cdn.exemple.test/bucket';

describe('decisionRetraitDepot · tout doute est un NON', () => {
  const cle = `assets/${WS}/drive-abc.png`;
  it('retire seulement une clé de l’espace que rien ne cite', () => {
    expect(decisionRetraitDepot(cle, 'aucune')).toEqual({ retirer: true, cle });
  });
  it('une citation garde l’objet (objet préexistant au même endroit)', () => {
    expect(decisionRetraitDepot(cle, 'referencee')).toEqual({ retirer: false, raison: 'referencee' });
  });
  it('une lecture incomplète garde l’objet', () => {
    expect(decisionRetraitDepot(cle, 'inconnue')).toEqual({ retirer: false, raison: 'references_inconnues' });
    expect(decisionRetraitDepot(cle, 'autre' as never)).toEqual({ retirer: false, raison: 'references_inconnues' });
  });
  it('hors espace · rien à retirer, même sans citation', () => {
    expect(decisionRetraitDepot(null, 'aucune')).toEqual({ retirer: false, raison: 'hors_espace' });
  });
});

describe('cleDuDepot · seulement un objet de CET espace', () => {
  it('rend la clé d’un objet de l’espace', () => {
    expect(cleDuDepot(`${BASE}/assets/${WS}/drive-abc.png`, BASE, WS)).toBe(`assets/${WS}/drive-abc.png`);
  });
  it('refuse un lien Drive, un autre espace, une remontée, une autre base', () => {
    expect(cleDuDepot('https://drive.google.com/file/d/abc/view', BASE, WS)).toBeNull();
    expect(cleDuDepot(`${BASE}/assets/${AUTRE}/drive-abc.png`, BASE, WS)).toBeNull();
    expect(cleDuDepot(`${BASE}/assets/${WS}/../${AUTRE}/x.png`, BASE, WS)).toBeNull();
    expect(cleDuDepot(`https://cdn.exemple.test/bucket-voisin/assets/${WS}/x.png`, BASE, WS)).toBeNull();
  });
});

describe('formesRechercheesObjet · les formes que l’inventaire relit aussi', () => {
  it('brute, `/` encodé une et deux fois, en minuscules', () => {
    expect(formesRechercheesObjet(`assets/${WS}/Drive-AB.png`)).toEqual([
      `assets/${WS}/drive-ab.png`, `assets%2f${WS}%2fdrive-ab.png`, `assets%252f${WS}%252fdrive-ab.png`,
    ]);
    expect(formesRechercheesObjet('')).toEqual([]);
  });
});

describe('CHEMINS_DEPOT_PUIS_ECRITURE · le tableau est fermé', () => {
  it('couvre exactement les fichiers du recensement de l’inventaire', () => {
    const tableau = CHEMINS_DEPOT_PUIS_ECRITURE.map((c) => c.fichier).sort();
    expect(new Set(tableau).size, 'fichier en double').toBe(tableau.length);
    expect(tableau).toEqual(fichiersRecensesDepot());
  });

  it('chaque chemin `retrait_si_echec` passe ses écritures par `ecrireApresDepot` (le comportement est éprouvé sur vraie base)', () => {
    const PRODUCT = join(__dirname, '..', '..', '..');
    for (const c of CHEMINS_DEPOT_PUIS_ECRITURE.filter((x) => x.traitement === 'retrait_si_echec')) {
      expect(readFileSync(join(PRODUCT, c.fichier), 'utf8'), c.fichier).toMatch(/ecrireApresDepot\(/);
    }
    expect(CHEMINS_DEPOT_PUIS_ECRITURE.filter((x) => x.traitement === 'retrait_si_echec').length).toBe(4);
  });
});
