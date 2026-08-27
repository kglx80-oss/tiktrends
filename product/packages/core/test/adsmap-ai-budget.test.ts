import { describe, it, expect } from 'vitest';
import { planAiCalls, summarizePlan, DEFAULT_AI_BUDGET, type AiBudget, type PlannedCall } from '../src/adsmap/ai-budget';

/** Cas de test du C2.3 de l'addendum v2.1, plus les bords qui comptent. */

const budget = (o: Partial<AiBudget> = {}): AiBudget => ({
  ...DEFAULT_AI_BUDGET, spentMonthEur: 0, spentNightEur: 0, ...o,
});

const appel = (key: string, id: string, eur: number, hash = 'h1'): PlannedCall => ({
  key, agent: key.startsWith('a4') ? 'a4_analyst' : (key as PlannedCall['agent']),
  targetId: id, stateHash: hash, estimatedEur: eur, label: `${key} sur ${id}`,
});

describe('plafond nocturne', () => {
  it('2 appels sur 5 passent, 3 sont reportés, une seule décision', () => {
    const calls = [1, 2, 3, 4, 5].map((i) => appel('a4_kill', `ad${i}`, 1));
    const p = planAiCalls(budget({ nightlyCapEur: 2 }), calls);
    expect(p.run).toHaveLength(2);
    expect(p.skipped.filter((s) => s.reason === 'nightly_cap')).toHaveLength(3);
    expect(p.needsDecisionItem).toBe(true);
  });

  it('un appel plus cher que le plafond restant est refusé, pas tronqué', () => {
    const p = planAiCalls(budget({ nightlyCapEur: 1 }), [appel('a0_tagger', 'x', 2.5)]);
    expect(p.run).toHaveLength(0);
    expect(p.estimatedTotalEur).toBe(0);
  });

  it('le plafond mensuel prime même si la nuit a de la marge', () => {
    const p = planAiCalls(budget({ nightlyCapEur: 10, monthlyCapEur: 40, spentMonthEur: 39.5 }), [appel('a4_kill', 'x', 1)]);
    expect(p.skipped[0]!.reason).toBe('monthly_cap');
  });
});

describe('ordre de consommation', () => {
  it('les analyses urgentes passent avant le tagging, quel que soit l’ordre d’entrée', () => {
    const p = planAiCalls(budget({ nightlyCapEur: 1 }), [
      appel('a7_prelaunch', 'c1', 0.5),
      appel('a0_tagger', 'as1', 0.5),
      appel('a4_kill', 'ad1', 0.5),
    ]);
    expect(p.run.map((c) => c.key)).toEqual(['a4_kill', 'a0_tagger']);
  });

  it('une clé inconnue passe en dernier plutôt que de casser le tri', () => {
    const p = planAiCalls(budget({ nightlyCapEur: 1 }), [
      appel('inconnu', 'z', 0.5),
      appel('a4_winner', 'ad1', 0.5),
    ]);
    expect(p.run[0]!.key).toBe('a4_winner');
  });
});

describe('idempotence', () => {
  it('même verdict deux nuits de suite → aucun appel', () => {
    const c = appel('a4_winner', 'ad1', 0.5, 'winner|hook|null|true');
    const deja = new Set(['a4_analyst:ad1:winner|hook|null|true']);
    const p = planAiCalls(budget(), [c], deja);
    expect(p.run).toHaveLength(0);
    // Rien n'a changé : ce n'est pas un manque de budget, donc pas de décision.
    expect(p.needsDecisionItem).toBe(false);
  });

  it('un verdict qui change relance l’analyse', () => {
    const deja = new Set(['a4_analyst:ad1:winner|hook|null|true']);
    const p = planAiCalls(budget(), [appel('a4_winner', 'ad1', 0.5, 'loser|click|null|true')], deja);
    expect(p.run).toHaveLength(1);
  });
});

describe('arrêt manuel', () => {
  it('en pause : aucun appel, et la raison est dite', () => {
    const b = budget({ paused: true });
    const p = planAiCalls(b, [appel('a4_kill', 'ad1', 0.5), appel('a0_tagger', 'as1', 0.5)]);
    expect(p.run).toHaveLength(0);
    expect(p.skipped.every((s) => s.reason === 'paused')).toBe(true);
    expect(summarizePlan(p, b)).toMatch(/pause/i);
  });
});

describe('alerte douce', () => {
  it('à 80 % du plafond mensuel, on prévient sans bloquer', () => {
    const p = planAiCalls(budget({ monthlyCapEur: 40, spentMonthEur: 31 }), [appel('a4_kill', 'ad1', 1)]);
    expect(p.run).toHaveLength(1);          // pas de blocage
    expect(p.softWarning).toBe(true);
  });
  it('en dessous, pas d’alerte', () => {
    const p = planAiCalls(budget({ monthlyCapEur: 40, spentMonthEur: 5 }), [appel('a4_kill', 'ad1', 1)]);
    expect(p.softWarning).toBe(false);
  });
});

describe('résumé affichable', () => {
  const b = budget({ nightlyCapEur: 1 });

  it('rappelle que les verdicts sont à jour malgré le plafond', () => {
    const p = planAiCalls(b, [appel('a4_kill', 'a', 0.5), appel('a0_tagger', 'b', 2)]);
    const s = summarizePlan(p, b);
    expect(s).toMatch(/verdicts/i);
    expect(s).toMatch(/report/i);
  });

  it('nuit calme : message sobre, pas d’alarme', () => {
    expect(summarizePlan(planAiCalls(budget(), []), budget())).toMatch(/rien de nouveau/i);
  });

  it('aucun message ne laisse fuiter de jargon', () => {
    for (const p of [planAiCalls(b, [appel('a4_kill', 'a', 5)]), planAiCalls(budget(), [])]) {
      expect(summarizePlan(p, b)).not.toMatch(/null|undefined|NaN|_cap|a4_/);
    }
  });
});
