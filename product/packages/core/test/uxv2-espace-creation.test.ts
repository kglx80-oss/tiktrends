import { describe, expect, it } from 'vitest';
import {
  MODES_PROJET, LIBELLES_MODE_PROJET, modeProjetDuChemin, focusDisponible, actionToucheFocus,
  jarvisMasqueDepuisCookie, jarvisCookieString, JARVIS_COOKIE,
} from '../src/index';

/**
 * UX V2 · lot 2 · règles pures de l'espace de création · mode du projet lu
 * dans l'adresse, disponibilité du mode focus, Alt F / Échap, Jarvis masqué.
 */
const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const touche = (o: Partial<{ key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }>) => ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, ...o });
const libre = { saisie: false, dialogue: false };

describe('modeProjetDuChemin · le mode courant du projet', () => {
  it('chaque page du projet a son mode, la fiche est le Brief', () => {
    expect(modeProjetDuChemin(`/studio/projets/${ID}`)).toEqual({ projectId: ID, mode: 'brief' });
    expect(modeProjetDuChemin(`/studio/projets/${ID}/`)).toEqual({ projectId: ID, mode: 'brief' });
    for (const m of ['image', 'video', 'textes', 'produit', 'identites', 'export'] as const) {
      expect(modeProjetDuChemin(`/studio/projets/${ID}/${m}`), m).toEqual({ projectId: ID, mode: m });
    }
  });

  it('hors d’un projet · la liste, la préparation, un segment inconnu ou plus profond ne sont pas des modes', () => {
    expect(modeProjetDuChemin('/studio/projets')).toBeNull();
    expect(modeProjetDuChemin('/studio/projets/nouveau')).toBeNull();
    expect(modeProjetDuChemin(`/studio/projets/${ID}/inconnu`)).toBeNull();
    expect(modeProjetDuChemin(`/studio/projets/${ID}/image/plus`)).toBeNull();
    expect(modeProjetDuChemin('/veille')).toBeNull();
  });

  it('sept modes, chacun nommé en français', () => {
    expect(MODES_PROJET).toEqual(['brief', 'image', 'video', 'textes', 'produit', 'identites', 'export']);
    for (const m of MODES_PROJET) expect(LIBELLES_MODE_PROJET[m]).toBeTruthy();
  });
});

describe('mode focus · disponible dans un projet seulement', () => {
  it('proposé sur les pages du projet, jamais ailleurs', () => {
    expect(focusDisponible(`/studio/projets/${ID}/image`)).toBe(true);
    expect(focusDisponible('/studio/projets')).toBe(false);
    expect(focusDisponible('/dashboard')).toBe(false);
  });

  it('Alt F bascule dans un projet, rien ailleurs ; Ctrl ou Cmd + Alt F ne font rien', () => {
    const altF = touche({ key: 'ƒ', code: 'KeyF', altKey: true });
    expect(actionToucheFocus(altF, libre, { focus: false, disponible: true })).toBe('basculer');
    expect(actionToucheFocus(altF, libre, { focus: true, disponible: true })).toBe('basculer');
    expect(actionToucheFocus(altF, libre, { focus: false, disponible: false })).toBeNull();
    expect(actionToucheFocus({ ...altF, ctrlKey: true }, libre, { focus: false, disponible: true })).toBeNull();
    expect(actionToucheFocus({ ...altF, metaKey: true }, libre, { focus: false, disponible: true })).toBeNull();
  });

  it('Échap quitte le focus, jamais pendant une saisie ni quand un dialogue est ouvert', () => {
    const echap = touche({ key: 'Escape', code: 'Escape' });
    expect(actionToucheFocus(echap, libre, { focus: true, disponible: true })).toBe('quitter');
    expect(actionToucheFocus(echap, libre, { focus: false, disponible: true }), 'Échap hors focus ne fait rien').toBeNull();
    expect(actionToucheFocus(echap, { saisie: false, dialogue: true }, { focus: true, disponible: true }), 'Échap appartient au dialogue').toBeNull();
    expect(actionToucheFocus(echap, { saisie: true, dialogue: false }, { focus: true, disponible: true })).toBeNull();
  });

  it('pendant une saisie, Alt F ne bascule pas (caractère tapé sur certains claviers)', () => {
    expect(actionToucheFocus(touche({ code: 'KeyF', altKey: true }), { saisie: true, dialogue: false }, { focus: false, disponible: true })).toBeNull();
  });
});

describe('Jarvis masquable · préférence par appareil', () => {
  it('seule la valeur « 0 » masque Jarvis · le défaut est visible', () => {
    expect(jarvisMasqueDepuisCookie('0')).toBe(true);
    for (const v of ['1', '', undefined, null, 'oui']) expect(jarvisMasqueDepuisCookie(v as string | undefined | null)).toBe(false);
  });

  it('le cookie posé se relit à l’identique', () => {
    for (const masque of [true, false]) {
      const c = jarvisCookieString(masque);
      expect(c.startsWith(`${JARVIS_COOKIE}=`)).toBe(true);
      expect(c).toContain('path=/');
      expect(c).toContain('samesite=lax');
      expect(jarvisMasqueDepuisCookie(c.split(';')[0]!.split('=')[1])).toBe(masque);
    }
  });
});
