import { describe, expect, it } from 'vitest';
import { decisionConfirmationApercu, estRejeuEcriture, MESSAGE_APERCU_PERIME } from '../src';

/**
 * Studio vidéo · confirmer un aperçu de montage · règles pures.
 * Les gardes de bout en bout (base réelle, écran rendu) vivent côté web :
 * `l6a-video-db.test.ts` et `spatial-video-confirmation.test.tsx`.
 */
describe('decisionConfirmationApercu', () => {
  it('même version · la confirmation passe', () => {
    expect(decisionConfirmationApercu({ id: 'a', n: 3 }, { id: 'a', n: 3 })).toEqual({ ok: true });
  });
  it('version changée · refus qui dit quoi faire et les deux numéros', () => {
    const d = decisionConfirmationApercu({ id: 'a', n: 3 }, { id: 'b', n: 5 });
    expect(d.ok).toBe(false);
    expect(!d.ok && d.message).toBe(`${MESSAGE_APERCU_PERIME} Aperçu calculé sur la version 3, le projet est en version 5.`);
  });
  it('compare l’identifiant, pas le numéro', () => {
    expect(decisionConfirmationApercu({ id: 'a', n: 3 }, { id: 'b', n: 3 }).ok).toBe(false);
  });
});

describe('estRejeuEcriture', () => {
  const courante = { parentId: 'v1', authorId: 'u1', contentHash: 'h' };
  it('fille directe de la base, même auteur, même empreinte · c’est la même écriture', () => {
    expect(estRejeuEcriture({ baseId: 'v1', auteurId: 'u1', empreinteAttendue: 'h', courante })).toBe(true);
  });
  it('tout autre écart reste un conflit', () => {
    expect(estRejeuEcriture({ baseId: 'v0', auteurId: 'u1', empreinteAttendue: 'h', courante })).toBe(false);
    expect(estRejeuEcriture({ baseId: 'v1', auteurId: 'u2', empreinteAttendue: 'h', courante })).toBe(false);
    expect(estRejeuEcriture({ baseId: 'v1', auteurId: 'u1', empreinteAttendue: 'autre', courante })).toBe(false);
    expect(estRejeuEcriture({ baseId: 'v1', auteurId: 'u1', empreinteAttendue: 'h', courante: { ...courante, authorId: null } })).toBe(false);
  });
});
