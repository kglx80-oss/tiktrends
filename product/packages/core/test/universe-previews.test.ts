import { describe, it, expect } from 'vitest';
import { planUniversePreviews, MAX_PREVIEWS } from '../src/universe-previews';

const HUIT = ['studio', 'lifestyle', 'editorial', 'nature', 'bold', 'cinematic', 'flatlay', 'energy'];

describe('ce qui existe n’est jamais refait', () => {
  it('ne demande que les manquants', () => {
    const p = planUniversePreviews({ all: HUIT, existing: ['studio', 'bold'], creditsPerImage: 5 });
    expect(p.missing).toHaveLength(6);
    expect(p.missing).not.toContain('studio');
    expect(p.missing).not.toContain('bold');
    expect(p.credits).toBe(30);
  });

  it('un second clic ne coûte rien', () => {
    // Un bouton peut être cliqué deux fois, une page rechargée · la barrière ne
    // doit pas dépendre de l'attention de celui qui clique.
    const p = planUniversePreviews({ all: HUIT, existing: HUIT, creditsPerImage: 5 });
    expect(p.missing).toHaveLength(0);
    expect(p.credits).toBe(0);
    expect(p.blocked).toBeTruthy();
  });

  it('refaire est possible, mais jamais par défaut', () => {
    const defaut = planUniversePreviews({ all: HUIT, existing: HUIT, creditsPerImage: 5 });
    const forcee = planUniversePreviews({ all: HUIT, existing: HUIT, creditsPerImage: 5, force: true });
    expect(defaut.credits).toBe(0);
    expect(forcee.credits).toBe(40);
    expect(forcee.summary).toContain('remplacés');
  });
});

describe('le plafond ne se négocie pas', () => {
  it('ne dépasse jamais le maximum, même sur un catalogue plus grand', () => {
    const vingt = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const p = planUniversePreviews({ all: vingt, existing: [], creditsPerImage: 5 });
    expect(p.missing).toHaveLength(MAX_PREVIEWS);
    expect(p.credits).toBe(MAX_PREVIEWS * 5);
  });

  it('le forçage n’ouvre pas le plafond', () => {
    // Sinon « tout refaire » deviendrait une dépense qui grandit avec le
    // catalogue, sans que personne ne l'ait décidé.
    const vingt = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const p = planUniversePreviews({ all: vingt, existing: [], creditsPerImage: 5, force: true });
    expect(p.missing).toHaveLength(MAX_PREVIEWS);
  });

  it('un plafond demandé plus haut que le maximum est ramené au maximum', () => {
    const vingt = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const p = planUniversePreviews({ all: vingt, existing: [], creditsPerImage: 5, max: 99 });
    expect(p.missing).toHaveLength(MAX_PREVIEWS);
  });
});

describe('le prix est annoncé avant le clic', () => {
  it('le résumé porte le nombre et le coût', () => {
    const p = planUniversePreviews({ all: HUIT, existing: [], creditsPerImage: 5 });
    expect(p.summary).toContain('8');
    expect(p.summary).toContain('40 crédit');
  });

  it('dit ce qui attendra un second passage', () => {
    const douze = Array.from({ length: 12 }, (_, i) => `u${i}`);
    const p = planUniversePreviews({ all: douze, existing: [], creditsPerImage: 5 });
    expect(p.summary).toContain('attendra un second passage');
  });

  it('un résumé n’est jamais vide', () => {
    for (const existing of [[], ['studio'], HUIT]) {
      const p = planUniversePreviews({ all: HUIT, existing, creditsPerImage: 5 });
      expect(p.summary.trim().length).toBeGreaterThan(10);
    }
  });

  it('le coût suit le prix du moteur choisi', () => {
    const cher = planUniversePreviews({ all: HUIT, existing: [], creditsPerImage: 20 });
    expect(cher.credits).toBe(160);
  });
});
