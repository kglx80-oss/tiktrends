import { describe, it, expect } from 'vitest';
import { voitDepensePlateforme, messageRefusDepense, REFUS_DEPENSE_CLIENT, checkBudget } from '../src/spend-guard';

/** Le plafond est interne · seul le personnel (fondateur, équipe à accès total) en lit les montants. */
describe('qui voit la dépense de la plateforme', () => {
  it('fondateur et accès total oui · client, équipe restreinte non', () => {
    expect(voitDepensePlateforme({ fondateur: true })).toBe(true);
    expect(voitDepensePlateforme({ fondateur: false, roleEquipe: 'adminplus' })).toBe(true);
    expect(voitDepensePlateforme({ fondateur: false, roleEquipe: 'admin' })).toBe(true);
    expect(voitDepensePlateforme({ fondateur: false, roleEquipe: 'manager' })).toBe(false);
    expect(voitDepensePlateforme({ fondateur: false, roleEquipe: null })).toBe(false);
  });

  it('le refus d’un client ne porte ni « $ » ni montant ; celui du personnel garde le détail', () => {
    const raison = checkBudget({ spentUsd: 9.5, capUsd: 10 }, 1).reason;
    expect(messageRefusDepense(raison, false)).toBe(REFUS_DEPENSE_CLIENT);
    expect(REFUS_DEPENSE_CLIENT).not.toMatch(/\$|\d/);
    expect(messageRefusDepense(raison, true)).toContain('10.00 $');
  });
});
