import { describe, it, expect } from 'vitest';
import { generationOutcome, producedSomething, type GenerationReply } from '../src/generation-outcome';

describe('zéro image est toujours quelque chose à dire', () => {
  it('un lot vide sans erreur n’est PAS un succès silencieux', () => {
    // C'est le cas qui a été rapporté : on clique, on attend, rien n'apparaît,
    // et rien ne dit pourquoi.
    const o = generationOutcome({ got: 0 });
    expect(o.kind).toBe('error');
    expect(o.kind === 'error' && o.message.length).toBeGreaterThan(20);
  });

  it('zéro sur quatre est un échec, pas un demi-succès', () => {
    // L'ordre des branches compte · testé avant le partiel, sinon « 0/4 généré »
    // se présenterait comme un lot incomplet.
    const o = generationOutcome({ got: 0, requested: 4 });
    expect(o.kind).toBe('error');
  });

  it('aucun cas ne rend un message vide', () => {
    const cas: GenerationReply[] = [
      { got: 0 }, { got: 0, requested: 4 },
      { error: 'clé manquante', got: 0 },
      { got: 2, requested: 4 }, { got: 4, requested: 4 }, { got: 1 },
    ];
    for (const r of cas) {
      const o = generationOutcome(r);
      if (o.kind === 'done') expect(o.got).toBeGreaterThan(0);
      else expect(o.message.trim().length, JSON.stringify(r)).toBeGreaterThan(0);
    }
  });
});

describe('les autres cas', () => {
  it('une erreur du serveur passe telle quelle', () => {
    expect(generationOutcome({ error: 'Crédits insuffisants', got: 0 }))
      .toEqual({ kind: 'error', message: 'Crédits insuffisants' });
  });

  it('un lot incomplet le dit avec les deux chiffres', () => {
    const o = generationOutcome({ got: 2, requested: 4 });
    expect(o.kind).toBe('partial');
    expect(o.kind === 'partial' && o.message).toContain('2/4');
  });

  it('un lot complet ne dit rien · c’est le seul silence permis', () => {
    expect(generationOutcome({ got: 4, requested: 4 })).toEqual({ kind: 'done', got: 4 });
  });

  it('un retour sans quantité demandée reste un succès', () => {
    // « Varier » ne passe pas de `requested` · l'absence ne doit pas se lire
    // comme un lot incomplet.
    expect(generationOutcome({ got: 3 })).toEqual({ kind: 'done', got: 3 });
  });
});

describe('ce qui autorise à refermer la fenêtre', () => {
  it('un échec garde la fenêtre ouverte', () => {
    // Refermer sur une erreur emporte le seul endroit où elle s'affiche · c'est
    // ce qui donnait « il ne se passe rien ».
    expect(producedSomething(generationOutcome({ got: 0 }))).toBe(false);
    expect(producedSomething(generationOutcome({ error: 'x', got: 0 }))).toBe(false);
  });

  it('un lot même incomplet la referme', () => {
    expect(producedSomething(generationOutcome({ got: 1, requested: 4 }))).toBe(true);
    expect(producedSomething(generationOutcome({ got: 4, requested: 4 }))).toBe(true);
  });
});
