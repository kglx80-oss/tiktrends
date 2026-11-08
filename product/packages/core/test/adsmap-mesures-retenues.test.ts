import { describe, it, expect } from 'vitest';
import {
  retenirJournees, protocoleRetenu, adAMesurer, sourceDesEntrees, sommeRetenues, journeesReporting, importeesDans, mentionImportees,
  dansFenetre, verdictsDesMesures, sousKpisResultats, kpisResultats, PROTOCOLE_INCONNU, DEFAULT_VERDICT_CONFIG,
  type EntreeMesure, type EntreeCsvRetenable, type JourneeMetaLue, type MesuresLigne, type ProtocoleAd,
} from '../src';

/**
 * Les journées RETENUES · une seule règle pour toutes les lectures de mesures
 * (verdicts de la synchro ET de l'import, indicateurs de Résultats, Reporting
 * de l'Accueil). Les gardes lisent ce qui SORT · les chiffres sommés, les
 * entrées qui comptent, le verdict rendu.
 */

const J = (k: number) => `2026-10-${String(1 + k).padStart(2, '0')}`;
const jour = (spend: number, purchases: number, extra: Partial<MesuresLigne> = {}): MesuresLigne => ({ spend, impressions: 3000, linkClicks: 45, purchases, purchaseValue: purchases * 39, video3s: 900, clicks: 60, ...extra });
const meta = (adId: string | null, k: number, m: MesuresLigne): JourneeMetaLue => ({ adId, debut: J(k), fin: J(k), mesures: m });
const csv = (debut: string, fin: string, m: MesuresLigne, importeLe = '2026-10-10T00:00:00.000Z', proto: Partial<ProtocoleAd> = {}): EntreeCsvRetenable => ({
  debut, fin, mesures: m, nomAnnonce: 'Pub', importeLe,
  protocole: { campagne: '[ADSMAP] TEST Truefords B2', campagneId: null, ensemble: 'ES fichier', ensembleId: null, budgetJour: 45, cbo: false, ...proto },
});
const depenses = (es: readonly { mesures: MesuresLigne }[]) => Math.round(es.reduce((t, e) => t + e.mesures.spend, 0) * 100) / 100;

describe('retenirJournees · la connexion d’abord, l’export ensuite, aucun jour compté deux fois', () => {
  const r = retenirJournees(
    [meta('mixte', 0, jour(40, 3)), meta('mixte', 1, jour(40, 3)), meta(null, 0, jour(7, 0)), meta('meta', 0, jour(10, 1))],
    new Map<string, EntreeMesure[]>([
      ['csv', [csv(J(0), J(0), jour(20, 2)), csv(J(1), J(1), jour(20, 2))]],
      // Même jour que la connexion (empoisonné · ×10, aucun achat) puis un autre jour, compté.
      ['mixte', [csv(J(0), J(0), jour(400, 0)), csv(J(2), J(2), jour(40, 2))]],
    ]),
  );
  it('une ad mesurée SEULEMENT par l’export compte, avec ses chiffres', () => {
    expect(r.parAd.get('csv')?.map((e) => [e.debut, e.source, e.mesures.spend]), 'l’ad mesurée par export seulement ne compte pas').toEqual([[J(0), 'csv', 20], [J(1), 'csv', 20]]);
  });
  it('Meta ET export le même jour · compté UNE fois, avec les chiffres de la connexion', () => {
    const m = r.parAd.get('mixte')!;
    expect(m.filter((e) => e.debut === J(0)).map((e) => [e.source, e.mesures.spend]), 'le même jour est compté deux fois, ou par le fichier').toEqual([['meta', 40]]);
  });
  it('les jours que la connexion n’a pas restent comptés par l’export', () => {
    expect(r.parAd.get('mixte')!.map((e) => `${e.debut}:${e.source}`), 'l’entrée d’export d’un autre jour a été perdue').toEqual([`${J(0)}:meta`, `${J(1)}:meta`, `${J(2)}:csv`]);
    expect(r.ecartees).toBe(1);
  });
  it('une journée d’annonce suivie sans ad connue compte dans la marque (adId nul), hors des ads', () => {
    expect(r.entrees.filter((e) => e.adId === null).map((e) => e.mesures.spend)).toEqual([7]);
    expect(depenses(r.entrees), 'la somme de la marque · 40+40+7+10 (Meta) + 20+20+40 (export retenu)').toBe(177);
  });
  it('un jour Meta HORS de la lecture écarte quand même une période d’export qui le couvre', () => {
    const sans = retenirJournees([], new Map([['p', [csv(J(0), J(6), jour(300, 20))]]]));
    const avec = retenirJournees([], new Map([['p', [csv(J(0), J(6), jour(300, 20))]]]), new Map([['p', new Set([J(5)])]]));
    expect(sans.entrees.length).toBe(1);
    expect(avec.entrees, 'une période qui couvre un jour mesuré par la connexion (hors fenêtre) a été comptée').toEqual([]);
  });
  it('entre deux entrées d’export, la journée l’emporte sur la période', () => {
    const p = retenirJournees([], new Map([['p', [csv(J(0), J(6), jour(300, 20)), csv(J(3), J(3), jour(10, 1))]]]));
    expect(p.entrees.map((e) => [e.debut, e.fin])).toEqual([[J(3), J(3)]]);
  });
  it('sourceDesEntrees · ce que garde le verdict', () => {
    expect([sourceDesEntrees(r.parAd.get('mixte')!), sourceDesEntrees(r.parAd.get('csv')!), sourceDesEntrees(r.parAd.get('meta')!), sourceDesEntrees([])]).toEqual(['meta+csv', 'csv', 'meta', null]);
  });
});

describe('protocoleRetenu · la connexion d’abord, sinon la ligne d’export la plus récente', () => {
  const m: ProtocoleAd = { nomAnnonce: null, campagne: 'C Meta', campagneId: 'c1', ensemble: 'ES Meta', ensembleId: 'as-1', budgetJour: 45, cbo: true };
  it('Meta connu · il l’emporte, CBO compris', () => {
    expect(protocoleRetenu(m, [csv(J(0), J(0), jour(1, 0))])).toEqual({ protocole: m, source: 'meta' });
  });
  it('export seul · la ligne la plus RÉCENTE', () => {
    const p = protocoleRetenu(null, [csv(J(0), J(0), jour(1, 0), '2026-10-01T00:00:00Z', { ensemble: 'ancien' }), csv(J(1), J(1), jour(1, 0), '2026-10-09T00:00:00Z', { ensemble: 'récent' })]);
    expect([p.source, p.protocole.ensemble]).toEqual(['csv', 'récent']);
  });
  it('rien · protocole inconnu, source nulle', () => {
    expect(protocoleRetenu(undefined, [])).toEqual({ protocole: PROTOCOLE_INCONNU, source: null });
  });
});

describe('fenêtres · une période d’export se place sur son premier jour, comptée une fois', () => {
  const r = retenirJournees([meta(null, 3, jour(10, 1))], new Map([['p', [csv(J(5), J(11), jour(70, 7))]]]));
  it('deux fenêtres qui se suivent comptent la période UNE fois (dans celle de son premier jour)', () => {
    const a = sommeRetenues(r.entrees, J(0), J(6)), b = sommeRetenues(r.entrees, J(7), J(13));
    expect([a.depense, b.depense], 'une période d’export est comptée dans deux fenêtres, ou dans aucune').toEqual([80, 0]);
    expect(a).toEqual({ depense: 80, impressions: 6000, vues3s: 1800, achats: 8, ventes: 8 * 39, importees: 1 });
    expect(dansFenetre(r.entrees.find((e) => e.adId === 'p')!, J(6), J(6))).toBe(false);
  });
  it('Reporting · une ligne par entrée, datée de son premier jour, clics compris', () => {
    expect(journeesReporting(r.entrees, J(0), J(13))).toEqual([
      { date: J(3), depense: 10, impressions: 3000, clics: 60, achats: 1, revenu: 39, vues3s: 900 },
      { date: J(5), depense: 70, impressions: 3000, clics: 60, achats: 7, revenu: 273, vues3s: 900 },
    ]);
    expect(importeesDans(r.entrees, J(0), J(13))).toBe(1);
    expect(importeesDans(r.entrees, J(0), J(4))).toBe(0);
  });
  it('les écrans disent quand un export compte · rien sinon', () => {
    expect(mentionImportees(0)).toBeNull();
    expect(mentionImportees(3)).toBe('dont 3 entrées d’un export Ads Manager (la connexion Meta l’emporte le même jour)');
    expect(sousKpisResultats({ jours: 14, metaConnecte: false, importees: 2 })).toBe('14 derniers jours · export Ads Manager · aucun compte Meta connecté');
    expect(sousKpisResultats({ jours: 14, metaConnecte: true, importees: 0 })).toBe('14 derniers jours · Meta');
    expect(sousKpisResultats({ jours: 14, metaConnecte: true, importees: 1 })).toBe('14 derniers jours · Meta et export Ads Manager');
    const k = kpisResultats(sommeRetenues(r.entrees, J(0), J(6)), null);
    expect(k.find((x) => x.libelle === 'Dépense')).toMatchObject({ valeur: '80 €', note: 'Annonces rattachées à Adsmap · Meta et export Ads Manager' });
    expect(kpisResultats({ depense: 1, impressions: 1, vues3s: 0, achats: 0, ventes: 0 }, null).find((x) => x.libelle === 'Dépense')!.note).toBe('Annonces rattachées à Adsmap · Meta');
  });
});

describe('verdict · les journées retenues donnent le verdict des journées attendues, quel que soit l’ordre des sources', () => {
  // Lot de 2 variantes · v0 Meta pur · v1 export J0-J4 + Meta J5-J6, avec un export EMPOISONNÉ les jours Meta.
  const ctx = { config: DEFAULT_VERDICT_CONFIG, regles: { structure: 'abo_one_adset_per_ad' as const, campaignNamePattern: '[ADSMAP] TEST {brand} B{batch}', budgetVarianceTolerance: 0.2, minSpendShare: 0.35 }, marque: 'Truefords', aujourdhui: J(12) };
  const p = (id: string): ProtocoleAd => ({ nomAnnonce: id, campagne: '[ADSMAP] TEST Truefords B2', campagneId: 'c', ensemble: `ES ${id}`, ensembleId: `as-${id}`, budgetJour: 45, cbo: false });
  const ads = [{ id: 'v0', lotId: 'L', lot: 2, lanceLe: J(0) }, { id: 'v1', lotId: 'L', lot: 2, lanceLe: J(0) }];
  const metaJ = [0, 1, 2, 3, 4, 5, 6].map((k) => meta('v0', k, jour(300 / 7, 3))).concat([5, 6].map((k) => meta('v1', k, jour(300 / 7, 3))));
  const csvJ = new Map([['v1', [0, 1, 2, 3, 4].map((k) => csv(J(k), J(k), jour(300 / 7, 3))).concat([5, 6].map((k) => csv(J(k), J(k), jour(999, 0))))]]);
  const verdicts = (m: JourneeMetaLue[], c: Map<string, EntreeCsvRetenable[]>) => {
    const r = retenirJournees(m, c);
    return verdictsDesMesures(ads.map((a) => adAMesurer(a, r, p(a.id))), ctx);
  };
  it('v1 · 5 jours d’export + 2 jours Meta = 300 € et 21 achats, le même verdict que s’il n’avait que ces 7 journées', () => {
    const r = verdicts(metaJ, csvJ);
    const v1 = r.verdicts.find((v) => v.adId === 'v1')!;
    expect([Math.round(v1.metrics.spend), v1.metrics.purchases], 'v1 · les jours d’export perdus, ou le fichier compté les jours Meta').toEqual([300, 21]);
    const attendu = verdictsDesMesures(ads.map((a) => ({ ...adAMesurer(a, retenirJournees([], new Map()), p(a.id)), entrees: [0, 1, 2, 3, 4, 5, 6].map((k) => ({ debut: J(k), fin: J(k), mesures: jour(300 / 7, 3) })) })), ctx);
    expect(r.verdicts.map((v) => [v.adId, v.res.computed, v.res.comparable, Math.round(v.metrics.spend)])).toEqual(attendu.verdicts.map((v) => [v.adId, v.res.computed, v.res.comparable, Math.round(v.metrics.spend)]));
    expect(r.protocoles[0]!.check).toEqual(attendu.protocoles[0]!.check);
  });
  it('l’ordre des sources lues ne change rien (synchro qui relit, import qui relit)', () => {
    const a = verdicts(metaJ, csvJ), b = verdicts([...metaJ].reverse(), new Map([...csvJ].map(([k, v]) => [k, [...v].reverse()])));
    expect(b).toEqual(a);
  });
});
