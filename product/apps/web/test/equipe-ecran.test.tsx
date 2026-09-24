// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// On ne charge pas les vraies actions serveur (base, session) · on vérifie l'UI.
vi.mock('../app/actions/equipe', () => ({
  enregistrerStaffAction: () => {},
  retirerStaffAction: () => {},
  enregistrerMatriceAction: () => {},
}));

import { EcranEquipe } from '../app/(app)/admin/equipe/EcranEquipe';

/**
 * L'écran d'équipe doit VRAIMENT laisser gérer rôles et droits · on lit le HTML
 * rendu, pas la présence d'un appel :
 *  - chaque membre a une case identifiable et son rôle est présélectionné ;
 *  - la matrice montre une case par rubrique, cochée selon l'état RÉEL (défaut
 *    du rôle si aucune ligne, matrice éditée sinon) · c'est ce qui prouve qu'on
 *    voit et change les droits, pas une grille vide trompeuse ;
 *  - les rôles à accès total (Admin+/Admin) n'ont PAS de case à cocher (jamais
 *    éditables · on ne peut pas se verrouiller hors de l'admin).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let hote: HTMLDivElement;
let root: Root;
afterEach(() => { act(() => root.unmount()); hote.remove(); });

function monter(props: Parameters<typeof EcranEquipe>[0]) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root.render(<EcranEquipe {...props} />));
}

// Une case (checkbox) d'un formulaire de rôle donné, pour une rubrique donnée.
function caseRubrique(role: string, rubrique: string): HTMLInputElement | null {
  const form = hote.querySelector<HTMLFormElement>(`form[data-role="${role}"]`);
  return form?.querySelector<HTMLInputElement>(`input[type="checkbox"][value="${rubrique}"]`) ?? null;
}

describe('écran équipe · membres', () => {
  it('liste chaque membre avec son rôle présélectionné', () => {
    monter({
      moiEmail: 'kguilbaux@agence-glx.fr',
      staff: [
        { email: 'kguilbaux@agence-glx.fr', role: 'adminplus' },
        { email: 'dev@agence-glx.fr', role: 'dev' },
      ],
      matrice: {},
    });
    expect(hote.textContent).toContain('kguilbaux@agence-glx.fr');
    expect(hote.textContent).toContain('dev@agence-glx.fr');
    // Le select de rôle du membre Dev est bien positionné sur « dev ».
    const forms = [...hote.querySelectorAll('form')];
    const formDev = forms.find((f) => (f.querySelector('input[name="email"]') as HTMLInputElement | null)?.value === 'dev@agence-glx.fr');
    expect(formDev?.querySelector<HTMLSelectElement>('select[name="role"]')?.value).toBe('dev');
  });

  it('propose de retirer un autre membre, jamais soi-même', () => {
    monter({
      moiEmail: 'kguilbaux@agence-glx.fr',
      staff: [
        { email: 'kguilbaux@agence-glx.fr', role: 'adminplus' },
        { email: 'dev@agence-glx.fr', role: 'dev' },
      ],
      matrice: {},
    });
    expect(hote.querySelector('[aria-label="Retirer dev@agence-glx.fr"]'), 'on peut retirer un autre').not.toBeNull();
    expect(hote.querySelector('[aria-label="Retirer kguilbaux@agence-glx.fr"]'), 'on ne se retire pas soi-même').toBeNull();
  });
});

describe('écran équipe · matrice des droits', () => {
  const base = { moiEmail: 'a@b.fr', staff: [] as { email: string; role: 'adminplus' }[] };

  it('coche selon les défauts quand aucune ligne n’existe (Membre voit Studio, pas Adsmap)', () => {
    monter({ ...base, matrice: {} });
    expect(caseRubrique('membre', 'studio')?.checked, 'Membre voit Studio par défaut').toBe(true);
    expect(caseRubrique('membre', 'adsmap')?.checked, 'Membre ne voit pas Adsmap par défaut').toBe(false);
  });

  it('la matrice éditée prime sur les défauts (Adsmap coché si la ligne le porte)', () => {
    monter({ ...base, matrice: { membre: ['studio', 'adsmap'] } });
    expect(caseRubrique('membre', 'adsmap')?.checked, 'la ligne ouvre Adsmap').toBe(true);
    // Et une ligne qui retire une rubrique la décoche.
    monter({ ...base, matrice: { membre: [] } });
    expect(caseRubrique('membre', 'studio')?.checked, 'la ligne vide referme Studio').toBe(false);
  });

  it('les rôles à accès total n’ont pas de formulaire de cases (jamais éditables)', () => {
    monter({ ...base, matrice: {} });
    expect(hote.querySelector('form[data-role="adminplus"]'), 'Admin+ non éditable').toBeNull();
    expect(hote.querySelector('form[data-role="admin"]'), 'Admin non éditable').toBeNull();
    expect(hote.querySelector('form[data-role="membre"]'), 'Membre éditable').not.toBeNull();
  });
});
