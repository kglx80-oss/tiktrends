import { describe, it, expect } from 'vitest';
import { applyPlanAllocation, allouerPoches, debiterPoches, rembourserPoches, pocheAbonnement, pocheHorsAbonnement, type PochesCredits } from '../src/credits';

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

/**
 * Poches de crédits (audit crédits du 29/10, incohérence 6) · Core 2 000 +
 * recharge 1 000, 500 dépensés, renouvellement : l'ancienne lecture gardait 500
 * achetés (solde − dernière allocation), la poche d'abonnement en garde 1 000.
 * La garde sur base réelle est `apps/web/test/credits-poches-db.test.ts`.
 */
describe('poches de crédits · règle pure', () => {
  const alloue = (solde: number, alloc: number): PochesCredits => ({ solde, abonnementRestant: alloc, derniereAllocation: alloc, horsAbonnementConsommes: 0 });

  it('2 000 + 1 000, moins 500, renouvelé : 1 000 achetés gardés', () => {
    const apres = debiterPoches(alloue(3000, 2000), 500)!;
    expect([pocheAbonnement(apres), pocheHorsAbonnement(apres)]).toEqual([1500, 1000]);
    const r = allouerPoches(apres, 2000);
    expect(r.purchased).toBe(1000);
    expect(r.next).toBe(3000);
  });

  it('débit au-delà de l’abonnement · le surplus seul est pris aux achetés, et rendu en premier', () => {
    const p = debiterPoches(alloue(3000, 2000), 2300)!;
    expect([p.solde, pocheAbonnement(p), p.horsAbonnementConsommes]).toEqual([700, 0, 300]);
    const q = rembourserPoches(p, 400);
    expect([q.solde, pocheAbonnement(q), pocheHorsAbonnement(q)]).toEqual([1100, 100, 1000]);
  });

  it('solde insuffisant · null, rien ne bouge', () => {
    expect(debiterPoches(alloue(100, 100), 101)).toBeNull();
  });

  it('poche jamais suivie · repli sur min(dernière allocation, solde), la lecture d’avant', () => {
    const p: PochesCredits = { solde: 2600, abonnementRestant: null, derniereAllocation: 2000, horsAbonnementConsommes: 0 };
    expect(pocheHorsAbonnement(p)).toBe(600);
    expect(allouerPoches(p, 2000).next).toBe(2600);
  });
});
