import { describe, expect, it } from 'vitest';
import { fileSupport, forfaitApresEcheance, plafonnerConcurrents, preavisBascule, prioriteSupport, refusListeConcurrents } from '../src';

describe('bascule des abonnés actuels à l’échéance (29/10, point 5)', () => {
  const fin = new Date('2026-11-12T10:00:00Z');
  it('Core → Essentiel, Plus → Pro, Business → Agence · Starter et les forfaits V2 ne basculent pas', () => {
    expect(['core', 'plus', 'business', 'starter', 'pro', null].map(forfaitApresEcheance)).toEqual(['essentiel', 'pro', 'agence', null, null, null]);
  });
  it('le préavis ne paraît que sous TARIFS_V2, pour un abonné actuel, avec la date de l’échéance', () => {
    expect(preavisBascule({ plan: 'core', tarifsV2: false, abonne: true, finPeriode: fin })).toBeNull();
    expect(preavisBascule({ plan: 'core', tarifsV2: true, abonne: false, finPeriode: fin })).toBeNull();
    expect(preavisBascule({ plan: 'starter', tarifsV2: true, abonne: true, finPeriode: fin })).toBeNull();
    const p = preavisBascule({ plan: 'core', tarifsV2: true, abonne: true, finPeriode: fin })!;
    expect(p.texte).toContain('conservé tel quel, prix et droits compris, jusqu’au 12 novembre 2026');
    expect(p.texte.replace(/\s/g, ' ')).toContain('forfait Essentiel · 29 € par mois TTC, 4 000 crédits par mois');
    expect(p.droits[0]).toBe('1 marque');
    expect(preavisBascule({ plan: 'business', tarifsV2: true, abonne: true, finPeriode: null })!.texte).toContain('jusqu’à ta prochaine échéance');
  });
});

describe('droits appliqués · concurrents et support', () => {
  it('une liste de concurrents ne grandit pas au-delà de la limite · une liste existante plus longue n’est jamais refusée tant qu’elle ne s’allonge pas', () => {
    expect(refusListeConcurrents('essentiel', 0, 1)).toBeNull();
    expect(refusListeConcurrents('essentiel', 1, 2)).toContain('1 concurrent');
    expect(refusListeConcurrents('essentiel', 8, 8)).toBeNull();
    expect(refusListeConcurrents('essentiel', 8, 5)).toBeNull();
    expect(refusListeConcurrents('core', 0, 300)).toBeNull();
    expect(plafonnerConcurrents('pro', ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(plafonnerConcurrents('plus', ['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(6);
  });
  it('la file du SAV · dédié, puis prioritaire, puis e-mail, l’ordre d’arrivée gardé à rang égal', () => {
    expect(['agence', 'pro', 'essentiel', 'business', null].map(prioriteSupport)).toEqual([2, 1, 0, 0, 0]);
    const f = fileSupport([{ id: 1, plan: 'essentiel' }, { id: 2, plan: 'pro' }, { id: 3, plan: 'agence' }, { id: 4, plan: 'pro' }, { id: 5, plan: 'core' }]);
    expect(f.map((t) => t.id)).toEqual([3, 2, 4, 1, 5]);
  });
});
