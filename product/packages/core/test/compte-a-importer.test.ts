import { describe, expect, it } from 'vitest';
import {
  CHEMIN_IMPORT_RESULTATS, DEFAULT_VERDICT_CONFIG, compteAConclure, compteAImporter, etatLotSpatial, lienImportLot, listeLotImport,
  pastilleAConclure, pastilleAImporter,
  type EtatLotSpatial, type FaitsAdSpatial, type FaitsLotSpatialEntier, type FaitsVerdictSpatial, type VerdictValue,
} from '../src';

type Lot = FaitsLotSpatialEntier & { finPrevue: string | null };

/**
 * Savoir de partout qu'un lot attend ses mesures · le compte « à importer »
 * (`compteAImporter`) est le nombre de lots de la liste « Lot » de l'écran
 * d'import dont les mesures MANQUENT (`listeLotImport` sans lot dans
 * l'adresse, groupe « manquantes » · règle `casMesuresLot`, aucune copie ·
 * un lot en diffusion « mesures en cours » reste dans la liste, hors du
 * compte · `pastille-bruit.test.ts`), et la pastille du rail mène à l'import
 * (`?lot=` quand un seul lot attend). DISTINCT du compte « à conclure » · les
 * deux ne comptent jamais le même lot. Pur · horloge fixe · on lit le RÉSULTAT.
 */

const MAINTENANT = new Date('2026-10-27T12:00:00Z');
const CTX = { maintenant: MAINTENANT, fenetreJours: 7 };
const ilYa = (j: number) => new Date(MAINTENANT.getTime() - j * 86_400_000).toISOString();
const SEUIL = DEFAULT_VERDICT_CONFIG;
/** Une marque qui a réglé son minimum plus haut · 15 000 impressions. */
const SEUIL_MARQUE = { ...DEFAULT_VERDICT_CONFIG, minImpressions: 15_000 };

const verdict = (calcule: VerdictValue | null, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, ...o,
});
const ad = (id: string, v: FaitsVerdictSpatial | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v, ...o,
});
const lot = (id: string, numero: number, o: Partial<Lot> = {}): Lot => ({
  id, numero, but: `But ${numero}`, statut: 'testing', lanceLe: ilYa(10), finPrevue: null, protocole: null, ads: [ad('v1', null), ad('v2', null)], ...o,
});

/**
 * Chaque état réel, et chaque raison d'être compté ou non · `attend` (compté, mesures MANQUANTES) au défaut,
 * `attendMarque` sous le minimum réglé par la marque · c, e et q sont en diffusion, sans fin prévue · « mesures
 * en cours », jamais comptés (ils l'étaient avant · le bruit mesuré).
 */
const CORPUS: ReadonlyArray<{ l: Lot; etat: EtatLotSpatial; attend: boolean; attendMarque: boolean; conclure: boolean }> = [
  { l: lot('a', 1), etat: 'a_importer', attend: true, attendMarque: true, conclure: false },
  { l: lot('b', 2, { ads: [ad('v1', verdict('loser')), ad('v2', null)] }), etat: 'a_importer', attend: true, attendMarque: true, conclure: false },
  { l: lot('c', 3, { lanceLe: ilYa(2) }), etat: 'diffusion', attend: false, attendMarque: false, conclure: false },
  { l: lot('d', 4, { lanceLe: ilYa(2), ads: [ad('v1', verdict('loser')), ad('v2', verdict('winner'))] }), etat: 'diffusion', attend: false, attendMarque: false, conclure: false },
  { l: lot('e', 5, { lanceLe: ilYa(2), ads: [ad('v1', verdict('inconclusive', { impressions: 900, depense: 12 }))] }), etat: 'diffusion', attend: false, attendMarque: false, conclure: false },
  { l: lot('q', 15, { lanceLe: ilYa(2), ads: [ad('v1', verdict('winner', { impressions: 9000, depense: 60 }))] }), etat: 'diffusion', attend: false, attendMarque: false, conclure: false },
  // r · le même que q, sa fin prévue passée · compté sous le minimum de la marque (mesures manquantes), pas au défaut.
  { l: lot('r', 16, { lanceLe: ilYa(2), finPrevue: ilYa(1), ads: [ad('v1', verdict('winner', { impressions: 9000, depense: 60 }))] }), etat: 'diffusion', attend: false, attendMarque: true, conclure: false },
  { l: lot('f', 6, { ads: [ad('v1', null, { plateforme: 'tiktok' })] }), etat: 'a_importer', attend: false, attendMarque: false, conclure: false },
  { l: lot('g', 7, { ads: [ad('v1', null, { statut: 'draft' })] }), etat: 'a_importer', attend: false, attendMarque: false, conclure: false },
  { l: lot('h', 8, { ads: [] }), etat: 'a_importer', attend: false, attendMarque: false, conclure: false },
  { l: lot('i', 9, { ads: [ad('v1', verdict('winner')), ad('v2', verdict('loser'))] }), etat: 'a_conclure', attend: false, attendMarque: false, conclure: true },
  { l: lot('j', 10, { ads: [ad('v1', verdict('inconclusive', { impressions: 900, depense: 12 }))] }), etat: 'non_concluant', attend: false, attendMarque: false, conclure: true },
  { l: lot('k', 11, { ads: [ad('v1', verdict('winner', { statut: 'validated', retenu: 'winner' }))] }), etat: 'conclu', attend: false, attendMarque: false, conclure: false },
  { l: lot('m', 12, { statut: 'planned', lanceLe: null }), etat: 'composition', attend: false, attendMarque: false, conclure: false },
  { l: lot('n', 13, { statut: 'ready', lanceLe: null }), etat: 'pret', attend: false, attendMarque: false, conclure: false },
  { l: lot('o', 14, { statut: 'analyzed', lanceLe: null }), etat: 'importe', attend: false, attendMarque: false, conclure: false },
];
const LOTS = CORPUS.map((c) => c.l);

/** Les lots de la liste « Lot » dont les mesures manquent · ses options du groupe « manquantes », sans lot dans l'adresse. */
const liste = (ls: readonly Lot[], seuil = SEUIL) => listeLotImport(ls, null, CTX, seuil)?.options.filter((o) => o.groupe === 'manquantes').map((o) => o.id) ?? [];

describe('le compte « à importer » · la règle de #1087, la liste « Lot »', () => {
  it('le corpus couvre chaque état · le compte dit exactement les lots qui attendent, dans l’ordre lu', () => {
    expect(CORPUS.map((c) => etatLotSpatial(c.l, CTX)), 'préalable · l’état du corpus').toEqual(CORPUS.map((c) => c.etat));
    const c = compteAImporter(LOTS, CTX, SEUIL);
    expect(c.lots.map((l) => l.id), 'le compte « à importer » ne compte pas les lots qui attendent leurs mesures').toEqual(CORPUS.filter((x) => x.attend).map((x) => x.l.id));
    expect(c.n).toBe(2);
    expect(c.lots[0]).toEqual({ id: 'a', numero: 1 });
    expect(compteAImporter([...LOTS].reverse(), CTX, SEUIL).lots.map((l) => l.id), 'l’ordre n’est pas celui lu').toEqual(['b', 'a']);
  });

  it('le minimum est celui de la MARQUE · le même lot compte sous 15 000 impressions, pas au défaut', () => {
    expect(compteAImporter(LOTS, CTX, SEUIL_MARQUE).lots.map((l) => l.id), 'le compte ne lit pas le minimum réglé par la marque').toEqual(CORPUS.filter((x) => x.attendMarque).map((x) => x.l.id));
  });

  it('sur CHAQUE sous-ensemble du corpus · compte = lots de la liste « Lot » dont les mesures manquent, au défaut et sous le minimum de la marque', () => {
    let vus = 0;
    for (let masque = 0; masque < 1 << LOTS.length; masque++) {
      const ls = LOTS.filter((_, i) => masque & (1 << i));
      for (const seuil of [SEUIL, SEUIL_MARQUE]) {
        const c = compteAImporter(ls, CTX, seuil);
        const l = liste(ls, seuil);
        if (c.n !== l.length || c.lots.map((x) => x.id).join() !== l.join()) {
          expect.fail(`compte « à importer » ≠ lots « mesures manquantes » de la liste « Lot » · sous-ensemble ${masque.toString(2)} · compte ${c.n} (${c.lots.map((x) => x.id).join()}), liste ${l.length} (${l.join()})`);
        }
        vus++;
      }
    }
    expect(vus).toBe(2 * (1 << LOTS.length));
  });

  it('distinct de « à conclure » · aucun lot n’est dans les deux comptes · le compte « à conclure » ne bouge pas', () => {
    const imp = new Set(compteAImporter(LOTS, CTX, SEUIL_MARQUE).lots.map((l) => l.id));
    const concl = compteAConclure(LOTS, CTX);
    expect(concl.lots.map((l) => l.id), 'préalable · le compte « à conclure » de #1080').toEqual(CORPUS.filter((c) => c.conclure).map((c) => c.l.id));
    expect(concl.lots.filter((l) => imp.has(l.id)), 'un lot est compté « à importer » ET « à conclure »').toEqual([]);
    expect(pastilleAConclure(concl), 'la pastille « à conclure » de #1080 a changé').toEqual({ classe: 'badge', valeur: '', libelle: '2 lots à conclure' });
  });
});

describe('la pastille « à importer » · un lien vers l’import', () => {
  it('aucun lot n’attend · aucune pastille', () => {
    expect(pastilleAImporter(compteAImporter(CORPUS.filter((c) => !c.attend).map((c) => c.l), CTX, SEUIL))).toBeNull();
    expect(pastilleAImporter({ n: 0, lots: [] })).toBeNull();
  });

  it('un seul lot · l’import ouvert sur LUI (`?lot=`), le lot nommé', () => {
    const p = pastilleAImporter(compteAImporter([lot('é/3?x', 4), ...CORPUS.filter((c) => !c.attend).map((c) => c.l)], CTX, SEUIL));
    expect(p, 'un seul lot attend · la pastille ne mène pas à son import').toEqual({
      valeur: '1', href: lienImportLot('é/3?x'), titre: 'À importer', libelle: 'Lot #4 · attend ses mesures', sous: 'Mesures du lot #4',
    });
    expect(p!.href).toBe(`/adsmap/import?lot=${encodeURIComponent('é/3?x')}`);
  });

  it('plusieurs lots · l’écran d’import sans lot (la liste « Lot » les montre), le nombre dit', () => {
    const p = pastilleAImporter(compteAImporter(LOTS, CTX, SEUIL));
    expect(p, 'plusieurs lots attendent · la pastille ne mène pas à l’écran d’import').toEqual({
      valeur: '2', href: CHEMIN_IMPORT_RESULTATS, titre: 'À importer', libelle: '2 lots attendent leurs mesures', sous: 'Mesures de 2 lots',
    });
    expect(CHEMIN_IMPORT_RESULTATS).toBe('/adsmap/import');
  });
});
