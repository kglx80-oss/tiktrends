import { describe, it, expect } from 'vitest';
import {
  bilanBudgetEssai, classerLigneEssai, decisionControleVision, decisionDepenseEssai, issueEchecAppel, lireMarqueurControleVision, messageControleIncertain,
  BUDGET_ESSAIS_TOTAL_USD_MICROS,
} from '../src';

/**
 * E2 · règles pures de l'essai réel : quand un contrôle visuel peut partir,
 * quelle issue a un appel échoué, comment une ligne `ai_spend` compte au
 * budget cumulatif de 15 $, et quand une dépense est refusée AVANT l'appel.
 */

describe('contrôle visuel · reprise, exclusion, issue incertaine', () => {
  const engage = { etat: 'engage' as const, le: '2026-10-09T10:00:00.000Z', trace: 't1' };
  const conclu = { etat: 'conclu' as const, le: engage.le, fin: '2026-10-09T10:00:05.000Z', trace: 't1' };
  const incertain = { etat: 'incertain' as const, le: engage.le, fin: conclu.fin, trace: 't1', cause: 'coupure' };

  it('seul cas qui lance : ligne approuvée, pending, aucun marqueur', () => {
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'pending', marqueur: null })).toEqual({ lancer: true });
  });

  it.each([
    ['hors devis', { visionApprouvee: false, qualite: 'pending', marqueur: null }, 'hors_devis'],
    ['incertain, même tranché depuis', { visionApprouvee: true, qualite: 'requires_review', marqueur: incertain }, 'incertain'],
    ['incertain, pending', { visionApprouvee: true, qualite: 'pending', marqueur: incertain }, 'incertain'],
    ['déjà tranché', { visionApprouvee: true, qualite: 'passed', marqueur: conclu }, 'deja_tranche'],
    ['conclu sans verdict écrit (payé)', { visionApprouvee: true, qualite: 'pending', marqueur: conclu }, 'deja_controle'],
    ['engagé ailleurs ou interrompu', { visionApprouvee: true, qualite: 'pending', marqueur: engage }, 'engage'],
    ['marqueur illisible', { visionApprouvee: true, qualite: 'pending', marqueur: 'illisible' as const }, 'engage'],
  ] as const)('%s ⇒ aucun appel (%s)', (_n, e, motif) => {
    expect(decisionControleVision(e)).toEqual({ lancer: false, motif });
  });

  it('le marqueur se lit dans result, illisible si incomplet', () => {
    expect(lireMarqueurControleVision({ assets: {} })).toBeNull();
    expect(lireMarqueurControleVision(null)).toBeNull();
    expect(lireMarqueurControleVision({ controleVision: incertain })).toEqual(incertain);
    expect(lireMarqueurControleVision({ controleVision: { etat: 'engage' } })).toBe('illisible');
    expect(lireMarqueurControleVision({ controleVision: 'x' })).toBe('illisible');
  });

  it('issue d’un échec : avant l’envoi, refus certain, ou incertaine (tout le reste)', () => {
    expect(issueEchecAppel({ nom: 'SpendBlockedError', refusCertain: false })).toBe('avant_envoi');
    expect(issueEchecAppel({ nom: 'PiecesInvalides', refusCertain: false })).toBe('avant_envoi');
    expect(issueEchecAppel({ nom: 'BadRequestError', refusCertain: true })).toBe('refus_certain');
    expect(issueEchecAppel({ nom: 'APIConnectionError', refusCertain: false })).toBe('incertaine');
    expect(issueEchecAppel({ nom: null, refusCertain: false })).toBe('incertaine');
  });

  it('le message dit QUOI réconcilier et COMMENT, sans tiret cadratin', () => {
    const m = messageControleIncertain(incertain, [{ id: 'ligne-1', createdAt: new Date(), actualUsd: 0.147024, cause: 'coupure' }]);
    expect(m).toContain('ligne-1 (0,1470 $ comptés au maximum, connexion coupée ou réponse perdue après envoi)');
    expect(m).toContain('Comment · compare ce montant à l’usage facturé par le fournisseur de texte');
    expect(m).not.toContain('—');
  });
});

describe('budget d’essai cumulatif · 15 $ au total', () => {
  const ligne = (o: Partial<Parameters<typeof classerLigneEssai>[0]>) => ({ provider: 'anthropic', actualUsd: 0.1, inputTokens: null, outputTokens: null, reconcileReason: null, ...o });

  it('classe chaque ligne : réglée, prix fixe, rendue, à réconcilier, réservée sans issue', () => {
    expect(classerLigneEssai(ligne({ inputTokens: 10, outputTokens: 5, actualUsd: 0.02 }))).toEqual({ etat: 'reglee', regleMicros: 20_000, incertainMicros: 0 });
    expect(classerLigneEssai(ligne({ provider: 'fal', actualUsd: 0.08 }))).toEqual({ etat: 'prix_fixe', regleMicros: 80_000, incertainMicros: 0 });
    expect(classerLigneEssai(ligne({ actualUsd: 0 }))).toEqual({ etat: 'rendue', regleMicros: 0, incertainMicros: 0 });
    expect(classerLigneEssai(ligne({ reconcileReason: 'coupure', actualUsd: 0.15 }))).toEqual({ etat: 'a_reconcilier', regleMicros: 0, incertainMicros: 150_000 });
    expect(classerLigneEssai(ligne({ actualUsd: 0.15 }))).toEqual({ etat: 'reservee_sans_issue', regleMicros: 0, incertainMicros: 150_000 });
  });

  it('antérieur + réglé + incertain + réservation ≤ 15 $, sinon refus nommé', () => {
    expect(BUDGET_ESSAIS_TOTAL_USD_MICROS).toBe(15_000_000);
    const b = bilanBudgetEssai({ autoriseMicros: 15_000_000, anterieuresMicros: 1_000_000, lignes: [{ regleMicros: 13_000_000, incertainMicros: 700_000 }] });
    expect(b).toEqual({ autoriseMicros: 15_000_000, anterieuresMicros: 1_000_000, regleMicros: 13_000_000, incertainMicros: 700_000, restantMicros: 300_000, depasse: false });
    expect(decisionDepenseEssai(b, 300_000)).toEqual({ ok: true, resteApresMicros: 0 });
    const r = decisionDepenseEssai(b, 300_001);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Budget d’essai insuffisant · autorisé 15,00 $, déjà engagé 14,70 $ (antérieur 1,00 $, réglé 13,00 $, incertain conservé 0,70 $), reste 0,30 $ < réservation maximale 0,30 $ · rien n’est lancé.');
    expect(decisionDepenseEssai(b, 0).ok).toBe(false);
    expect(bilanBudgetEssai({ autoriseMicros: 15_000_000, anterieuresMicros: 0, lignes: [{ regleMicros: 16_000_000, incertainMicros: 0 }] })).toMatchObject({ restantMicros: 0, depasse: true });
  });
});
