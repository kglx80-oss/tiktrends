import { describe, it, expect } from 'vitest';
import { valeurAffichee, compteurApresRetraits, messageEchecEnregistrement, ECHEC_ENREGISTREMENT } from '../src/retour-enregistrement';

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
