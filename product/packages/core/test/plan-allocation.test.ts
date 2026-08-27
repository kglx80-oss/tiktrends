import { describe, it, expect } from 'vitest';
import { applyPlanAllocation } from '../src/credits';

/**
 * Ces cas encodent le bug le plus coûteux qu'on ait eu : le renouvellement
 * remettait bêtement le solde à l'allocation de la formule, ce qui détruisait
 * les recharges payées. Chaque scénario ci-dessous doit rester vrai.
 */
describe('allocation d’abonnement', () => {
  // Allocations de référence (miroir de PLAN_CREDITS côté web).
  const CORE = 2000;
  const PLUS = 7000;

  it('renouvellement : le solde repart à l’allocation, sans dette ni bonus', () => {
    // Le client a consommé 1500 de ses 2000 crédits Core.
    const r = applyPlanAllocation(500, CORE, CORE);
    expect(r.purchased).toBe(0);
    expect(r.next).toBe(CORE);
    expect(r.delta).toBe(1500);
  });

  it('renouvellement : les recharges payées ne sont PAS détruites', () => {
    // 2000 d’abonnement + 500 achetés, rien consommé.
    const r = applyPlanAllocation(CORE + 500, CORE, CORE);
    expect(r.purchased).toBe(500);
    expect(r.next).toBe(CORE + 500); // et surtout pas 2000
    expect(r.delta).toBe(0);
  });

  it('les crédits d’abonnement ne se cumulent pas d’un mois sur l’autre', () => {
    // Mois 1 non consommé, mois 2 : on ne veut pas 4000.
    const r = applyPlanAllocation(CORE, CORE, CORE);
    expect(r.next).toBe(CORE);
  });

  it('montée en gamme : nouvelle allocation + recharges conservées', () => {
    const r = applyPlanAllocation(CORE + 500, CORE, PLUS);
    expect(r.next).toBe(PLUS + 500);
    expect(r.delta).toBe(PLUS - CORE);
  });

  it('descente en gamme : le solde baisse, les recharges restent', () => {
    const r = applyPlanAllocation(PLUS + 500, PLUS, CORE);
    expect(r.purchased).toBe(500);
    expect(r.next).toBe(CORE + 500);
    expect(r.delta).toBeLessThan(0);
  });

  it('premier abonnement : les crédits d’essai comptent comme acquis', () => {
    // lastPlanCredits vaut 0 tant qu’aucune allocation n’a été posée.
    const r = applyPlanAllocation(200, 0, CORE);
    expect(r.purchased).toBe(200);
    expect(r.next).toBe(CORE + 200);
  });

  it('jamais de solde négatif, quelles que soient les entrées', () => {
    expect(applyPlanAllocation(-50, CORE, CORE).next).toBe(CORE);
    expect(applyPlanAllocation(0, -10, 0).next).toBe(0);
    expect(applyPlanAllocation(100, 0, 0).next).toBe(100);
  });

  it('est idempotente : rejouer le même webhook ne re-crédite pas', () => {
    // Stripe peut relivrer un événement · le second passage doit être neutre.
    const first = applyPlanAllocation(500, CORE, CORE);
    const second = applyPlanAllocation(first.next, CORE, CORE);
    expect(second.next).toBe(first.next);
    expect(second.delta).toBe(0);
  });
});
