import { describe, expect, it } from 'vitest';
import {
  compteAConclure, etapesBoucleAccueil, etatLotSpatial, finPrevueAuLancement, lotConcluAccueil, lotsConclusLus, lotsFinPrevuePassee, phraseFinPrevuePassee,
  type FaitsAdSpatial, type FaitsLotSpatial, type FaitsVerdictSpatial, type LotAccueil, type VerdictValue,
} from '../src';

/**
 * Un lot ENTIÈREMENT arbitré n'est jamais « fin prévue passée, aucun verdict à
 * arbitrer », ni compté « En diffusion » à l'Accueil · il reste `testing` en
 * base (aucun écran ne le passe `analyzed`), et depuis que le lancement écrit
 * la fin prévue (`finPrevueAuLancement`), il s'y allumerait pour toujours.
 * Un lot NON arbitré à fin prévue passée, lui, y reste. Pur · horloge fixe.
 */

const J = 86_400_000;
const LANCE = new Date('2026-10-05T08:00:00Z');
const A_J8 = { maintenant: new Date(LANCE.getTime() + 8 * J), fenetreJours: 7 };
const FIN = finPrevueAuLancement(LANCE, 7)!.toISOString();

const verdict = (calcule: VerdictValue, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, calculeLe: A_J8.maintenant.toISOString(), ...o,
});
const valide = (v: VerdictValue) => verdict(v, { statut: 'validated', retenu: v });
const ad = (id: string, v: FaitsVerdictSpatial | null): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v,
});
const faits = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatial => ({
  id, numero, but: null, statut: 'testing', lanceLe: LANCE.toISOString(), protocole: null, ads,
});

/** Les faits des lots (la lecture du rail) · et les lots datés de l'Accueil, tous lancés à T0, fin prévue écrite au lancement. */
const FAITS = [
  faits('arbitre', 3, [ad('v1', valide('winner')), ad('v2', valide('loser'))]),
  faits('sans-mesure', 2, [ad('v1', null), ad('v2', null)]),
  faits('a-conclure', 1, [ad('v1', verdict('winner')), ad('v2', verdict('loser'))]),
];
const conclus = lotsConclusLus(FAITS, A_J8);
const LOTS: LotAccueil[] = FAITS.map((l) => ({
  id: l.id, numero: l.numero, statut: 'testing', but: null, lanceLe: l.lanceLe, finPrevue: FIN, variantes: l.ads.length, vignette: null, conclu: lotConcluAccueil({ id: l.id, variantes: l.ads.length }, conclus),
}));
const COMPTE = compteAConclure(FAITS, A_J8);
const COMPTES = { tests: 6, avecHypothese: 6, aArbitrer: 2, arbitres: 2, apprentissages: 2 };

describe('l’Accueil · un lot entièrement arbitré n’est plus « en diffusion »', () => {
  it('préalable · l’état réel des lots · la règle `lotsConclusLus` est celle de l’état', () => {
    expect(FAITS.map((l) => etatLotSpatial(l, A_J8))).toEqual(['conclu', 'a_importer', 'a_conclure']);
    expect([...conclus.keys()]).toEqual(['arbitre']);
    expect(COMPTE.lots.map((l) => l.id)).toEqual(['a-conclure']);
  });

  it('fin prévue passée · le lot arbitré n’y est pas · le lot non arbitré, si', () => {
    expect(lotsFinPrevuePassee(LOTS, A_J8.maintenant, COMPTE).map((l) => l.id), 'un lot entièrement arbitré est dit « fin prévue passée »').toEqual(['sans-mesure']);
  });

  it('l’étape « En diffusion » · ni son libellé ni son nombre ne comptent le lot arbitré', () => {
    const d = etapesBoucleAccueil({ comptes: COMPTES, lots: LOTS, aConclure: COMPTE, maintenant: A_J8.maintenant, lotsOuverts: true }).find((e) => e.cle === 'diffusion')!;
    expect(d.sous, 'le libellé nomme le lot arbitré').toBe(phraseFinPrevuePassee([{ numero: 2 }]));
    expect(d.n, 'le lot arbitré est compté en diffusion').toBe(1);
  });

  it('sans la lecture des états (`conclu` faux partout) · le comportement d’avant, rien n’est caché', () => {
    const ls = LOTS.map((l) => ({ ...l, conclu: false }));
    expect(lotsFinPrevuePassee(ls, A_J8.maintenant, COMPTE).map((l) => l.id)).toEqual(['arbitre', 'sans-mesure']);
  });
});
