import { describe, it, expect } from 'vitest';
import {
  ADRESSE_A_RECONCILIER, BUDGET_ESSAIS_TOTAL_USD_MICROS, bilanEssaiAvecEngagements, bilanEssaiReconcilie, classerLigneEssaiReconciliee,
  engagementIncertainReconcilie, messageControleIncertain, type EngagementEssai,
} from '../src';

/**
 * R6 · le budget d'essai compte le FACTURÉ d'une ligne réconciliée (R5), et
 * un engagement incertain dont toutes les lignes sont réconciliées aussi.
 * On lit le BILAN (réglé, incertain, restant), jamais la présence d'un appel.
 */

const A = BUDGET_ESSAIS_TOTAL_USD_MICROS;
const eng = (o: Partial<EngagementEssai> & Pick<EngagementEssai, 'id' | 'etat' | 'reserveMicros'>): EngagementEssai => ({
  commande: 'recette:pas1', regleMicros: null, creeLe: '2026-10-09T10:00:00Z', closLe: null, cause: null, base: 'b', pid: 1, hote: 'h', ...o,
});
/** Une ligne telle que le registre la garde, classée par la règle du noyau. */
const ligne = (o: { actualUsd: number; reconcileReason?: string | null; inputTokens?: number | null; provider?: string; factureMicros?: number | null; engagement?: string | null }) => {
  const c = classerLigneEssaiReconciliee({ provider: o.provider ?? 'anthropic', actualUsd: o.actualUsd, inputTokens: o.inputTokens ?? null, outputTokens: o.inputTokens ?? null, reconcileReason: o.reconcileReason ?? null, factureMicros: o.factureMicros ?? null });
  return { ...c, actualMicros: Math.round(o.actualUsd * 1e6), engagement: o.engagement ?? null };
};

describe('ligne réconciliée · comptée au facturé', () => {
  it('à réconcilier 0,147 $ ⇒ incertain 0,147 $ ; réconciliée à 0,09 $ ⇒ réglée 0,09 $, restant +0,057 $', () => {
    const avant = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: [ligne({ actualUsd: 0.147024, reconcileReason: 'coupure' })], engagements: [] });
    const apres = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: [ligne({ actualUsd: 0.147024, reconcileReason: 'coupure', factureMicros: 90_000 })], engagements: [] });
    expect([avant.regleMicros, avant.incertainMicros]).toEqual([0, 147_024]);
    expect([apres.regleMicros, apres.incertainMicros], 'la ligne réconciliée reste comptée au maximum').toEqual([90_000, 0]);
    expect(apres.restantMicros - avant.restantMicros).toBe(57_024);
  });

  it('facturé AU-DELÀ du réservé ⇒ compté tel quel (la facture fait foi)', () => {
    const b = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: [ligne({ actualUsd: 0.1, reconcileReason: 'delai', factureMicros: 250_000 })], engagements: [] });
    expect([b.regleMicros, b.incertainMicros]).toEqual([250_000, 0]);
  });
});

describe('engagement incertain · facturé si TOUTES ses lignes sont réconciliées, sinon maximum', () => {
  const g = eng({ id: 'g1', etat: 'incertain', reserveMicros: 1_000_000 });

  it('toutes réconciliées ⇒ l’engagement vaut le facturé de ses lignes', () => {
    const lignes = [ligne({ actualUsd: 0.4, reconcileReason: 'coupure', factureMicros: 300_000, engagement: 'g1' }), ligne({ actualUsd: 0.2, reconcileReason: 'service', factureMicros: 100_000, engagement: 'g1' })];
    const b = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes, engagements: [g] });
    expect([b.regleMicros, b.incertainMicros], 'un engagement incertain réconcilié reste compté au maximum').toEqual([400_000, 0]);
    expect(b.restantMicros).toBe(A - 400_000);
    expect(engagementIncertainReconcilie(g, lignes)).toBe(true);
  });

  it('une ligne non réconciliée ⇒ il reste au MAXIMUM réservé', () => {
    const lignes = [ligne({ actualUsd: 0.4, reconcileReason: 'coupure', factureMicros: 300_000, engagement: 'g1' }), ligne({ actualUsd: 0.2, reconcileReason: 'service', engagement: 'g1' })];
    expect(engagementIncertainReconcilie(g, lignes)).toBe(false);
    const b = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes, engagements: [g] });
    expect(b.anterieuresMicros + b.regleMicros + b.incertainMicros, 'l’engagement incertain non entièrement réconcilié a baissé sous son maximum').toBe(1_000_000);
  });

  it('aucune ligne rattachée ⇒ rien ne prouve le facturé : maximum', () => {
    expect(engagementIncertainReconcilie(g, [])).toBe(false);
    expect(bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: [], engagements: [g] }).incertainMicros).toBe(1_000_000);
  });

  it('ouvert (engagé) ⇒ inchangé, même si des lignes réconciliées existent', () => {
    const o = eng({ id: 'o', etat: 'engage', reserveMicros: 500_000 });
    const b = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: [ligne({ actualUsd: 0.1, reconcileReason: 'coupure', factureMicros: 0 })], engagements: [o] });
    expect([b.engageMicros, b.engagementsOuverts, b.incertainMicros]).toEqual([500_000, 1, 500_000]);
  });
});

describe('engagement réglé · une réconciliation postérieure ne le regonfle pas', () => {
  it('réglé à 0,08 + 0,147 (ligne à réconcilier comptée au max à sa clôture), puis 0,147 réconciliée à 0,02 ⇒ total 0,10 $', () => {
    const r = eng({ id: 'r', etat: 'regle', reserveMicros: 300_000, regleMicros: 227_024 });
    const avant = [ligne({ actualUsd: 0.08, provider: 'fal', engagement: 'r' }), ligne({ actualUsd: 0.147024, reconcileReason: 'coupure', engagement: 'r' })];
    const apres = [avant[0]!, ligne({ actualUsd: 0.147024, reconcileReason: 'coupure', factureMicros: 20_000, engagement: 'r' })];
    const b0 = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: avant, engagements: [r] });
    const b1 = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: apres, engagements: [r] });
    expect(b0.regleMicros + b0.incertainMicros).toBe(227_024);
    expect(b1.regleMicros + b1.incertainMicros, 'l’engagement réglé a regonflé la ligne réconciliée').toBe(100_000);
  });

  it('montant réglé AU-DELÀ des lignes (saisi) ⇒ l’excédent reste compté', () => {
    const r = eng({ id: 'r', etat: 'regle', reserveMicros: 900_000, regleMicros: 500_000 });
    const b = bilanEssaiReconcilie({ autoriseMicros: A, anterieuresMicros: 0, lignes: [ligne({ actualUsd: 0.1, reconcileReason: 'coupure', factureMicros: 20_000, engagement: 'r' })], engagements: [r] });
    expect(b.regleMicros + b.incertainMicros).toBe(20_000 + 400_000);
  });
});

describe('sans réconciliation · même bilan qu’E3', () => {
  it('lignes et engagements variés ⇒ identique à bilanEssaiAvecEngagements', () => {
    const lignes = [
      ligne({ actualUsd: 0.08, provider: 'fal', engagement: 'a' }), ligne({ actualUsd: 0.147, reconcileReason: 'coupure', engagement: 'b' }),
      ligne({ actualUsd: 0.2 }), ligne({ actualUsd: 0.05, inputTokens: 10, engagement: 'c' }),
    ];
    const engagements = [
      eng({ id: 'a', etat: 'regle', reserveMicros: 300_000, regleMicros: 80_000 }), eng({ id: 'b', etat: 'incertain', reserveMicros: 500_000 }),
      eng({ id: 'c', etat: 'engage', reserveMicros: 90_000 }), eng({ id: 'd', etat: 'libere', reserveMicros: 70_000 }),
    ];
    const e = { autoriseMicros: A, anterieuresMicros: 1_000_000, lignes, engagements };
    expect(bilanEssaiReconcilie(e)).toEqual(bilanEssaiAvecEngagements(e));
  });
});

describe('message d’un contrôle incertain · pointe vers le geste de réconciliation', () => {
  const m = { le: '2026-10-09T10:00:00Z', fin: '2026-10-09T10:00:05Z', cause: 'coupure' };

  it('ligne marquée à réconcilier ⇒ l’adresse de la section et ce qu’on y saisit', () => {
    const t = messageControleIncertain(m, [{ id: 'ligne-1', createdAt: new Date(), actualUsd: 0.147024, cause: 'coupure' }]);
    expect(ADRESSE_A_RECONCILIER).toBe('/admin/depenses#a-reconcilier');
    expect(t, 'le message ne dit pas où réconcilier').toContain('dans Dépenses · À réconcilier (/admin/depenses#a-reconcilier)');
    expect(t).toContain('saisis le montant facturé, l’identifiant de la preuve et un motif');
    expect(t).toContain('relance le contrôle : seul le contrôle approuvé repart');
    expect(t).not.toContain('—');
  });

  it('aucune ligne marquée (réservée sans issue, ou aucune retrouvée) ⇒ pas d’adresse vers une liste vide', () => {
    expect(messageControleIncertain(m, [{ id: 'l2', createdAt: new Date(), actualUsd: 0.1, cause: null }])).not.toContain(ADRESSE_A_RECONCILIER);
    expect(messageControleIncertain(m, [])).not.toContain(ADRESSE_A_RECONCILIER);
  });
});
