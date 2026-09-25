import { describe, it, expect } from 'vitest';
import { personnalisationAccueil, starters, chatSystemPrompt } from '../src/index';

/**
 * L'accueil personnalise vraiment · les réponses cessent d'être un formulaire
 * sans effet. On vérifie des RÉSULTATS : les suggestions CHANGENT selon
 * l'objectif, le ton CHANGE selon le niveau. Muter le branchement (ignorer
 * l'objectif, ignorer le niveau) fait tomber ces assertions.
 */

describe('personnalisationAccueil · traduit les réponses stockées', () => {
  it('le premier but qui a un sens fixe l’objectif · « analyser » vise les résultats', () => {
    expect(personnalisationAccueil({ goals: ['analyze'], adLevel: 'debute' }))
      .toEqual({ objectif: 'resultats', niveau: 'debut' });
  });

  it('« créer/cloner/scaler/vidéo » visent tous la fabrication', () => {
    expect(personnalisationAccueil({ goals: ['ads'] }).objectif).toBe('creer');
    expect(personnalisationAccueil({ goals: ['clone'] }).objectif).toBe('creer');
    expect(personnalisationAccueil({ goals: ['scale'] }).objectif).toBe('creer');
    expect(personnalisationAccueil({ goals: ['video'] }).objectif).toBe('creer');
  });

  it('l’expérience PUBLICITAIRE se traduit en registre · métier/teste, crée, débute', () => {
    expect(personnalisationAccueil({ adLevel: 'metier' }).niveau).toBe('avance');
    expect(personnalisationAccueil({ adLevel: 'teste' }).niveau).toBe('avance');
    expect(personnalisationAccueil({ adLevel: 'cree' }).niveau).toBe('intermediaire');
    expect(personnalisationAccueil({ adLevel: 'debute' }).niveau).toBe('debut');
  });

  it('l’ancien « niveau IA » n’est PAS relu comme une expérience pub · niveau nul', () => {
    // Re-signifier une ancienne réponse serait un mensonge · un compte qui n'a
    // répondu qu'à l'ancienne question n'a pas de niveau pub tant qu'il ne
    // répond pas à la nouvelle.
    expect(personnalisationAccueil({ aiLevel: 'advanced' }).niveau).toBeNull();
    expect(personnalisationAccueil({ aiLevel: 'starter' }).niveau).toBeNull();
    // Et l'objectif reste lu, lui, à partir des buts inchangés.
    expect(personnalisationAccueil({ goals: ['analyze'], aiLevel: 'advanced' }))
      .toEqual({ objectif: 'resultats', niveau: null });
  });

  it('absent, vide, inconnu ou d’une autre forme · aucune personnalisation devinée', () => {
    expect(personnalisationAccueil(null)).toEqual({ objectif: null, niveau: null });
    expect(personnalisationAccueil({})).toEqual({ objectif: null, niveau: null });
    expect(personnalisationAccueil({ goals: ['autre_but'], adLevel: 'inconnu' }))
      .toEqual({ objectif: null, niveau: null });
    expect(personnalisationAccueil('bruit')).toEqual({ objectif: null, niveau: null });
  });
});

describe('starters · l’objectif oriente les trois suggestions', () => {
  const generique = starters({ measuredAds: 0, hasMarket: false });

  it('créer · propose de fabriquer, pas de lire des chiffres', () => {
    const s = starters({ measuredAds: 0, hasMarket: false, objectif: 'creer' });
    expect(s).not.toEqual(generique);
    expect(s.join(' ')).toContain('On crée quoi');
  });

  it('résultats sans mesure · propose de produire de la donnée, pas d’en lire', () => {
    const s = starters({ measuredAds: 0, hasMarket: false, objectif: 'resultats' });
    expect(s.join(' ')).toContain('De quelles données as-tu besoin');
  });

  it('résultats AVEC mesure · propose de lire ce qui marche', () => {
    const s = starters({ measuredAds: 12, hasMarket: false, objectif: 'resultats' });
    expect(s.join(' ')).toContain('Qu’est-ce qui marche le mieux');
  });

  it('concurrents · propose d’examiner une marque', () => {
    const s = starters({ measuredAds: 5, hasMarket: false, objectif: 'concurrents' });
    expect(s.join(' ')).toContain('examine');
  });

  it('sans objectif · comportement générique inchangé (mesuré ou non)', () => {
    expect(starters({ measuredAds: 0, hasMarket: false, objectif: null })).toEqual(generique);
    expect(starters({ measuredAds: 3, hasMarket: false }).join(' ')).toContain('marche le mieux');
  });
});

describe('chatSystemPrompt · le niveau règle le registre, jamais l’accès', () => {
  const base = { brandName: 'Neva', memory: '', measuredAds: 0, canAdsmap: false };

  it('débutant · Jarvis définit les termes, une étape à la fois', () => {
    const p = chatSystemPrompt({ ...base, niveau: 'debut' });
    expect(p).toContain('REGISTRE');
    expect(p).toContain('une\nétape à la fois');
  });

  it('avancé · droit au but, sans tutoriel', () => {
    const p = chatSystemPrompt({ ...base, niveau: 'avance' });
    expect(p).toContain('REGISTRE');
    expect(p).toContain('droit au but');
  });

  it('intermédiaire ou absent · aucun bloc de registre imposé', () => {
    expect(chatSystemPrompt({ ...base, niveau: 'intermediaire' })).not.toContain('REGISTRE');
    expect(chatSystemPrompt({ ...base })).not.toContain('REGISTRE');
  });
});
