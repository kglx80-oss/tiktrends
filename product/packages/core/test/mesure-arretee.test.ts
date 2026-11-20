import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VERDICT_CONFIG, compteAConclure, compteAImporter, diagnosticFinPrevue, etatLotSpatial, finPrevueAccueil, finPrevueAuLancement,
  finPrevuePassee, lotAttendDesMesures, lotConcluable, mesuresDuLot, mesureArretee, phraseDiagnosticFinPrevue,
  decalerJour, jourParis,
  type FaitsAdSpatial, type FaitsLotSpatial, type FaitsVerdictSpatial, type VerdictValue,
} from '../src';

/**
 * Un lot dont la mesure s'est ARRÊTÉE n'est jamais dit conclu · le jeton Meta
 * expire à J3, les verdicts de J3 restent en base · à J8, le lot est
 * « Mesures à importer » (mesures manquantes), ni « Non concluant », ni « À
 * conclure » sur trois jours de mesures. Un lot dont les verdicts sont à jour
 * ne bouge pas. Pur · horloge fixe · on lit l'état, le compte, la phrase.
 */

type Lot = FaitsLotSpatial & { finPrevue: string | null };
const J = 86_400_000;
/** Lancé un lundi à 10 h (Paris, UTC+2 en octobre) · fenêtre de 7 jours. */
const LANCE = new Date('2026-10-05T08:00:00Z');
const jour = (n: number, heureUtc = 5) => new Date(Date.UTC(2026, 9, 5 + n, heureUtc)).toISOString();
const A_J8 = { maintenant: new Date(LANCE.getTime() + 8 * J), fenetreJours: 7 };
const SEUIL = DEFAULT_VERDICT_CONFIG;

const verdict = (calcule: VerdictValue, calculeLe: string | null | undefined, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, calculeLe, ...o,
});
const ad = (id: string, v: FaitsVerdictSpatial | null): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v,
});
const lot = (ads: FaitsAdSpatial[], o: Partial<Lot> = {}): Lot => ({
  id: 'l3', numero: 3, but: 'Preuve', statut: 'testing', lanceLe: LANCE.toISOString(), finPrevue: null, protocole: null, ads, ...o,
});

/** Les deux scénarios du constat · toutes non concluantes à J3 (était « Non concluant ») · une tranchée à J3, un coût déjà trop haut (était « À conclure »). */
const nonConcluantJ3 = (le: string | null | undefined) => lot([ad('v1', verdict('inconclusive', le)), ad('v2', verdict('inconclusive', le))]);
const trancheJ3 = (le: string | null | undefined) => lot([ad('v1', verdict('loser', le)), ad('v2', verdict('inconclusive', le))]);

describe('la mesure s’est arrêtée à J3 · à J8, mesures manquantes', () => {
  it('verdicts datés de J3 · « Mesures à importer » · jamais « Non concluant » ni « À conclure »', () => {
    expect(etatLotSpatial(nonConcluantJ3(jour(3)), A_J8), 'des verdicts de J3 présentés comme une conclusion').toBe('a_importer');
    expect(etatLotSpatial(trancheJ3(jour(3)), A_J8), 'on propose de conclure sur trois jours de mesures').toBe('a_importer');
  });

  it('le compte « à importer » le compte, la pastille parle · le compte « à conclure » ne le propose pas', () => {
    const l = { ...trancheJ3(jour(3)), id: 'l3', numero: 3 };
    expect(lotAttendDesMesures(l, A_J8, SEUIL), 'lotAttendDesMesures se tait').toBe(true);
    expect(compteAImporter([l], A_J8, SEUIL).n).toBe(1);
    expect(compteAConclure([l], A_J8).n, 'proposé à conclure').toBe(0);
    expect(lotConcluable(etatLotSpatial(l, A_J8), l.ads)).toBe(false);
    expect(mesuresDuLot(l, A_J8, SEUIL)).toEqual({
      cas: 'manquantes',
      texte: 'Mesures manquantes · lot #3 · mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2.',
    });
  });

  it('le diagnostic le dit (Accueil, import) · le geste est l’import du lot', () => {
    const l = trancheJ3(jour(3));
    const d = diagnosticFinPrevue(l.ads, SEUIL, { ...A_J8, lanceLe: l.lanceLe });
    expect(d?.cas, 'le diagnostic dit « chaque variante a ses mesures »').toBe('arretees');
    expect(phraseDiagnosticFinPrevue(3, d, SEUIL)).toBe('Lot #3 · mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2');
    const f = finPrevueAccueil({ lot: { id: 'l3', numero: 3 }, variantes: l.ads, seuil: SEUIL, acces: { refus: null }, fenetre: { ...A_J8, lanceLe: l.lanceLe } });
    expect(f.geste, '« chaque variante a ses mesures » · aucun geste').toEqual({ etat: 'ouvert', libelle: 'Importer les mesures du lot #3', href: '/adsmap/import?lot=l3' });
    // Sans la fenêtre · le diagnostic d'avant, inchangé.
    expect(diagnosticFinPrevue(l.ads, SEUIL)?.cas).toBe('autre');
  });
});

describe('ce qui ne bouge pas', () => {
  it('des verdicts à jour (le jour où la fenêtre se ferme, ou après) · l’état d’avant', () => {
    for (const le of [jour(7), jour(8)]) {
      expect(etatLotSpatial(nonConcluantJ3(le), A_J8), le).toBe('non_concluant');
      expect(etatLotSpatial(trancheJ3(le), A_J8), le).toBe('a_conclure');
    }
  });

  it('sans date de calcul lue · jamais une mesure arrêtée (on ne devine pas)', () => {
    expect(etatLotSpatial(nonConcluantJ3(undefined), A_J8)).toBe('non_concluant');
    expect(etatLotSpatial(trancheJ3(null), A_J8)).toBe('a_conclure');
  });

  it('en diffusion (J5, verdicts de J3) · toujours « En diffusion » · la fenêtre n’est pas écoulée', () => {
    expect(etatLotSpatial(trancheJ3(jour(3)), { ...A_J8, maintenant: new Date(LANCE.getTime() + 5 * J) })).toBe('diffusion');
  });

  it('un verdict ARBITRÉ à J3 · une décision, pas une mesure manquante', () => {
    const l = lot([ad('v1', verdict('loser', jour(3), { statut: 'validated', retenu: 'loser' })), ad('v2', verdict('winner', jour(8)))]);
    expect(etatLotSpatial(l, A_J8)).toBe('a_conclure');
    const tout = lot([ad('v1', verdict('loser', jour(3), { statut: 'validated', retenu: 'loser' }))]);
    expect(etatLotSpatial(tout, A_J8)).toBe('conclu');
  });
});

describe('un lot ANCIEN, jamais arbitré · le comportement au déploiement', () => {
  const aJ = (n: number) => ({ maintenant: new Date(LANCE.getTime() + n * J), fenetreJours: 7 });
  it('lancé il y a 60 jours · synchro qui tourne (dernier calcul la nuit dernière) · l’état de ses verdicts, inchangé', () => {
    const hier = new Date(LANCE.getTime() + 59 * J).toISOString();
    expect(etatLotSpatial(nonConcluantJ3(hier), aJ(60)), 'un vieux lot sain bascule « à importer »').toBe('non_concluant');
    expect(etatLotSpatial(trancheJ3(hier), aJ(60))).toBe('a_conclure');
  });

  it('lancé il y a 60 jours · aucun calcul depuis J3 · mesures manquantes (la synchro peut encore le relire)', () => {
    expect(etatLotSpatial(trancheJ3(jour(3)), aJ(60)), 'un lot de 60 jours aux mesures arrêtées à J3 est proposé à conclure').toBe('a_importer');
  });

  it('lancé il y a 120 jours ou plus · la synchro ne relit plus ses jours · la règle se tait, l’arbitrage reste possible', () => {
    expect(etatLotSpatial(trancheJ3(jour(3)), aJ(119)), '119 jours · encore relisible').toBe('a_importer');
    for (const n of [120, 200]) {
      expect(etatLotSpatial(trancheJ3(jour(3)), aJ(n)), `${n} jours · une impasse permanente « à importer »`).toBe('a_conclure');
      expect(etatLotSpatial(nonConcluantJ3(jour(3)), aJ(n))).toBe('non_concluant');
    }
  });
});

describe('le jour · celui de Paris (`jourParis`, comme l’Accueil)', () => {
  it('la veille du jour où la fenêtre se ferme, à Paris · arrêtée · le jour même à Paris (encore la veille en UTC) · à jour', () => {
    const f = { ...A_J8, lanceLe: LANCE.toISOString() };
    // La fenêtre se ferme le 12 oct. (Paris). 21 h 30 UTC le 11 = 23 h 30 Paris le 11 · 22 h 30 UTC le 11 = 0 h 30 Paris le 12.
    expect(mesureArretee({ statut: 'computed', calcule: 'inconclusive', calculeLe: '2026-10-11T21:30:00Z' }, f), '23 h 30 à Paris la veille · dit à jour').toBe(true);
    expect(mesureArretee({ statut: 'computed', calcule: 'inconclusive', calculeLe: '2026-10-11T22:30:00Z' }, f), '0 h 30 à Paris le jour où la fenêtre se ferme · dit arrêté (jour UTC, pas celui de Paris)').toBe(false);
  });
});

describe('le raccourci sans calendrier · le même résultat que le jour de Paris, demi-heure par demi-heure', () => {
  it('lancements et calculs à chaque demi-heure, autour des deux changements d’heure (29 mars, 25 oct.) · fenêtres de 1, 7 et 14 jours', () => {
    const H = 1_800_000;
    let compares = 0;
    for (const [mois, jourDebut] of [[2, 21], [9, 17]] as const) for (const fenetreJours of [1, 7, 14]) {
      for (let h = 0; h < 96; h += 1) {
        const lance = Date.UTC(2026, mois, jourDebut) + h * H;
        const lanceLe = new Date(lance).toISOString();
        const fin = decalerJour(jourParis(new Date(lance)), fenetreJours);
        for (let k = 0; k <= (fenetreJours + 3) * 48; k += 1) {
          const calculeLe = new Date(lance + k * H).toISOString();
          const attendu = jourParis(new Date(calculeLe)) < fin;
          const f = { lanceLe, fenetreJours, maintenant: new Date(lance + (fenetreJours + 4) * J) };
          expect(mesureArretee({ statut: 'computed', calcule: 'inconclusive', calculeLe }, f), `${fenetreJours} j · lancé ${lanceLe} · calculé ${calculeLe}`).toBe(attendu);
          compares++;
        }
      }
    }
    expect(compares).toBeGreaterThan(250_000);
  });
});

describe('la fin prévue posée au lancement', () => {
  it('lancement + fenêtre de la marque · passée exactement quand le lot quitte « En diffusion »', () => {
    const fin = finPrevueAuLancement(LANCE, 7)!;
    expect(fin.toISOString()).toBe('2026-10-12T08:00:00.000Z');
    const l = lot([ad('v1', null)], { finPrevue: fin.toISOString() });
    for (const ms of [-1, 0, 1]) {
      const c = { maintenant: new Date(fin.getTime() + ms), fenetreJours: 7 };
      expect(finPrevuePassee(l.finPrevue, c.maintenant), `${ms}`).toBe(etatLotSpatial(l, c) !== 'diffusion');
    }
  });

  it('sans fenêtre lisible · aucune fin prévue (rien n’est deviné)', () => {
    expect(finPrevueAuLancement(LANCE, 0)).toBeNull();
    expect(finPrevueAuLancement(LANCE, Number.NaN)).toBeNull();
    expect(finPrevueAuLancement(new Date(Number.NaN), 7)).toBeNull();
  });
});
