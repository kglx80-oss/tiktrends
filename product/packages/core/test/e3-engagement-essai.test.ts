import { describe, it, expect } from 'vitest';
import {
  bilanEssaiAvecEngagements, cloreEngagementEssai, decisionDepenseEssai, engagementValide, lignesARattacher, partEngagement,
  type EngagementEssai,
} from '../src';

/**
 * E3 · un engagement pris AVANT l'appel est compté au bilan dès son écriture,
 * au maximum, tant qu'il n'est pas réglé ; jamais compté deux fois avec ses
 * lignes une fois réglé ; jamais en dessous de la somme des lignes.
 */

const T0 = '2026-10-09T10:00:00.000Z';
const eng = (p: Partial<EngagementEssai> = {}): EngagementEssai => ({
  id: 'g1', commande: 'recette:pas1', reserveMicros: 330_000, etat: 'engage', regleMicros: null,
  creeLe: T0, closLe: null, cause: null, base: 'b1', pid: 1, hote: 'h', ...p,
});
const bilan = (lignes: Array<{ regleMicros: number; incertainMicros: number; engagement?: string | null }>, engagements: EngagementEssai[], anterieuresMicros = 0) =>
  bilanEssaiAvecEngagements({ autoriseMicros: 15_000_000, anterieuresMicros, lignes, engagements });

describe('bilan · réglé + engagé + incertain', () => {
  it('engagement OUVERT sans ligne (processus tué, base détruite) ⇒ compté au maximum, restant diminué', () => {
    const b = bilan([], [eng()]);
    expect(b, 'un engagement ouvert n’est pas compté au bilan').toMatchObject({ engageMicros: 330_000, engagementsOuverts: 1, incertainMicros: 330_000, restantMicros: 14_670_000 });
  });

  it('ouvert avec ses lignes rattachées ⇒ max(réservé, lignes), jamais la somme', () => {
    expect(bilan([{ regleMicros: 80_000, incertainMicros: 0, engagement: 'g1' }], [eng()]).restantMicros).toBe(15_000_000 - 330_000);
    expect(bilan([{ regleMicros: 400_000, incertainMicros: 0, engagement: 'g1' }], [eng()]).restantMicros).toBe(15_000_000 - 400_000);
  });

  it('ouvert, lignes NON rattachées (pas encore clos) ⇒ compté en plus des lignes (prudent)', () => {
    expect(bilan([{ regleMicros: 80_000, incertainMicros: 0 }], [eng()]).restantMicros).toBe(15_000_000 - 80_000 - 330_000);
  });

  it('réglé ⇒ seules les lignes comptent ; libéré ⇒ 0 en plus ; incertain ⇒ au maximum', () => {
    const l = [{ regleMicros: 80_000, incertainMicros: 0, engagement: 'g1' }];
    expect(bilan(l, [eng({ etat: 'regle', regleMicros: 80_000 })])).toMatchObject({ regleMicros: 80_000, incertainMicros: 0, engageMicros: 0, restantMicros: 14_920_000 });
    expect(bilan([], [eng({ etat: 'regle', regleMicros: 50_000 })]), 'un montant réel déclaré sans ligne n’est pas compté').toMatchObject({ regleMicros: 50_000, restantMicros: 14_950_000 });
    expect(bilan([], [eng({ etat: 'libere', cause: 'refus' })]).restantMicros).toBe(15_000_000);
    expect(bilan([], [eng({ etat: 'incertain', cause: 'coupure' })])).toMatchObject({ engageMicros: 0, incertainMicros: 330_000, restantMicros: 14_670_000 });
  });

  it('jamais sous la somme des lignes, quels que soient états et rattachements (balayage)', () => {
    const etats = ['engage', 'regle', 'libere', 'incertain'] as const;
    for (const etat of etats) for (const regle of [0, 50_000, 500_000]) for (const r of [null, 'g1', 'g2']) {
      const lignes = [{ regleMicros: 120_000, incertainMicros: 30_000, engagement: r }, { regleMicros: 10_000, incertainMicros: 0, engagement: null }];
      const b = bilan(lignes, [eng({ etat, regleMicros: etat === 'regle' ? regle : null })]);
      expect(15_000_000 - b.restantMicros, `${etat}/${regle}/${r}`).toBeGreaterThanOrEqual(160_000);
      if (etat === 'engage' || etat === 'incertain') expect(15_000_000 - b.restantMicros, `${etat} au maximum`).toBeGreaterThanOrEqual(330_000);
    }
  });

  it('la décision commune compte l’engagé · 14 $ comptés + un engagement de 0,80 $ ⇒ une seconde demande de 0,80 $ est refusée', () => {
    const b1 = bilan([], [], 14_000_000);
    expect(decisionDepenseEssai(b1, 800_000).ok).toBe(true);
    const b2 = bilan([], [eng({ reserveMicros: 800_000 })], 14_000_000);
    const d = decisionDepenseEssai(b2, 800_000);
    expect(d.ok, 'un engagement ouvert est ignoré par la décision').toBe(false);
    expect(d.ok ? '' : d.message).toContain('Budget d’essai insuffisant · autorisé 15,00 $, déjà engagé 14,80 $');
  });
});

describe('clôture · idempotente, sans retour en arrière', () => {
  const t = new Date('2026-10-09T10:05:00Z');
  it('engage → réglé au montant des lignes rattachées ; rejouée ⇒ aucun changement', () => {
    const a = cloreEngagementEssai(eng(), { etat: 'regle' }, 80_000, t);
    expect(a).toMatchObject({ ok: true, change: true, engagement: { etat: 'regle', regleMicros: 80_000, closLe: t.toISOString() } });
    const b = cloreEngagementEssai(a.ok ? a.engagement : eng(), { etat: 'regle' }, 80_000, t);
    expect(b).toMatchObject({ ok: true, change: false });
  });
  it('engage → libéré / incertain ; rejoués ⇒ aucun changement ; incertain → réglé admis (réconciliation)', () => {
    const l = cloreEngagementEssai(eng(), { etat: 'libere', cause: 'refus certain' }, 0, t);
    expect(l).toMatchObject({ ok: true, change: true, engagement: { etat: 'libere', cause: 'refus certain' } });
    expect(cloreEngagementEssai((l as { engagement: EngagementEssai }).engagement, { etat: 'libere', cause: 'x' }, 0, t)).toMatchObject({ ok: true, change: false });
    const i = cloreEngagementEssai(eng(), { etat: 'incertain', cause: 'coupure' }, 0, t);
    const ie = (i as { engagement: EngagementEssai }).engagement;
    expect(cloreEngagementEssai(ie, { etat: 'incertain', cause: 'x' }, 0, t)).toMatchObject({ ok: true, change: false });
    expect(cloreEngagementEssai(ie, { etat: 'regle', montantMicros: 120_000 }, 0, t)).toMatchObject({ ok: true, engagement: { etat: 'regle', regleMicros: 120_000 } });
  });
  it('réglé ou libéré ⇒ définitif ; incertain → libéré refusé', () => {
    expect(cloreEngagementEssai(eng({ etat: 'regle', regleMicros: 1 }), { etat: 'incertain', cause: 'x' }, 0, t).ok).toBe(false);
    expect(cloreEngagementEssai(eng({ etat: 'libere' }), { etat: 'regle' }, 0, t).ok).toBe(false);
    expect(cloreEngagementEssai(eng({ etat: 'incertain' }), { etat: 'libere', cause: 'x' }, 0, t).ok).toBe(false);
  });
});

describe('rattachement et lecture', () => {
  it('même base, nées depuis l’engagement, pas encore rattachées', () => {
    const l = (id: string, base: string, creeeLe: string, engagement: string | null = null) => ({ id, base, creeeLe, regleMicros: 1, incertainMicros: 0, engagement });
    expect(lignesARattacher([
      l('avant', 'b1', '2026-10-09T09:59:59.999Z'), l('pendant', 'b1', '2026-10-09T10:00:01Z'), l('autre-base', 'b2', '2026-10-09T10:00:01Z'), l('deja', 'b1', '2026-10-09T10:00:01Z', 'g0'),
    ], eng())).toEqual(['pendant']);
  });
  it('part d’un engagement et validation', () => {
    expect(partEngagement(eng(), 400_000)).toEqual({ engage: 0, incertain: 0, regle: 0 });
    expect(engagementValide(eng())).toBe(true);
    expect(engagementValide({ ...eng(), reserveMicros: 0 })).toBe(false);
    expect(engagementValide({ ...eng(), etat: 'regle', regleMicros: null })).toBe(false);
  });
});
