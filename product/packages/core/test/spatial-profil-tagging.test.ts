import { describe, expect, it } from 'vitest';
import { ETAT_TAGGING, MOT_DE_PASSE_MIN, liensAccesProfil, messagesRetourProfil, sortieTagging } from '../src';

describe('Spatial · Mon profil · règles', () => {
  it('les messages gardent les textes V5, indexés ok:/e:', () => {
    expect(messagesRetourProfil()).toEqual({
      'ok:1': 'Profil mis à jour.', 'ok:pw': 'Mot de passe modifié.',
      'e:weak': 'Le nouveau mot de passe doit faire 8 caractères min.', 'e:current': 'Mot de passe actuel incorrect.',
    });
    expect(MOT_DE_PASSE_MIN).toBe(8);
  });
  it('liens d’accès · membre rien, admin l’abonnement, fondateur admin le Tour de contrôle en plus', () => {
    expect(liensAccesProfil({ admin: false, fondateur: true })).toEqual([]);
    expect(liensAccesProfil({ admin: true, fondateur: false }).map((l) => l.href)).toEqual(['/billing']);
    expect(liensAccesProfil({ admin: true, fondateur: true }).map((l) => l.href)).toEqual(['/billing', '/admin']);
  });
});

describe('Spatial · Tagging · règles', () => {
  it('la limite est dite, sans chiffre', () => {
    expect(ETAT_TAGGING.titre).toContain('pas encore disponible');
    expect(`${ETAT_TAGGING.titre} ${ETAT_TAGGING.texte}`).not.toMatch(/\d/);
  });
  it('la sortie réelle n’existe qu’avec Résultats', () => {
    expect(sortieTagging({ resultats: false })).toBeNull();
    expect(sortieTagging({ resultats: true })?.href).toBe('/adsmap/apprentissages');
  });
});
