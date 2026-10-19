import { describe, it, expect } from 'vitest';
import {
  consigneOnboardingJarvis, startersOnboarding, ACTION_PREMIERE_MARQUE,
  ENTREES_ONBOARDING_JARVIS, TITRE_ONBOARDING_JARVIS,
} from '../src/index';

/**
 * UX V5 · Jarvis onboarding (sans marque) · un RÉSULTAT.
 *
 * Le compte neuf n'est plus un cul-de-sac · on vérifie que le TEXTE du guide
 * oriente vers la CRÉATION (verbe créer, jamais « sélectionner » une marque qui
 * n'existe pas), ne fabrique aucune donnée, et pointe vers de vraies routes.
 */

describe('l’action primaire · créer, jamais choisir', () => {
  it('dit « Créer » et vise le vrai écran de création', () => {
    expect(ACTION_PREMIERE_MARQUE.label).toMatch(/^Créer/);
    expect(ACTION_PREMIERE_MARQUE.href).toBe('/brands/new');
    // Jamais le vocabulaire du cul-de-sac.
    expect(ACTION_PREMIERE_MARQUE.label).not.toMatch(/sélectionne|choisir/i);
    expect(TITRE_ONBOARDING_JARVIS).not.toMatch(/sélectionne/i);
  });
});

describe('les entrées · vers de VRAIES destinations', () => {
  it('chaque entrée a un titre et une route réelle de l’app', () => {
    expect(ENTREES_ONBOARDING_JARVIS.length).toBeGreaterThanOrEqual(2);
    for (const e of ENTREES_ONBOARDING_JARVIS) {
      expect(e.titre.trim()).not.toBe('');
      expect(e.href).toMatch(/^\/(brands\/new|veille)/);
    }
  });
});

describe('les amorces d’onboarding · guident le premier pas', () => {
  it('plusieurs questions concrètes, non vides', () => {
    const a = startersOnboarding();
    expect(a.length).toBeGreaterThanOrEqual(3);
    for (const q of a) expect(q.trim().length).toBeGreaterThan(5);
  });
});

describe('la consigne système d’onboarding · générique, orientée création', () => {
  const sys = consigneOnboardingJarvis({ espace: 'Agence GLX' });

  it('dit qu’il n’y a AUCUNE marque et interdit d’inventer', () => {
    expect(sys).toMatch(/aucune marque|n’a encore AUCUNE marque/i);
    expect(sys).toMatch(/n’invente/i);
  });

  it('oriente vers « créer » la première marque, pas vers « sélectionner »', () => {
    expect(sys).toMatch(/cré(er|e)/i);
    expect(sys).toMatch(/sélectionner/i); // présente la consigne « dis créer, jamais sélectionner »
    // La phrase interdit explicitement « sélectionner » une marque inexistante.
    expect(sys).toMatch(/jamais « sélectionner »/i);
  });

  it('ne prétend disposer d’aucun chiffre ni résultat de marque', () => {
    expect(sys).toMatch(/aucun chiffre|aucune mémoire mesurée/i);
  });

  it('sans espace fourni, reste valide (pas de « undefined »)', () => {
    const s2 = consigneOnboardingJarvis();
    expect(s2).not.toMatch(/undefined|null/);
    expect(s2).toMatch(/Jarvis/);
  });
});
