import { describe, it, expect } from 'vitest';
import {
  montantSaisiEnMicros, validerSaisieReconciliation, confirmationReconciliation, decisionReconciliation,
  ecranReconciliees, controleIncertainReconcilie, classerLigneEssaiReconciliee, montantMicrosLisible,
  decisionControleVision, ecranReconciliation, vueReconciliation, type SaisieReconciliation,
} from '../src';

/**
 * R5 · règles pures du geste de réconciliation : saisie (montant exact,
 * devise gérée, preuve et motif obligatoires), confirmation réservé →
 * facturé, sort d'une soumission selon la base (idempotence), historique,
 * contrôle visuel relançable, registre d'essai.
 */

const LIGNE = '11111111-2222-4333-8444-555555555555';
const ok: SaisieReconciliation = { ligne: LIGNE, montant: '0,0912', devise: 'USD', preuve: 'in_1QxYz · ligne 4', motif: 'Facture d’octobre, requête retrouvée', cle: 'cle-r5-0001' };

describe('montant saisi · micro-unités exactes, sans flottant', () => {
  it('virgule, point, espaces, « $ », six décimales', () => {
    expect(montantSaisiEnMicros('0,1')).toBe(100_000);
    expect(montantSaisiEnMicros('0.0912')).toBe(91_200);
    expect(montantSaisiEnMicros('1 234,56 $')).toBe(1_234_560_000);
    expect(montantSaisiEnMicros('0,000001')).toBe(1);
    expect(montantSaisiEnMicros('0')).toBe(0);
    expect(montantSaisiEnMicros('0,1470240')).toBeNull();
    for (const x of ['', '-1', '1e3', '1,2,3', 'abc', '0,', ',5']) expect(montantSaisiEnMicros(x), x).toBeNull();
  });
});

describe('saisie · tout est vérifié, toutes les erreurs d’un coup', () => {
  it('saisie complète ⇒ montant en micro-unités, USD', () => {
    expect(validerSaisieReconciliation(ok)).toEqual({ ok: true, saisie: { aiSpendId: LIGNE, billedMicros: 91_200, devise: 'USD', preuve: 'in_1QxYz · ligne 4', motif: 'Facture d’octobre, requête retrouvée', cle: 'cle-r5-0001' } });
  });
  it('devise vide ⇒ USD par défaut ; « usd » ⇒ USD', () => {
    const a = validerSaisieReconciliation({ ...ok, devise: '' });
    const b = validerSaisieReconciliation({ ...ok, devise: ' usd ' });
    expect([a.ok && a.saisie.devise, b.ok && b.saisie.devise]).toEqual(['USD', 'USD']);
  });
  it('devise non gérée ⇒ refusée, aucune conversion', () => {
    const r = validerSaisieReconciliation({ ...ok, devise: 'EUR' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs.map((e) => e.champ)).toEqual(['devise']);
      expect(r.erreurs[0]!.message).toContain('Devise « EUR » non gérée · seul l’USD se rapproche ici, aucune conversion n’est appliquée.');
    }
  });
  it('sans preuve ni motif ⇒ deux refus nommés', () => {
    const r = validerSaisieReconciliation({ ...ok, preuve: '  ', motif: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs.map((e) => e.champ)).toEqual(['preuve', 'motif']);
      expect(r.erreurs[0]!.message).toContain('Identifiant de preuve obligatoire');
      expect(r.erreurs[1]!.message).toContain('Motif obligatoire');
    }
  });
  it('montant vide, illisible, négatif ⇒ refus ; ligne et clé contrôlées', () => {
    const r = validerSaisieReconciliation({ ligne: 'pas-un-uuid', montant: '-3', devise: 'USD', preuve: 'abc', motif: 'abc', cle: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.map((e) => e.champ)).toEqual(['ligne', 'montant', 'cle']);
    const v = validerSaisieReconciliation({ ...ok, montant: '' });
    expect(!v.ok && v.erreurs[0]!.message).toContain('Montant facturé obligatoire');
  });
});

describe('confirmation · réservé → facturé', () => {
  it('facturé inférieur ⇒ réserve libérée, sans avertissement', () => {
    const c = confirmationReconciliation(147_024, 91_200);
    expect(c).toEqual({ texte: 'Réservé 0,147024 $ → facturé 0,0912 $ · le plafond retiendra 0,0912 $ pour cette ligne, 0,055824 $ de réserve libérés.', ecartMicros: -55_824, sens: 'libere', avertissement: null });
  });
  it('facturé SUPÉRIEUR ⇒ accepté, compté, avec avertissement', () => {
    const c = confirmationReconciliation(100_000, 150_000);
    expect(c.sens).toBe('ajoute');
    expect(c.ecartMicros).toBe(50_000);
    expect(c.avertissement).toBe('Attention · le facturé dépasse le réservé de 0,0500 $. Il est accepté et compté tel quel (la facture fait foi) : vérifie le montant et la ligne de facture avant de confirmer.');
  });
  it('égal ⇒ même montant retenu', () => {
    expect(confirmationReconciliation(100_000, 100_000)).toMatchObject({ sens: 'egal', ecartMicros: 0, avertissement: null });
  });
  it('affichage des micro-unités · sans perte', () => {
    expect([montantMicrosLisible(0), montantMicrosLisible(1), montantMicrosLisible(2_500_000), montantMicrosLisible(12_345_678)]).toEqual(['0,0000 $', '0,000001 $', '2,50 $', '12,345678 $']);
  });
});

describe('sort d’une soumission selon la base · idempotent', () => {
  const ligne = { id: LIGNE, reconcileReason: 'coupure', actualUsd: 0.147024 };
  it('ligne à réconcilier, clé neuve ⇒ insérer avec le réservé de la ligne', () => {
    expect(decisionReconciliation({ ligne, parCle: null, parLigne: null }, LIGNE)).toEqual({ geste: 'inserer', reserveMicros: 147_024 });
  });
  it('même clé, même ligne ⇒ la même réconciliation, aucun doublon (avant toute autre règle)', () => {
    expect(decisionReconciliation({ ligne, parCle: { id: 'r1', aiSpendId: LIGNE }, parLigne: { id: 'r1', idempotencyKey: 'k', createdAt: new Date() } }, LIGNE))
      .toEqual({ geste: 'deja_enregistree', reconciliationId: 'r1' });
  });
  it('refus · clé d’une autre ligne, ligne absente, déjà réconciliée, pas à réconcilier', () => {
    const code = (e: Parameters<typeof decisionReconciliation>[0]) => { const d = decisionReconciliation(e, LIGNE); return d.geste === 'refus' ? d.code : d.geste; };
    expect(code({ ligne, parCle: { id: 'r9', aiSpendId: 'autre' }, parLigne: null })).toBe('CLE_AUTRE_LIGNE');
    expect(code({ ligne: null, parCle: null, parLigne: null })).toBe('LIGNE_ABSENTE');
    expect(code({ ligne, parCle: null, parLigne: { id: 'r1', idempotencyKey: 'k', createdAt: new Date('2026-10-09T08:00:00Z') } })).toBe('DEJA_RECONCILIEE');
    expect(code({ ligne: { ...ligne, reconcileReason: null }, parCle: null, parLigne: null })).toBe('PAS_A_RECONCILIER');
  });
});

describe('écrans · la ligne À réconcilier porte son réservé en micro-unités ; historique', () => {
  it('ecranReconciliation · reserveMicros', () => {
    const e = ecranReconciliation(vueReconciliation([{ id: 'a', createdAt: new Date('2026-10-08T12:00:00Z'), provider: 'anthropic', model: null, action: 'x', workspaceId: null, estimatedUsd: 0.147024, actualUsd: 0.147024, cause: 'coupure' }]));
    expect(e.lignes[0]!.reserveMicros).toBe(147_024);
  });
  it('historique · réservé, facturé, écart, preuve, auteur, date ; dépassement dit en texte', () => {
    const e = ecranReconciliees([
      { id: 'r1', aiSpendId: 'a', appelLe: new Date('2026-10-08T12:00:00Z'), provider: 'anthropic', model: 'claude-sonnet-5', action: 'studio:brief', cause: 'coupure', reservedMicros: 147_024, billedMicros: 91_200, currency: 'USD', providerRef: 'in_1', reason: 'facture', auteur: 'k@x.fr', createdAt: new Date('2026-10-09T09:00:00Z') },
      { id: 'r2', aiSpendId: 'b', appelLe: new Date('2026-10-08T13:00:00Z'), provider: 'fal', model: null, action: 'studio:image', cause: 'delai', reservedMicros: 100_000, billedMicros: 150_000, currency: 'USD', providerRef: 'in_2', reason: 'facture', auteur: null, createdAt: new Date('2026-10-09T10:00:00Z') },
    ]);
    expect(e.etat).toBe('rempli');
    expect(e.resume).toBe('2 dépenses réconciliées · 0,247024 $ réservés, 0,2412 $ facturés retenus au plafond.');
    expect(e.lignes.map((l) => [l.id, l.reserve, l.facture, l.ecart, l.depasse, l.auteur, l.le])).toEqual([
      ['r2', '0,1000 $', '0,1500 $ (USD)', '0,0500 $ de plus que la réserve', true, 'auteur inconnu', '09/10/2026 12:00'],
      ['r1', '0,147024 $', '0,0912 $ (USD)', '0,055824 $ libérés', false, 'k@x.fr', '09/10/2026 11:00'],
    ]);
    expect(ecranReconciliees([])).toEqual({ etat: 'vide', resume: 'Aucune dépense réconciliée pour l’instant.', lignes: [] });
  });
});

describe('effets · contrôle visuel relançable, registre d’essai', () => {
  it('incertain réconcilié seulement si TOUTES les lignes le sont, et au moins une', () => {
    expect(controleIncertainReconcilie([])).toBe(false);
    expect(controleIncertainReconcilie([{ reconciliee: true }, { reconciliee: false }])).toBe(false);
    expect(controleIncertainReconcilie([{ reconciliee: true }, { reconciliee: true }])).toBe(true);
  });
  it('decisionControleVision · incertain non réconcilié refusé ; réconcilié ⇒ reprise si non tranché par un humain', () => {
    const m = { etat: 'incertain' as const, le: 'a', fin: 'b', trace: 't', cause: 'coupure' };
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'requires_review', marqueur: m })).toEqual({ lancer: false, motif: 'incertain' });
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'requires_review', marqueur: m, incertainReconcilie: false })).toEqual({ lancer: false, motif: 'incertain' });
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'requires_review', marqueur: m, incertainReconcilie: true })).toEqual({ lancer: true, reprise: true });
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'pending', marqueur: m, incertainReconcilie: true })).toEqual({ lancer: true, reprise: true });
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'rejected', marqueur: m, incertainReconcilie: true })).toEqual({ lancer: false, motif: 'deja_tranche' });
    expect(decisionControleVision({ visionApprouvee: false, qualite: 'requires_review', marqueur: m, incertainReconcilie: true })).toEqual({ lancer: false, motif: 'hors_devis' });
    // Sans marqueur incertain, la réconciliation ne change rien.
    expect(decisionControleVision({ visionApprouvee: true, qualite: 'pending', marqueur: null, incertainReconcilie: true })).toEqual({ lancer: true });
  });
  it('registre · réconciliée = réglée au facturé, plus rien d’incertain ; sinon la règle d’E2', () => {
    const l = { provider: 'anthropic', actualUsd: 0.147024, inputTokens: null, outputTokens: null, reconcileReason: 'coupure' };
    expect(classerLigneEssaiReconciliee({ ...l, factureMicros: null })).toEqual({ etat: 'a_reconcilier', regleMicros: 0, incertainMicros: 147_024 });
    expect(classerLigneEssaiReconciliee({ ...l, factureMicros: 91_200 })).toEqual({ etat: 'reconciliee', regleMicros: 91_200, incertainMicros: 0 });
  });
});
