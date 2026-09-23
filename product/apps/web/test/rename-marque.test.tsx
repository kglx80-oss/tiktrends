// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// On ne charge pas la vraie action serveur (base, IA…) · on vérifie l'UI d'édition.
vi.mock('../app/actions/brands', () => ({ renameBrandAction: () => {} }));

import { RenameMarque } from '../components/RenameMarque';

/**
 * On doit pouvoir RENOMMER la marque depuis son titre.
 *
 * Le nom n'était éditable que dans le formulaire de profil, enfoui en bas de la
 * fiche · introuvable, la marque restait « Ma boutique ». On rend le titre
 * modifiable en place. On vérifie le RÉSULTAT : le crayon ouvre un champ de
 * saisie du nom (pré-rempli) et un bouton d'enregistrement · c'est ce qui
 * permet de changer le nom, pas la simple présence d'un titre.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let hote: HTMLDivElement;
let root: Root;
afterEach(() => { act(() => root.unmount()); hote.remove(); });

function monter(name = 'Ma boutique') {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root.render(<RenameMarque id="b1" name={name} />));
}

describe('renommer la marque · édition en place du titre', () => {
  it('affiche le nom et un contrôle « Renommer »', () => {
    monter('Ma boutique');
    expect(hote.querySelector('h1')?.textContent).toBe('Ma boutique');
    expect(hote.querySelector('[aria-label="Renommer la marque"]'), 'un contrôle de renommage doit exister').not.toBeNull();
  });

  it('le crayon ouvre un champ nom pré-rempli + un bouton d’enregistrement', () => {
    monter('Ma boutique');
    const crayon = hote.querySelector<HTMLButtonElement>('[aria-label="Renommer la marque"]')!;
    act(() => crayon.click());

    const champ = hote.querySelector<HTMLInputElement>('input[name="name"]');
    expect(champ, 'un champ de saisie du nom doit apparaître').not.toBeNull();
    expect(champ!.value, 'le champ est pré-rempli avec le nom actuel').toBe('Ma boutique');
    // L'id part avec le formulaire (mise à jour de la BONNE marque).
    expect(hote.querySelector('input[name="id"]')?.getAttribute('value')).toBe('b1');
    // Un bouton de soumission pour enregistrer.
    const submit = hote.querySelector('button[type="submit"]');
    expect(submit, 'un bouton d’enregistrement doit exister').not.toBeNull();
  });
});
