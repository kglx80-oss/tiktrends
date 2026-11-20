import { describe, it, expect } from 'vitest';
import { voitDepensePlateforme, messageRefusDepense, REFUS_DEPENSE_CLIENT, checkBudget } from '../src/spend-guard';

/** Le plafond est interne · seul le personnel (fondateur codé, équipe à accès total ADMISSIBLE) en lit les montants. */
describe('qui voit la dépense de la plateforme', () => {
  it('fondateur codé et accès total admissible oui · client, équipe restreinte, accès total non admissible non', () => {
    expect(voitDepensePlateforme({ fondateurCode: true, equipe: null })).toBe(true);
    expect(voitDepensePlateforme({ fondateurCode: false, equipe: { role: 'adminplus', plateformeAdmissible: true } })).toBe(true);
    expect(voitDepensePlateforme({ fondateurCode: false, equipe: { role: 'admin', plateformeAdmissible: true } })).toBe(true);
    expect(voitDepensePlateforme({ fondateurCode: false, equipe: { role: 'manager', plateformeAdmissible: true } })).toBe(false);
    expect(voitDepensePlateforme({ fondateurCode: false, equipe: null })).toBe(false);
  });

  it('accès total NON admissible (e-mail staff capté) · ne lit pas la dépense de la plateforme', () => {
    expect(voitDepensePlateforme({ fondateurCode: false, equipe: { role: 'adminplus', plateformeAdmissible: false } })).toBe(false);
    expect(voitDepensePlateforme({ fondateurCode: false, equipe: { role: 'admin' } }), 'admissibilité absente = non admissible').toBe(false);
  });

  it('le refus d’un client ne porte ni « $ » ni montant ; celui du personnel garde le détail', () => {
    const raison = checkBudget({ spentUsd: 9.5, capUsd: 10 }, 1).reason;
    expect(messageRefusDepense(raison, false)).toBe(REFUS_DEPENSE_CLIENT);
    expect(REFUS_DEPENSE_CLIENT).not.toMatch(/\$|\d/);
    expect(messageRefusDepense(raison, true)).toContain('10.00 $');
  });
});
