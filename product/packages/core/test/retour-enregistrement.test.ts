import { describe, it, expect } from 'vitest';
import { valeurAffichee, compteurApresRetraits, messageEchecEnregistrement, ECHEC_ENREGISTREMENT, focusApresVidage, DELAI_FOCUS_APRES_VIDAGE_MS } from '../src/retour-enregistrement';

describe('retour d’enregistrement · ce que l’écran montre sans attendre le serveur (lot 16)', () => {
  it('montre la valeur enregistrée tant que le serveur montre encore l’ancienne', () => {
    expect(valeurAffichee('Espace démo', { valeur: 'Agence Nord', serveurAvant: 'Espace démo' })).toBe('Agence Nord');
  });

  it('rend la main au serveur dès qu’il a changé (rendu frais arrivé)', () => {
    expect(valeurAffichee('Agence Nord', { valeur: 'Agence Nord', serveurAvant: 'Espace démo' })).toBe('Agence Nord');
    // Un autre onglet a renommé entre-temps · le serveur fait foi.
    expect(valeurAffichee('Autre nom', { valeur: 'Agence Nord', serveurAvant: 'Espace démo' })).toBe('Autre nom');
  });

  it('sans enregistrement local, le serveur seul', () => {
    expect(valeurAffichee('Espace démo', null)).toBe('Espace démo');
    expect(valeurAffichee('', undefined)).toBe('');
  });

  it('compteur · ne retire que ce que le serveur montre encore, jamais sous zéro', () => {
    expect(compteurApresRetraits(3, 1)).toBe(2);
    expect(compteurApresRetraits(2, 0)).toBe(2); // rendu frais déjà arrivé · pas de double retrait
    expect(compteurApresRetraits(1, 3)).toBe(0);
    expect(compteurApresRetraits(3, -2)).toBe(3);
  });

  it('message d’échec · le texte du serveur, sinon une phrase utile, jamais « Erreur. » seul', () => {
    expect(messageEchecEnregistrement('Donne un nom · c’est ce qui identifiera cet élément dans la liste.')).toMatch(/^Donne un nom/);
    expect(messageEchecEnregistrement('')).toBe(ECHEC_ENREGISTREMENT);
    expect(messageEchecEnregistrement(undefined)).toBe(ECHEC_ENREGISTREMENT);
    expect(ECHEC_ENREGISTREMENT).not.toBe('Erreur.');
  });
});

describe('focus après le vidage de la bibliothèque (lot 16, revue Codex)', () => {
  it('reprend le focus seulement après un retrait récent ET un focus perdu', () => {
    expect(focusApresVidage({ demandeA: 1000, maintenant: 1000 + 21_800, focusPerdu: true })).toBe(true);
    expect(focusApresVidage({ demandeA: 1000, maintenant: 1000 + DELAI_FOCUS_APRES_VIDAGE_MS, focusPerdu: true })).toBe(true);
  });
  it('simple visite (aucune demande) · ne déplace rien', () => {
    expect(focusApresVidage({ demandeA: null, maintenant: 5000, focusPerdu: true })).toBe(false);
  });
  it('focus déjà posé ailleurs par l’utilisateur · ne le vole pas', () => {
    expect(focusApresVidage({ demandeA: 1000, maintenant: 2000, focusPerdu: false })).toBe(false);
  });
  it('demande trop ancienne · ne déplace rien', () => {
    expect(focusApresVidage({ demandeA: 1000, maintenant: 1001 + DELAI_FOCUS_APRES_VIDAGE_MS, focusPerdu: true })).toBe(false);
    expect(focusApresVidage({ demandeA: 5000, maintenant: 1000, focusPerdu: true })).toBe(false);
  });
  it('la fenêtre couvre le pire mesuré (21,8 s) avec marge, au-delà d’un cycle de cloche (25 s)', () => {
    expect(DELAI_FOCUS_APRES_VIDAGE_MS).toBeGreaterThan(25_000);
    expect(DELAI_FOCUS_APRES_VIDAGE_MS).toBeGreaterThanOrEqual(2 * 21_800);
  });
});
