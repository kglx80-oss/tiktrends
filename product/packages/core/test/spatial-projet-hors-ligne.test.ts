import { describe, expect, it } from 'vitest';
import { TEXTES_HORS_LIGNE, navigateurHorsLigne } from '../src';

describe('Projet · mode hors ligne · quand fermer les gestes', () => {
  it('seul un navigateur qui se SAIT hors ligne ferme les gestes', () => {
    expect(navigateurHorsLigne({ onLine: false })).toBe(true);
    expect(navigateurHorsLigne({ onLine: true })).toBe(false);
  });
  it('inconnu (rendu serveur, propriété absente ou inattendue) · en ligne, on ne ferme rien sur une supposition', () => {
    expect(navigateurHorsLigne(null)).toBe(false);
    expect(navigateurHorsLigne(undefined)).toBe(false);
    expect(navigateurHorsLigne({})).toBe(false);
    expect(navigateurHorsLigne({ onLine: 0 })).toBe(false);
  });
  it('les mots disent ce qui n’est pas envoyé et que la saisie reste, sans tiret cadratin', () => {
    expect(TEXTES_HORS_LIGNE.panneau).toBe('Hors ligne · les gestes sont suspendus, rien n’est envoyé. Tes saisies restent en place.');
    expect(TEXTES_HORS_LIGNE.formulaire).toBe('Hors ligne · rien n’est envoyé, tes saisies restent ici.');
    for (const t of Object.values(TEXTES_HORS_LIGNE)) expect(t).not.toContain('—');
  });
});
