import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VERDICT_CONFIG, LIBELLE_GROUPE_LISTE_LOT, casMesuresLot, compteAConclure, compteAImporter, etatLotSpatial, finPrevuePassee,
  groupesListeLot, listeLotImport, lotAttendDesMesures, lotsFinPrevuePassee, mesuresDuLot, pastilleAConclure, pastilleAImporter,
  type CasMesuresLot, type EtatLotSpatial, type FaitsAdSpatial, type FaitsLotSpatialEntier, type FaitsVerdictSpatial, type VerdictValue,
} from '../src';

/**
 * La pastille « à importer » ne s'allume que quand il manque VRAIMENT quelque
 * chose. Avant (#1090) · tout lot en diffusion dont une mesure manque ou reste
 * sous le minimum du moteur comptait · or pendant la diffusion, les mesures
 * montent normalement sous le minimum (mesuré · 1,7 à 7 jours allumée sur 7
 * de diffusion, `casMesuresLot`). Après · deux cas, au noyau, sans seuil
 * nouveau · « en cours » (en diffusion, fin prévue pas passée ou aucune) et
 * « manquantes » (fin prévue passée · `finPrevuePassee`, la règle de
 * l'Accueil · ou « Mesures à importer » · fenêtre du moteur écoulée). Seul
 * « manquantes » compte. Pur · horloge INJECTÉE (`ctx.maintenant`), jamais
 * `Date.now()`. On lit le RÉSULTAT.
 */

const MAINTENANT = new Date('2026-10-27T12:00:00.000Z');
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta).toISOString();
const JOUR = 86_400_000;
const CTX = { maintenant: MAINTENANT, fenetreJours: 7 };
const ilYa = (j: number) => ms(MAINTENANT, -j * JOUR);
const SEUIL = DEFAULT_VERDICT_CONFIG;
const SEUIL_MARQUE = { ...DEFAULT_VERDICT_CONFIG, minImpressions: 15_000 };

type Lot = FaitsLotSpatialEntier & { finPrevue: string | null };
const verdict = (calcule: VerdictValue | null, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, ...o,
});
const ad = (id: string, v: FaitsVerdictSpatial | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v, ...o,
});
const lot = (id: string, numero: number, o: Partial<Lot> = {}): Lot => ({
  id, numero, but: `But ${numero}`, statut: 'testing', lanceLe: ilYa(2), finPrevue: null, protocole: null, ads: [ad('v1', null), ad('v2', null)], ...o,
});
const SOUS = verdict('inconclusive', { impressions: 900, depense: 12 });
const MI = verdict('winner', { impressions: 9000, depense: 60 }); // sous 15 000 (marque), au-dessus de 5 000 (défaut)

/** Chaque état réel, chaque raison d'attendre, la frontière de la fin prévue et celle de la fenêtre · le cas attendu au défaut. */
const CORPUS: ReadonlyArray<{ l: Lot; etat: EtatLotSpatial; cas: CasMesuresLot | null; pourquoi: string }> = [
  { l: lot('d1', 1), etat: 'diffusion', cas: 'en-cours', pourquoi: 'en diffusion, rien de mesuré, sans fin prévue · silence plutôt que bruit' },
  { l: lot('d2', 2, { ads: [ad('v1', SOUS)] }), etat: 'diffusion', cas: 'en-cours', pourquoi: 'en diffusion, sous le minimum du moteur, sans fin prévue' },
  { l: lot('d3', 3, { ads: [ad('v1', verdict('loser')), ad('v2', null)] }), etat: 'diffusion', cas: 'en-cours', pourquoi: 'en diffusion, mesures partielles, sans fin prévue' },
  { l: lot('d4', 4, { finPrevue: ms(MAINTENANT, 1) }), etat: 'diffusion', cas: 'en-cours', pourquoi: 'fin prévue dans 1 ms · pas encore passée' },
  { l: lot('d5', 5, { finPrevue: MAINTENANT.toISOString() }), etat: 'diffusion', cas: 'manquantes', pourquoi: 'fin prévue À l’instant · passée (au plus tard maintenant)' },
  { l: lot('d6', 6, { finPrevue: ilYa(1), ads: [ad('v1', SOUS)] }), etat: 'diffusion', cas: 'manquantes', pourquoi: 'fin prévue passée, sous le minimum' },
  { l: lot('d7', 7, { finPrevue: 'pas une date' }), etat: 'diffusion', cas: 'en-cours', pourquoi: 'fin prévue illisible · on ne devine pas' },
  { l: lot('d8', 8, { lanceLe: null }), etat: 'diffusion', cas: 'en-cours', pourquoi: 'sans date de lancement · la fenêtre ne s’écoule jamais' },
  { l: lot('d9', 9, { finPrevue: ilYa(1), ads: [ad('v1', verdict('loser')), ad('v2', verdict('winner'))] }), etat: 'diffusion', cas: null, pourquoi: 'fin prévue passée, chaque variante au-dessus du minimum · rien n’attend' },
  { l: lot('d10', 10, { finPrevue: ilYa(1), ads: [ad('v1', null, { plateforme: 'tiktok' })] }), etat: 'diffusion', cas: null, pourquoi: 'fin prévue passée, aucune source (TikTok)' },
  { l: lot('d11', 11, { finPrevue: ilYa(1), ads: [ad('v1', MI)] }), etat: 'diffusion', cas: null, pourquoi: 'fin prévue passée, au-dessus du minimum par défaut' },
  { l: lot('w1', 12, { lanceLe: ms(MAINTENANT, -7 * JOUR + 1) }), etat: 'diffusion', cas: 'en-cours', pourquoi: 'fenêtre du moteur écoulée dans 1 ms' },
  { l: lot('w2', 13, { lanceLe: ilYa(7) }), etat: 'a_importer', cas: 'manquantes', pourquoi: 'fenêtre du moteur écoulée à l’instant · « Mesures à importer »' },
  { l: lot('i1', 14, { lanceLe: ilYa(10) }), etat: 'a_importer', cas: 'manquantes', pourquoi: '« Mesures à importer », aucune mesure' },
  { l: lot('i2', 15, { lanceLe: ilYa(10), finPrevue: ms(MAINTENANT, 3 * JOUR), ads: [ad('v1', verdict('loser')), ad('v2', null)] }), etat: 'a_importer', cas: 'manquantes', pourquoi: '« Mesures à importer » même si la fin prévue est à venir' },
  { l: lot('i3', 16, { lanceLe: ilYa(10), ads: [ad('v1', null, { statut: 'draft' })] }), etat: 'a_importer', cas: null, pourquoi: '« Mesures à importer » sans source (brouillon)' },
  { l: lot('i4', 17, { lanceLe: ilYa(10), ads: [] }), etat: 'a_importer', cas: null, pourquoi: 'aucune variante · le silence' },
  { l: lot('c1', 18, { lanceLe: ilYa(10), finPrevue: ilYa(3), ads: [ad('v1', verdict('winner')), ad('v2', verdict('loser'))] }), etat: 'a_conclure', cas: null, pourquoi: 'à conclure · on arbitre' },
  { l: lot('c2', 19, { lanceLe: ilYa(10), finPrevue: ilYa(3), ads: [ad('v1', SOUS)] }), etat: 'non_concluant', cas: null, pourquoi: 'non concluant · on arbitre, on n’importe pas' },
  { l: lot('c3', 20, { lanceLe: ilYa(10), ads: [ad('v1', verdict('winner', { statut: 'validated', retenu: 'winner' }))] }), etat: 'conclu', cas: null, pourquoi: 'conclu' },
  { l: lot('p1', 21, { statut: 'planned', lanceLe: null, finPrevue: ilYa(1) }), etat: 'composition', cas: null, pourquoi: 'en préparation' },
  { l: lot('p2', 22, { statut: 'ready', lanceLe: null }), etat: 'pret', cas: null, pourquoi: 'prêt à lancer' },
  { l: lot('h1', 23, { statut: 'analyzed', lanceLe: null }), etat: 'importe', cas: null, pourquoi: 'historique importé' },
];
const LOTS = CORPUS.map((c) => c.l);

describe('deux cas au noyau · « en cours » et « manquantes »', () => {
  it.each(CORPUS.map((c) => [c.pourquoi, c] as const))('%s', (_, c) => {
    expect(etatLotSpatial(c.l, CTX), 'préalable · l’état du corpus').toBe(c.etat);
    expect(casMesuresLot(c.l, CTX, SEUIL), `cas du lot ${c.l.id}`).toBe(c.cas);
    // Le cas ne s'écarte jamais de la règle de #1087 · il la précise.
    expect(casMesuresLot(c.l, CTX, SEUIL) !== null, `${c.l.id} · le cas contredit \`lotAttendDesMesures\``).toBe(lotAttendDesMesures(c.l, CTX, SEUIL));
  });

  it('le corpus couvre chaque état et chaque cas', () => {
    const etats: EtatLotSpatial[] = ['composition', 'pret', 'diffusion', 'a_importer', 'a_conclure', 'non_concluant', 'conclu', 'importe'];
    expect(new Set(CORPUS.map((c) => c.etat))).toEqual(new Set(etats));
    expect(new Set(CORPUS.map((c) => c.cas))).toEqual(new Set(['en-cours', 'manquantes', null]));
  });

  it('la frontière de la fin prévue · horloge déplacée · 1 ms avant · en cours, aucune pastille · à l’instant et après · manquantes, la pastille', () => {
    const fin = new Date('2026-10-26T18:30:00.000Z');
    const l = lot('f', 7, { lanceLe: ms(fin, -3 * JOUR), finPrevue: fin.toISOString(), ads: [ad('v1', SOUS), ad('v2', null)] });
    const a = (t: Date) => ({ maintenant: t, fenetreJours: 7 });
    expect(casMesuresLot(l, a(new Date(fin.getTime() - 1)), SEUIL), '1 ms avant la fin prévue').toBe('en-cours');
    expect(pastilleAImporter(compteAImporter([l], a(new Date(fin.getTime() - 1)), SEUIL)), 'la pastille s’allume avant la fin prévue').toBeNull();
    for (const t of [fin, new Date(fin.getTime() + 1), new Date(fin.getTime() + JOUR)]) {
      expect(casMesuresLot(l, a(t), SEUIL), `à ${t.toISOString()}`).toBe('manquantes');
      expect(pastilleAImporter(compteAImporter([l], a(t), SEUIL))?.libelle, 'la pastille ne s’allume pas après la fin prévue').toBe('Lot #7 · attend ses mesures');
    }
    // La même frontière que l'Accueil (`lotsFinPrevuePassee`) · une seule règle, `finPrevuePassee`.
    const accueil = (t: Date) => lotsFinPrevuePassee([{ id: 'f', numero: 7, statut: 'testing', but: null, lanceLe: l.lanceLe, finPrevue: l.finPrevue, variantes: 2, vignette: null, conclu: false }], t, null).length > 0;
    for (const t of [new Date(fin.getTime() - 1), fin, new Date(fin.getTime() + 1)]) {
      expect(accueil(t), `l’Accueil et la pastille ne lisent pas la même fin prévue à ${t.toISOString()}`).toBe(finPrevuePassee(l.finPrevue, t));
      expect(casMesuresLot(l, a(t), SEUIL) === 'manquantes').toBe(finPrevuePassee(l.finPrevue, t));
    }
  });

  it('le minimum est celui de la MARQUE · le même lot, fin prévue passée, compte sous 15 000 impressions, pas au défaut', () => {
    const l = CORPUS.find((c) => c.l.id === 'd11')!.l;
    expect(casMesuresLot(l, CTX, SEUIL)).toBeNull();
    expect(casMesuresLot(l, CTX, SEUIL_MARQUE)).toBe('manquantes');
  });

  it('`finPrevuePassee` · sans fin prévue ni date lisible, jamais', () => {
    expect(finPrevuePassee(null, MAINTENANT)).toBe(false);
    expect(finPrevuePassee(undefined, MAINTENANT)).toBe(false);
    expect(finPrevuePassee('', MAINTENANT)).toBe(false);
    expect(finPrevuePassee('n’importe quoi', MAINTENANT)).toBe(false);
    expect(finPrevuePassee(MAINTENANT.toISOString(), MAINTENANT)).toBe(true);
    expect(finPrevuePassee(ms(MAINTENANT, 1), MAINTENANT)).toBe(false);
  });
});

describe('la pastille ne compte que « manquantes » · la liste « Lot » garde tous les lots qui attendent, regroupés', () => {
  it('le compte · exactement les lots « manquantes », dans l’ordre lu · un lot « en cours » n’allume rien', () => {
    const c = compteAImporter(LOTS, CTX, SEUIL);
    expect(c.lots.map((l) => l.id), 'la pastille compte autre chose que les mesures manquantes').toEqual(CORPUS.filter((x) => x.cas === 'manquantes').map((x) => x.l.id));
    expect(c.n).toBe(5);
    expect(pastilleAImporter(compteAImporter(CORPUS.filter((x) => x.cas === 'en-cours').map((x) => x.l), CTX, SEUIL)), 'des lots « en cours » seuls allument la pastille').toBeNull();
  });

  it('la liste · TOUS les lots qui attendent, « manquantes » d’abord puis « en cours », l’ordre lu dans chaque groupe · chaque option porte son cas', () => {
    const r = listeLotImport(LOTS, null, CTX, SEUIL)!;
    const manq = CORPUS.filter((x) => x.cas === 'manquantes').map((x) => x.l.id), cours = CORPUS.filter((x) => x.cas === 'en-cours').map((x) => x.l.id);
    expect(r.options.map((o) => o.id), 'la liste perd des lots qui attendent, ou ne les regroupe pas').toEqual([...manq, ...cours]);
    expect(r.options.map((o) => o.groupe)).toEqual([...manq.map(() => 'manquantes'), ...cours.map(() => 'en-cours')]);
    const g = groupesListeLot(r.options);
    expect(g.map((x) => [x.groupe, x.libelle, x.options.length]), 'les groupes de la liste et leur étiquette').toEqual([
      ['manquantes', 'Mesures manquantes · fin prévue passée ou fenêtre écoulée', manq.length],
      ['en-cours', 'Mesures en cours · en diffusion', cours.length],
    ]);
    // Le compte = le groupe « manquantes » de la liste, sur chaque lot pris seul et sur le corpus inversé.
    for (const ls of [...LOTS.map((l) => [l]), [...LOTS].reverse()]) {
      const liste = listeLotImport(ls, null, CTX, SEUIL);
      expect(compteAImporter(ls, CTX, SEUIL).lots.map((l) => l.id)).toEqual(liste?.options.filter((o) => o.groupe === 'manquantes').map((o) => o.id) ?? []);
    }
  });

  it('le lot de l’adresse qui n’attend rien · son groupe à lui, en dernier · sans groupe, une option reste seule', () => {
    const r = listeLotImport(LOTS, 'c1', CTX, SEUIL)!;
    expect(r.choisi).toBe('c1');
    expect(r.options.at(-1)).toEqual({ id: 'c1', libelle: 'Lot #18 · But 18 · À conclure', groupe: 'adresse' });
    expect(groupesListeLot(r.options).at(-1)!.libelle).toBe(LIBELLE_GROUPE_LISTE_LOT.adresse);
    expect(groupesListeLot([{ id: 'x', libelle: 'X' }, { id: 'y', libelle: 'Y' }]).map((g) => [g.groupe, g.libelle, g.options.length])).toEqual([[null, null, 1], [null, null, 1]]);
  });

  it('« à conclure » inchangé sur le même corpus · aucun lot dans les deux comptes', () => {
    const concl = compteAConclure(LOTS, CTX);
    expect(concl.lots.map((l) => l.id), 'le compte « à conclure » a bougé').toEqual(['c1', 'c2']);
    expect(pastilleAConclure(concl)).toEqual({ classe: 'badge', valeur: '', libelle: '2 lots à conclure' });
    const imp = new Set(compteAImporter(LOTS, CTX, SEUIL_MARQUE).lots.map((l) => l.id));
    expect(concl.lots.filter((l) => imp.has(l.id))).toEqual([]);
  });
});

describe('la section « Lot #n · ses mesures » dit le cas, par la même règle', () => {
  const dit = (id: string, seuil = SEUIL) => mesuresDuLot(CORPUS.find((c) => c.l.id === id)!.l, CTX, seuil);
  it('chaque cas, sa phrase · rien quand le lot n’attend rien', () => {
    expect(dit('d1')).toEqual({ cas: 'en-cours', texte: 'Mesures en cours · le lot #1 est en diffusion, sans fin prévue · s’il manque des mesures à la fin de la fenêtre du moteur (le 1 nov.), il passera « Mesures à importer ».' });
    expect(dit('d4')).toEqual({ cas: 'en-cours', texte: 'Mesures en cours · le lot #4 est en diffusion jusqu’au 27 oct. · sous le minimum du moteur d’ici là, c’est normal.' });
    expect(dit('d6')).toEqual({ cas: 'manquantes', texte: 'Mesures manquantes · la fin prévue du lot #6 (le 26 oct.) est passée.' });
    expect(dit('i1')).toEqual({ cas: 'manquantes', texte: 'Mesures manquantes · la fenêtre du moteur du lot #14 (7 jours) est écoulée.' });
    expect(dit('d8')).toEqual({ cas: 'en-cours', texte: 'Mesures en cours · le lot #8 est en diffusion, sans fin prévue ni date de lancement.' });
    for (const c of CORPUS) expect(mesuresDuLot(c.l, CTX, SEUIL)?.cas ?? null, c.pourquoi).toBe(c.cas);
    expect(dit('c1')).toBeNull();
    for (const c of CORPUS) expect(mesuresDuLot(c.l, CTX, SEUIL)?.texte ?? '', 'tiret cadratin').not.toMatch(/—/);
  });
});
