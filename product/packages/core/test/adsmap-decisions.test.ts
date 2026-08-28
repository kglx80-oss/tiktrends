import { describe, it, expect } from 'vitest';
import { buildDecisions, summarizeDecisions, type DecisionAd, type DecisionInput } from '../src/adsmap/decisions';

const ad = (o: Partial<DecisionAd> = {}): DecisionAd => ({
  id: 'a1', label: 'v1 · Concept', status: 'live', verdict: null, verdictStatus: null,
  killFlag: null, spend: 100, matched: true, hasIteration: false, daysSinceLaunch: 10, ...o,
});

const input = (o: Partial<DecisionInput> = {}): DecisionInput =>
  ({ ads: [], batches: [], gaps: [], evaluationWindowDays: 7, ...o });

describe('ce qui brûle passe en premier', () => {
  it('une ad marquée à couper est prioritaire 1', () => {
    const d = buildDecisions(input({ ads: [ad({ killFlag: 'cost', spend: 340 })] }));
    expect(d[0]!.type).toBe('kill_suggested');
    expect(d[0]!.priority).toBe(1);
    expect(d[0]!.title).toContain('340 €');
  });

  it('ne suggère pas de couper quand c’est la page qui ne convertit pas', () => {
    // K3 : la créa fonctionne · couper ferait jeter ce qui marche.
    const d = buildDecisions(input({ ads: [ad({ killFlag: 'convert' })] }));
    expect(d[0]!.action).toContain('Ne coupe pas');
  });

  it('passe avant une décision plus ancienne mais moins chère', () => {
    const d = buildDecisions(input({
      ads: [
        ad({ id: 'vieux', verdict: 'winner', verdictStatus: 'computed', spend: 50, daysSinceLaunch: 90 }),
        ad({ id: 'brule', killFlag: 'cost', spend: 20 }),
      ],
    }));
    expect(d[0]!.targetId).toBe('brule');
  });

  it('ignore une ad à couper qui n’est plus en test', () => {
    expect(buildDecisions(input({ ads: [ad({ killFlag: 'cost', status: 'done' })] }))).toHaveLength(0);
  });
});

describe('ad non rattachée', () => {
  it('signale une ad en test que la mesure ne voit pas', () => {
    const d = buildDecisions(input({ ads: [ad({ matched: false })] }));
    expect(d[0]!.type).toBe('unmapped_ad');
    expect(d[0]!.title).toContain('sans rien mesurer');
  });

  it('ne signale pas une ad non rattachée qui n’est pas lancée', () => {
    expect(buildDecisions(input({ ads: [ad({ matched: false, status: 'draft' })] }))).toHaveLength(0);
  });
});

describe('verdict à arbitrer', () => {
  it('attend que la fenêtre soit écoulée', () => {
    // Arbitrer à trois jours sur une fenêtre de sept, c'est conclure trop tôt.
    const jeune = buildDecisions(input({ ads: [ad({ verdict: 'winner', verdictStatus: 'computed', daysSinceLaunch: 3 })] }));
    expect(jeune).toHaveLength(0);
    const mur = buildDecisions(input({ ads: [ad({ verdict: 'winner', verdictStatus: 'computed', daysSinceLaunch: 7 })] }));
    expect(mur[0]!.type).toBe('validate_verdict');
  });

  it('ne demande pas d’arbitrer un test non concluant', () => {
    const d = buildDecisions(input({ ads: [ad({ verdict: 'inconclusive', verdictStatus: 'computed' })] }));
    expect(d).toHaveLength(0);
  });

  it('ne redemande rien sur un verdict déjà validé', () => {
    const d = buildDecisions(input({ ads: [ad({ verdict: 'loser', verdictStatus: 'validated' })] }));
    expect(d).toHaveLength(0);
  });
});

describe('gagnante à itérer', () => {
  it('la propose une fois arbitrée et jamais itérée', () => {
    const d = buildDecisions(input({ ads: [ad({ verdict: 'winner', verdictStatus: 'validated' })] }));
    expect(d[0]!.type).toBe('accept_iteration');
    expect(d[0]!.priority).toBe(3);
  });

  it('se tait quand une itération existe déjà', () => {
    expect(buildDecisions(input({ ads: [ad({ verdict: 'winner', verdictStatus: 'validated', hasIteration: true })] }))).toHaveLength(0);
  });

  it('n’en propose pas sur une perdante', () => {
    expect(buildDecisions(input({ ads: [ad({ verdict: 'loser', verdictStatus: 'validated' })] }))).toHaveLength(0);
  });
});

describe('lots', () => {
  const lot = (o = {}) => ({ id: 'b1', number: 3, status: 'testing', compliant: false, protocolSummary: 'CBO actif', spend: 900, underfunded: false, ...o });

  it('signale un protocole cassé pendant le test, quand c’est encore corrigeable', () => {
    const d = buildDecisions(input({ batches: [lot()] }));
    expect(d[0]!.type).toBe('protocol_violation');
    expect(d[0]!.title).toContain('900 €');
  });

  it('ne le signale plus une fois le lot analysé', () => {
    expect(buildDecisions(input({ batches: [lot({ status: 'analyzed' })] }))).toHaveLength(0);
  });

  it('alerte sur un lot sous-financé avant lancement seulement', () => {
    expect(buildDecisions(input({ batches: [lot({ status: 'ready', compliant: null, underfunded: true })] }))[0]!.type).toBe('prelaunch_warning');
    expect(buildDecisions(input({ batches: [lot({ status: 'testing', compliant: true, underfunded: true })] }))).toHaveLength(0);
  });
});

describe('plafond par type', () => {
  it('garde les décisions les plus chères quand un type déborde', () => {
    const ads = Array.from({ length: 20 }, (_, i) => ad({ id: `k${i}`, killFlag: 'cost', spend: i * 10 }));
    const d = buildDecisions(input({ ads }));
    expect(d).toHaveLength(8);
    // La plus chère est en tête, la moins chère du lot gardé vaut 130.
    expect(d[0]!.spendAtStake).toBe(190);
    expect(d[7]!.spendAtStake).toBe(120);
  });

  it('un type saturé ne chasse pas les autres', () => {
    const ads = Array.from({ length: 20 }, (_, i) => ad({ id: `k${i}`, killFlag: 'cost', spend: 100 }));
    const gaps = [{ nodeId: 'd1', kind: 'desire' as const, label: 'Dormir mieux' }];
    const d = buildDecisions(input({ ads, gaps }));
    expect(d.some((x) => x.type === 'coverage_gap')).toBe(true);
  });
});

describe('summarizeDecisions', () => {
  it('nomme le montant qui brûle quand il y en a un', () => {
    const d = buildDecisions(input({ ads: [ad({ killFlag: 'cost', spend: 340 })] }));
    expect(summarizeDecisions(d)).toContain('340 €');
  });

  it('nomme le budget dont rien n’a été tiré à défaut d’urgence', () => {
    const d = buildDecisions(input({ ads: [ad({ verdict: 'winner', verdictStatus: 'computed', spend: 200 })] }));
    expect(summarizeDecisions(d)).toContain('200 €');
  });

  it('dit clairement quand il n’y a rien à faire', () => {
    expect(summarizeDecisions([])).toContain('Rien à décider');
  });
});
