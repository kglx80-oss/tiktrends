import { describe, expect, it } from 'vitest';
import {
  FILTRES_LOTS, LIEN_A_CONCLURE, PARAM_FILTRE_LOTS, aFaireMaintenant, compteAConclure, dansFiltreLots, etapesBoucleAccueil, etatLotSpatial,
  filtreInitialLots, gestesListeLots, lotsFinPrevuePassee, pastilleAConclure, phraseFinPrevuePassee, selectionAConclure,
  type FaitsAdSpatial, type FaitsEtatLot, type FaitsLotSpatial, type FaitsVerdictSpatial, type LotAccueil, type VerdictValue,
} from '../src';

/**
 * UN compte « à conclure » partout (constat #1075) · la liste « À conclure »
 * (`selectionAConclure`, règle `lotConcluable`), la pastille de Résultats dans
 * le rail et l'Accueil (« À traiter », « À faire maintenant ») lisent LE même
 * compte (`compteAConclure`) · un lot « non concluant » dont des verdicts
 * attendent compte, un lot sans verdict en attente jamais, quelle que soit sa
 * fin prévue · la fin prévue passée reste dite, sous son propre libellé, hors
 * du compte. La tuile et la barre mènent à la liste filtrée, pour le membre
 * comme pour l'admin. Pur · l'horloge est fixe.
 */

const MAINTENANT = new Date('2026-10-27T12:00:00Z');
const CTX = { maintenant: MAINTENANT, fenetreJours: 7 };
const ilYa = (j: number) => new Date(MAINTENANT.getTime() - j * 86_400_000).toISOString();

const verdict = (calcule: VerdictValue | null, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 100, impressions: 6000, achats: 3, cpa: 30, ...o,
});
const valide = (v: VerdictValue) => verdict(v, { statut: 'validated', retenu: v });
const ad = (id: string, v: FaitsVerdictSpatial | null): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v,
});
const lot = (id: string, numero: number, o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({
  id, numero, but: null, statut: 'testing', lanceLe: ilYa(10), protocole: null, ads: [ad('v1', verdict('winner')), ad('v2', verdict('loser'))], ...o,
});

/** Un lot par état réel · seuls `conclure` (tranché en attente) et `muet` (non concluant, des verdicts attendent) se concluent. */
const CORPUS: FaitsLotSpatial[] = [
  lot('conclure', 9),
  lot('muet', 8, { ads: [ad('v1', verdict('inconclusive')), ad('v2', verdict('insufficient_delivery'))] }),
  lot('diffusion', 7, { lanceLe: ilYa(2) }),
  lot('importer', 6, { ads: [ad('v1', verdict('winner')), ad('v2', null)] }),
  lot('conclu', 5, { ads: [ad('v1', valide('winner')), ad('v2', valide('loser'))] }),
  lot('compose', 4, { statut: 'planned', lanceLe: null }),
  lot('pret', 3, { statut: 'ready', lanceLe: null }),
  lot('historique', 2, { statut: 'analyzed', lanceLe: null }),
  lot('sans-variante', 1, { ads: [] }),
];

describe('le compte « à conclure » · une règle, la liste', () => {
  it('le compte est la liste · un « non concluant » dont des verdicts attendent compte · rien d’autre ne compte', () => {
    expect(CORPUS.map((l) => etatLotSpatial(l, CTX)), 'préalable · le corpus couvre chaque état').toEqual(
      ['a_conclure', 'non_concluant', 'diffusion', 'a_importer', 'conclu', 'composition', 'pret', 'importe', 'a_importer'],
    );
    const c = compteAConclure(CORPUS, CTX);
    expect(c, 'le compte « à conclure » n’est pas celui de la liste').toEqual({ n: 2, lots: [{ id: 'conclure', numero: 9 }, { id: 'muet', numero: 8 }] });
    expect(c.lots.map((l) => l.id), 'le compte et la liste « À conclure » divergent').toEqual(selectionAConclure(CORPUS, CTX).map((l) => l.id));
  });

  it('le filtre « À conclure » de l’admin rend le même nombre, sur chaque sous-ensemble du corpus', () => {
    for (let masque = 0; masque < 1 << CORPUS.length; masque++) {
      const ls = CORPUS.filter((_, i) => masque & (1 << i));
      const admin = ls.filter((l) => dansFiltreLots(etatLotSpatial(l, CTX), 'conclure')).length;
      expect(compteAConclure(ls, CTX).n, `le filtre de l’admin et le compte divergent · ${ls.map((l) => l.id).join(', ')}`).toBe(admin);
    }
  });

  it('la lecture légère suffit · réduit à ce que l’état lit (statut, lancement, verdicts), le compte ne bouge pas', () => {
    const leger = CORPUS.map((l): FaitsEtatLot & { id: string; numero: number } => ({
      id: l.id, numero: l.numero, statut: l.statut, lanceLe: l.lanceLe, ads: l.ads.map((a) => ({ verdict: a.verdict ? { statut: a.verdict.statut, calcule: a.verdict.calcule } : null })),
    }));
    expect(compteAConclure(leger, CTX), 'la lecture légère ne compte pas comme la liste').toEqual(compteAConclure(CORPUS, CTX));
  });

  it('la pastille · absente à zéro, le nombre dans son libellé', () => {
    expect(pastilleAConclure({ n: 0, lots: [] })).toBeNull();
    expect(pastilleAConclure(compteAConclure([CORPUS[1]!], CTX)), 'un lot « non concluant » dont des verdicts attendent n’allume pas la pastille').toEqual({ classe: 'badge', valeur: '', libelle: 'Un lot à conclure' });
    expect(pastilleAConclure(compteAConclure(CORPUS, CTX))).toEqual({ classe: 'badge', valeur: '', libelle: '2 lots à conclure' });
    expect(pastilleAConclure(compteAConclure(CORPUS.slice(2), CTX)), 'un lot sans verdict en attente allume la pastille').toBeNull();
  });
});

describe('le lien · la liste filtrée « À conclure », pour l’admin comme pour le membre', () => {
  const lu = (href: string) => new URL(href, 'https://x.test').searchParams.get(PARAM_FILTRE_LOTS);
  it('`?filtre=conclure` ouvre la liste sur « À conclure » · un filtre que la portée ne montre pas est ignoré', () => {
    expect(LIEN_A_CONCLURE).toBe('/adsmap/lots?filtre=conclure');
    const admin = gestesListeLots('complete', { admin: true });
    const membre = gestesListeLots('a-conclure', { admin: false });
    expect(filtreInitialLots(admin, lu(LIEN_A_CONCLURE)), 'le lien n’ouvre pas « À conclure » chez l’admin').toBe('conclure');
    expect(filtreInitialLots(membre, lu(LIEN_A_CONCLURE))).toBe('conclure');
    expect(filtreInitialLots(admin, undefined), 'sans filtre, l’admin ne part plus de « Tous »').toBe('tous');
    expect(filtreInitialLots(admin, ['importer', 'tous'])).toBe('importer');
    expect(filtreInitialLots(membre, 'tous'), 'le membre ouvre un filtre que sa portée ne montre pas').toBe('conclure');
    expect(filtreInitialLots(admin, 'n’importe quoi')).toBe('tous');
    expect(FILTRES_LOTS.map((f) => filtreInitialLots(admin, f.cle))).toEqual(FILTRES_LOTS.map((f) => f.cle));
  });
});

describe('l’Accueil lit le même compte · « À traiter », « À faire maintenant »', () => {
  const NOW = MAINTENANT;
  const accueil = (id: string, numero: number, o: Partial<LotAccueil> = {}): LotAccueil => ({ id, numero, statut: 'testing', but: null, lanceLe: ilYa(10), finPrevue: null, variantes: 2, vignette: null, ...o });
  // Les lots datés de l'Accueil · la fin prévue est passée pour `conclure` ET pour `importer` (aucun verdict à arbitrer).
  const LOTS = [
    accueil('conclure', 9, { finPrevue: ilYa(1), vignette: 'https://x.test/a.jpg' }), accueil('muet', 8), accueil('diffusion', 7, { lanceLe: ilYa(2), finPrevue: ilYa(-5) }),
    accueil('importer', 6, { finPrevue: ilYa(3) }), accueil('conclu', 5, { finPrevue: ilYa(4) }),
  ];
  const comptes = { tests: 9, avecHypothese: 9, aArbitrer: 5, arbitres: 2, apprentissages: 1 };
  const c = compteAConclure(CORPUS, CTX);

  it('« À traiter » · son nombre est le compte de la liste, pour le membre comme pour l’admin · la tuile mène à la liste filtrée', () => {
    for (const lotsOuverts of [true, false]) {
      const t = etapesBoucleAccueil({ comptes, lots: LOTS, aConclure: c, maintenant: NOW, lotsOuverts }).find((e) => e.cle === 'atraiter')!;
      expect(t.n, `« À traiter » ne compte pas les lots de la liste · ${lotsOuverts ? 'admin' : 'membre'}`).toBe(c.n);
      expect(t.href, `la tuile ne mène pas à la liste filtrée · ${lotsOuverts ? 'admin' : 'membre'}`).toBe(LIEN_A_CONCLURE);
      expect(t.sous).toBe('2 lots à conclure · 5 verdicts à arbitrer');
      expect(t.action).toBe('Conclure les 2 lots');
      expect(t.vignettes.map((v) => v.url)).toEqual(['https://x.test/a.jpg']);
    }
  });

  it('une fin prévue passée sans verdict à arbitrer · dite sous « En diffusion », son libellé à elle, jamais comptée', () => {
    const e = etapesBoucleAccueil({ comptes, lots: LOTS, aConclure: c, maintenant: NOW, lotsOuverts: true });
    expect(lotsFinPrevuePassee(LOTS, NOW, c).map((l) => l.id)).toEqual(['conclu', 'importer']);
    const d = e.find((x) => x.cle === 'diffusion')!;
    expect(d.sous, 'la fin prévue passée n’est pas dite, ou pas sous son libellé').toBe('Lots #5 et #6 · fin prévue passée, aucun verdict à arbitrer');
    expect(d.progression, 'une progression « rien à faire d’ici là » sous une fin passée').toBeNull();
    expect(d.n, 'un lot compté « à conclure » reste compté en diffusion').toBe(3);
    expect(phraseFinPrevuePassee([{ numero: 3 }])).toBe('Lot #3 · fin prévue passée, aucun verdict à arbitrer');
    expect(e.map((x) => x.sous).join(' | '), 'la fin prévue passée est appelée « à conclure »').not.toMatch(/#5 à conclure|#6 à conclure/);
  });

  it('« À faire maintenant » · le compte de la liste, la liste filtrée · rien à conclure, rien d’annoncé', () => {
    expect(aFaireMaintenant({ aConclure: c, lots: LOTS, aArbitrer: 5, iteration: null, etape: null, maintenant: NOW }))
      .toEqual({ titre: 'À faire maintenant : conclure 2 lots', detail: 'Lots #9 et #8 · des verdicts attendent ton arbitrage', action: 'Voir les lots à conclure', href: LIEN_A_CONCLURE });
    const un = compteAConclure([CORPUS[1]!], CTX);
    expect(aFaireMaintenant({ aConclure: un, lots: LOTS, aArbitrer: null, iteration: null, etape: null, maintenant: NOW })).toMatchObject({ titre: 'À faire maintenant : conclure le lot #8', href: LIEN_A_CONCLURE });
    const zero = compteAConclure(CORPUS.slice(2), CTX);
    expect(aFaireMaintenant({ aConclure: zero, lots: LOTS, aArbitrer: null, iteration: null, etape: null, maintenant: NOW }), 'une fin prévue passée appelle « conclure »').toBeNull();
    expect(etapesBoucleAccueil({ comptes: { ...comptes, aArbitrer: 0 }, lots: LOTS, aConclure: zero, maintenant: NOW, lotsOuverts: true }).find((e) => e.cle === 'atraiter'))
      .toMatchObject({ n: 0, sous: 'Rien en attente', alerte: false, action: null });
  });
});
