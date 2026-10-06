import { describe, it, expect } from 'vitest';
import {
  validerSaisie, creerConnaissance, publierVersion, versionsApplicables, assemblerConnaissances, apercuContextePlateforme,
  PLAFOND_CONNAISSANCES, LIMITE_TEXTE, type Connaissance, type SaisieConnaissance,
} from '../src/index';

/**
 * Message 63 · `assemblerConnaissances` · sous le plafond, la place allait
 * d'abord aux documents les plus ANCIENS · une ancienne consigne longue excluait
 * la plus récente, alors que l'en-tête promet que la plus récente prime.
 */

const ctx = { workspaceId: '11111111-1111-4111-8111-111111111111', brandId: '33333333-3333-4333-8333-333333333333' };
const ok = <T,>(r: { ok: true; valeur: T } | { ok: false; erreur: string }): T => { if (!r.ok) throw new Error(r.erreur); return r.valeur; };
const saisie = (o: Partial<SaisieConnaissance>): SaisieConnaissance => ({ titre: 'T', type: 'instruction', texte: 'x', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o });
function publiee(id: string, o: Partial<SaisieConnaissance>, quand: string): Connaissance {
  return ok(publierVersion(creerConnaissance(id, ok(validerSaisie(saisie(o))), 'e', quand), 1, 'e', quand));
}
const id = (k: number) => `0000006${k}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;

describe('plafond saturé · la place va d’abord aux plus récentes', () => {
  // Plafond RÉEL (6 000) · l'ancienne consigne est longue, la récente courte et contradictoire.
  const ancienne = publiee(id(1), { titre: 'Ancienne · réponds en dix phrases', texte: 'ANCIENNE '.repeat(Math.floor((LIMITE_TEXTE - 50) / 9)) }, '2026-10-01T08:00:00.000Z');
  const recente = publiee(id(2), { titre: 'Récente · réponds en trois phrases', texte: 'RECENTE · réponds en trois phrases au plus.' }, '2026-10-05T08:00:00.000Z');

  it('reproduction · la consigne la plus récente entre EN ENTIER, sous le plafond réel', () => {
    const bloc = assemblerConnaissances(versionsApplicables([ancienne, recente], ctx).retenues);
    expect(PLAFOND_CONNAISSANCES).toBe(6000);
    expect(bloc.texte.length).toBeLessThanOrEqual(PLAFOND_CONNAISSANCES);
    const r = bloc.inclus.find((i) => i.titre.startsWith('Récente'));
    expect(r, 'la consigne récente est exclue').toBeDefined();
    expect(r!.tronquee, 'la consigne récente est tronquée').toBe(false);
    expect(bloc.texte).toContain('RECENTE · réponds en trois phrases au plus.');
  });

  it('la plus récente reste la DERNIÈRE lue · l’ancienne est tronquée (dit), avant elle', () => {
    const bloc = assemblerConnaissances(versionsApplicables([recente, ancienne], ctx).retenues);
    expect(bloc.inclus.map((i) => [i.titre.split(' ·')[0], i.tronquee])).toEqual([['Ancienne', true], ['Récente', false]]);
    expect(bloc.texte.indexOf('ANCIENNE')).toBeLessThan(bloc.texte.indexOf('RECENTE'));
    expect(bloc.texte).toContain('[… tronqué');
  });

  it('trois consignes · les plus anciennes sont exclues (dit), la récente entière et dernière', () => {
    const tres = publiee(id(3), { titre: 'Très ancienne', texte: 'TRES '.repeat(1100) }, '2026-09-01T08:00:00.000Z');
    const bloc = assemblerConnaissances(versionsApplicables([tres, ancienne, recente], ctx).retenues);
    expect(bloc.inclus[bloc.inclus.length - 1]!.titre.startsWith('Récente')).toBe(true);
    expect(bloc.inclus[bloc.inclus.length - 1]!.tronquee).toBe(false);
    expect(bloc.exclues.map((e) => e.titre)).toEqual(['Très ancienne']);
    expect(bloc.texte).toContain('1 autre(s) document(s) de l’équipe n’ont pas tenu');
  });

  it('éditorial avant sources · une méthode récente passe avant un savoir récent', () => {
    const savoir = publiee(id(4), { titre: 'Savoir', type: 'savoir', texte: 'SAVOIR '.repeat(700) }, '2026-10-06T08:00:00.000Z');
    const methode = publiee(id(5), { titre: 'Méthode', type: 'methode', texte: 'METHODE '.repeat(500) }, '2026-09-01T08:00:00.000Z');
    const bloc = assemblerConnaissances(versionsApplicables([savoir, methode], ctx).retenues);
    expect(bloc.inclus.find((i) => i.titre === 'Méthode')!.tronquee).toBe(false);
    // Ordre de lecture inchangé · éditorial d'abord.
    expect(bloc.texte.indexOf('METHODE')).toBeLessThan(bloc.texte.indexOf('SAVOIR'));
  });

  it('l’aperçu de l’écran suit la même règle', () => {
    const a = apercuContextePlateforme([ancienne, recente]);
    expect(a.inclus.find((i) => i.titre.startsWith('Récente'))!.tronquee).toBe(false);
    expect(a.inclus.find((i) => i.titre.startsWith('Ancienne'))!.tronquee).toBe(true);
  });
});
