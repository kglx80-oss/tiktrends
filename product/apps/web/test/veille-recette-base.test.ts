import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { baseUrlRecette, cleEffective, RECETTE_API_KEY } from '../lib/veille-recette-base';

/**
 * La base de source alternative de /veille est un dispositif de RECETTE, pas un
 * réglage de connecteur production. Trois verrous cumulés · chacun doit refuser
 * seul. On les prouve en les faisant TOMBER un par un depuis un cas qui, lui,
 * passe.
 */

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VEILLE_RECETTE', '1');
  vi.stubEnv('TRENDTRACK_BASE_URL', 'http://127.0.0.1:9099');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('baseUrlRecette · garde stricte hors production', () => {
  it('le cas de recette VALIDE passe (dev + opt-in + loopback)', () => {
    expect(baseUrlRecette()).toBe('http://127.0.0.1:9099');
  });

  it('REFUS en production, même avec opt-in et hôte loopback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(baseUrlRecette()).toBeUndefined();
  });

  it('REFUS sans opt-in explicite', () => {
    vi.stubEnv('VEILLE_RECETTE', '');
    expect(baseUrlRecette()).toBeUndefined();
    vi.stubEnv('VEILLE_RECETTE', '0');
    expect(baseUrlRecette()).toBeUndefined();
  });

  it('REFUS d’un hôte NON loopback · aucune vraie source/clé dirigée vers un tiers', () => {
    vi.stubEnv('TRENDTRACK_BASE_URL', 'https://api.trendtrack.io');
    expect(baseUrlRecette()).toBeUndefined();
    vi.stubEnv('TRENDTRACK_BASE_URL', 'http://198.51.100.7:9099');
    expect(baseUrlRecette()).toBeUndefined();
  });

  it('accepte les formes loopback usuelles', () => {
    for (const u of ['http://localhost:9099', 'http://127.0.0.1:3000', 'http://[::1]:9099']) {
      vi.stubEnv('TRENDTRACK_BASE_URL', u);
      expect(baseUrlRecette(), u).toBe(u);
    }
  });

  it('REFUS d’une URL invalide', () => {
    vi.stubEnv('TRENDTRACK_BASE_URL', 'pas-une-url');
    expect(baseUrlRecette()).toBeUndefined();
  });
});

describe('cleEffective · la vraie clé ne part JAMAIS vers le mock', () => {
  it('en recette (base loopback active) · clé factice constante, pas la vraie clé d’environnement', () => {
    const cle = cleEffective('http://127.0.0.1:9099', 'VRAIE-CLE-SECRETE');
    expect(cle).toBe(RECETTE_API_KEY);
    expect(cle).not.toBe('VRAIE-CLE-SECRETE');
  });

  it('hors recette (pas de base alternative) · la vraie clé d’environnement est utilisée (prod inchangée)', () => {
    expect(cleEffective(undefined, 'VRAIE-CLE-SECRETE')).toBe('VRAIE-CLE-SECRETE');
    expect(cleEffective(undefined, undefined)).toBeUndefined();
  });
});
