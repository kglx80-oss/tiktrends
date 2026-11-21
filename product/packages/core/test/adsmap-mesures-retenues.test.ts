import { describe, it, expect } from 'vitest';
import {
  retenirJournees, protocoleRetenu, protocoleMetaRetenu, cboRetenu, cboEtabliParExport, cboParCampagne, memeCampagne, adAMesurer, sourceDesEntrees, sommeRetenues, journeesReporting, importeesDans, mentionImportees,
  dansFenetre, verdictsDesMesures, sousKpisResultats, kpisResultats, PROTOCOLE_INCONNU, DEFAULT_VERDICT_CONFIG, preuveAEcrire,
  cleVerrouImportMesures, REFUS_IMPORT_MESURES_EN_COURS,
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
const csv = (debut: string, fin: string, m: MesuresLigne, importeLe = '2026-10-10T00:00:00.000Z', proto: Partial<EntreeCsvRetenable['protocole']> = {}): EntreeCsvRetenable => ({
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
  it('connexion au CBO INCONNU · la dernière ligne d’export DE SA CAMPAGNE l’établit · CBO oui ⇒ oui, budget d’ensemble ⇒ non, ligne muette ⇒ inconnu', () => {
    const inc: ProtocoleAd = { ...m, cbo: null };
    // Ligne de la campagne de l'ad · même identifiant (c1).
    const L = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe?: string, k = 0) => csv(J(k), J(k), jour(1, 0), importeLe, { campagneId: 'c1', ...o });
    expect(protocoleRetenu(inc, [L({ budgetJour: 50 })]), 'un export qui dit ABO est ignoré quand Meta ne sait pas').toEqual({ protocole: { ...inc, cbo: false }, source: 'meta' });
    expect(protocoleRetenu(inc, [L({ budgetJour: null, cbo: true })]).protocole.cbo).toBe(true);
    expect(protocoleRetenu(inc, [L({ budgetJour: null, cbo: false })]).protocole.cbo, 'une ligne sans budget prouve l’ABO').toBeNull();
    expect(protocoleRetenu(inc, [L({ budgetJour: 50 }, '2026-10-01T00:00:00Z'), L({ budgetJour: null, cbo: true }, '2026-10-09T00:00:00Z', 1)]).protocole.cbo, 'pas la DERNIÈRE ligne').toBe(true);
    expect([cboEtabliParExport({ cbo: true, budgetJour: null }), cboEtabliParExport({ cbo: false, budgetJour: 20 }), cboEtabliParExport({ cbo: false, budgetJour: null })]).toEqual([true, false, null]);
  });
  it('le CBO l’emporte dès qu’une source le dit · un « non » de Meta (périmé) ne cache pas l’export qui dit CBO · un CBO de Meta ne cède pas à un export ABO', () => {
    const L = (o: Partial<EntreeCsvRetenable['protocole']>) => csv(J(0), J(0), jour(1, 0), undefined, { campagneId: 'c1', ...o });
    expect(protocoleRetenu({ ...m, cbo: false }, [L({ budgetJour: null, cbo: true })]).protocole.cbo, 'un « non » de Meta cache l’export qui dit CBO').toBe(true);
    expect(protocoleRetenu({ ...m, cbo: false }, [L({ budgetJour: 50 })]).protocole.cbo).toBe(false);
    expect(protocoleRetenu(m, [L({ budgetJour: 50 })]).protocole.cbo, 'un CBO lu chez Meta a cédé à un export ABO').toBe(true);
  });
  it('la plus récente ligne de la campagne QUI ÉTABLIT décide · une ligne muette (sans budget, ou budget à vie) récente ne l’efface pas', () => {
    const L = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe: string, k: number) => csv(J(k), J(k), jour(1, 0), importeLe, { campagneId: 'c1', ...o });
    const cboAncien = L({ budgetJour: null, cbo: true }, '2026-10-01T00:00:00Z', 0);
    const muetteRecente = L({ budgetJour: null, cbo: false }, '2026-10-09T00:00:00Z', 1);
    expect(protocoleRetenu({ ...m, cbo: false }, [cboAncien, muetteRecente]).protocole.cbo, 'un export muet récent efface le CBO établi par un export plus ancien').toBe(true);
    expect(protocoleRetenu({ ...m, cbo: null }, [L({ budgetJour: 50 }, '2026-10-01T00:00:00Z', 0), muetteRecente]).protocole.cbo, 'un export muet récent efface l’ABO établi par un export plus ancien').toBe(false);
  });
  it('un export CORRECTIF plus récent l’emporte · ligne CBO ancienne, ligne ABO récente, Meta ne sait pas ⇒ ABO', () => {
    const L = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe: string, k: number) => csv(J(k), J(k), jour(1, 0), importeLe, { campagneId: 'c1', ...o });
    expect(protocoleRetenu({ ...m, cbo: null }, [L({ budgetJour: null, cbo: true }, '2026-10-01T00:00:00Z', 0), L({ budgetJour: 50 }, '2026-10-09T00:00:00Z', 1)]).protocole.cbo, 'une ligne quelconque qui dit CBO l’emporte sur l’export correctif plus récent').toBe(false);
  });
  it('une ligne rattachée par l’IDENTIFIANT Meta de l’annonce est de sa campagne, même sans colonne campagne', () => {
    const sansCampagne = { ...csv(J(0), J(0), jour(1, 0), undefined, { campagne: null, campagneId: null, budgetJour: 50 }), metaAdId: '120200000000000301' };
    expect(protocoleRetenu({ ...m, cbo: null }, [sansCampagne], { idMeta: '120200000000000301' }).protocole.cbo, 'un export rattaché par l’Ad ID, sans colonne campagne, n’établit rien').toBe(false);
    expect(protocoleRetenu({ ...m, cbo: null }, [sansCampagne], { idMeta: '120200000000000999' }).protocole.cbo, 'l’identifiant d’une AUTRE annonce vaut la campagne').toBeNull();
    expect(protocoleRetenu({ ...m, cbo: null }, [sansCampagne]).protocole.cbo).toBeNull();
  });
  it('deux noms de campagne sans lettre ni chiffre latins (emoji, cyrillique…) ne se ressemblent pas pour autant', () => {
    expect(memeCampagne({ campagneId: null, campagne: '🔥🔥' }, { campagneId: null, campagne: 'Кампания' }), 'deux noms vides une fois normalisés passent pour la même campagne').toBe(false);
    expect(memeCampagne({ campagneId: null, campagne: '🔥 B1' }, { campagneId: null, campagne: 'b1' })).toBe(true);
  });
  it('une ligne d’export d’une AUTRE campagne n’établit rien · identifiants, sinon noms normalisés', () => {
    const inc: ProtocoleAd = { ...m, cbo: null };
    expect(protocoleRetenu(inc, [csv(J(0), J(0), jour(1, 0), undefined, { campagneId: 'c9', budgetJour: 50 })]).protocole.cbo, 'un export d’une autre campagne (identifiant) établit le CBO de celle-ci').toBeNull();
    expect(protocoleRetenu(inc, [csv(J(0), J(0), jour(1, 0), undefined, { campagneId: null, campagne: 'Autre campagne', budgetJour: 50 })]).protocole.cbo, 'un export d’une autre campagne (nom) établit le CBO de celle-ci').toBeNull();
    expect(protocoleRetenu(inc, [csv(J(0), J(0), jour(1, 0), undefined, { campagneId: null, campagne: '  c   META ', budgetJour: 50 })]).protocole.cbo, 'même campagne au nom près (casse, espaces)').toBe(false);
    // La plus récente de SA campagne, pas la plus récente tout court.
    expect(protocoleRetenu(inc, [csv(J(0), J(0), jour(1, 0), '2026-10-01T00:00:00Z', { campagneId: 'c1', budgetJour: 50 }), csv(J(1), J(1), jour(1, 0), '2026-10-09T00:00:00Z', { campagneId: 'c9', cbo: true, budgetJour: null })]).protocole.cbo).toBe(false);
    expect([memeCampagne({ campagneId: 'c1', campagne: 'X' }, { campagneId: 'c1', campagne: 'Y' }), memeCampagne({ campagneId: 'c1', campagne: 'X' }, { campagneId: 'c2', campagne: 'X' }), memeCampagne({ campagneId: null, campagne: null }, { campagneId: null, campagne: null })]).toEqual([true, false, false]);
  });
  it('export SEUL (ad jamais synchronisée) · même règle · la plus récente ligne DE SA CAMPAGNE qui établit · ligne muette ⇒ inconnu, jamais « non »', () => {
    const L = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe: string, k: number) => csv(J(k), J(k), jour(1, 0), importeLe, { campagneId: 'c1', ...o });
    const muette = L({ budgetJour: null, cbo: false }, '2026-10-09T00:00:00Z', 1);
    expect(protocoleRetenu(null, [muette]), 'export sans colonne budget · le CBO vaut « non » (ABO supposé)').toEqual({ protocole: { ...muette.protocole, nomAnnonce: 'Pub', cbo: null }, source: 'csv' });
    expect(protocoleRetenu(null, [L({ budgetJour: 50 }, '2026-10-09T00:00:00Z', 1)]).protocole, 'un budget d’ensemble ne prouve plus l’ABO').toMatchObject({ cbo: false, budgetJour: 50 });
    expect(protocoleRetenu(null, [L({ budgetJour: null, cbo: true }, '2026-10-09T00:00:00Z', 1)]).protocole.cbo, '« Using campaign budget » ne prouve plus le CBO').toBe(true);
    // Une muette récente n'efface pas ce qu'une ligne plus ancienne de la campagne a établi · le reste du protocole reste celui de la plus récente.
    const p = protocoleRetenu(null, [L({ budgetJour: null, cbo: true, ensemble: 'ancien' }, '2026-10-01T00:00:00Z', 0), { ...muette, protocole: { ...muette.protocole, ensemble: 'récent' } }]).protocole;
    expect([p.cbo, p.ensemble], 'une ligne muette récente efface le CBO établi par une ligne plus ancienne').toEqual([true, 'récent']);
    expect(protocoleRetenu(null, [L({ budgetJour: 50 }, '2026-10-01T00:00:00Z', 0), muette]).protocole.cbo).toBe(false);
    // Une ligne d'une AUTRE campagne (rattachée par le nom) n'établit rien pour la campagne de la plus récente.
    expect(protocoleRetenu(null, [L({ campagneId: 'c9', budgetJour: 50 }, '2026-10-01T00:00:00Z', 0), muette]).protocole.cbo, 'une ligne d’une autre campagne établit le CBO de celle-ci').toBeNull();
    // Le même identifiant Meta d'annonce · même campagne, même sans colonne campagne.
    const sans = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe: string, k: number) => ({ ...csv(J(k), J(k), jour(1, 0), importeLe, { campagne: null, campagneId: null, ...o }), metaAdId: '120200000000000301' });
    expect(protocoleRetenu(null, [sans({ budgetJour: 50 }, '2026-10-01T00:00:00Z', 0), sans({ budgetJour: null }, '2026-10-09T00:00:00Z', 1)]).protocole.cbo, 'deux lignes de la même annonce (Ad ID), sans colonne campagne · l’ABO établi est ignoré').toBe(false);
  });
  it('export SEUL, ad rattachée par le nom dans DEUX campagnes · un CBO lu dans l’une l’emporte · l’ABO ne vient que de la campagne de la plus récente', () => {
    const L = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe: string, k: number) => csv(J(k), J(k), jour(1, 0), importeLe, o);
    const cboX = L({ campagneId: 'cx', budgetJour: null, cbo: true }, '2026-10-01T00:00:00Z', 0);
    const aboY = L({ campagneId: 'cy', budgetJour: 50 }, '2026-10-09T00:00:00Z', 4);
    expect(protocoleRetenu(null, [cboX, aboY]).protocole.cbo, 'une partie de la dépense est sous CBO (campagne X) · l’ABO de Y la rend comparable').toBe(true);
    expect(protocoleRetenu(null, [aboY, L({ campagneId: 'cy', budgetJour: null, cbo: true }, '2026-10-01T00:00:00Z', 0)]).protocole.cbo, 'export correctif de la MÊME campagne · l’ABO plus récent l’emporte').toBe(false);
    expect(protocoleRetenu(null, [L({ campagneId: 'cx', budgetJour: 50 }, '2026-10-01T00:00:00Z', 0), L({ campagneId: 'cy', budgetJour: null }, '2026-10-09T00:00:00Z', 4)]).protocole.cbo, 'l’ABO d’une AUTRE campagne que la plus récente établit l’ABO').toBeNull();
    expect(protocoleRetenu(null, [L({ campagneId: 'cy', budgetJour: null }, '2026-10-01T00:00:00Z', 0), L({ campagneId: 'cx', budgetJour: 50 }, '2026-10-09T00:00:00Z', 4)]).protocole.cbo, 'une campagne de l’ad n’a que des lignes muettes (sa dépense compte) · l’ABO de la plus récente rend le lot comparable').toBeNull();
    expect(protocoleRetenu(null, [L({ campagneId: 'cy', budgetJour: 40 }, '2026-10-01T00:00:00Z', 0), L({ campagneId: 'cx', budgetJour: 50 }, '2026-10-09T00:00:00Z', 4)]).protocole.cbo, 'chaque campagne dit ABO · l’ABO est établi').toBe(false);
    // Une ligne CBO plus ancienne de X, corrigée en ABO par X plus tard · X ne dit plus CBO.
    expect(protocoleRetenu(null, [L({ campagneId: 'cx', budgetJour: null, cbo: true }, '2026-10-01T00:00:00Z', 0), L({ campagneId: 'cx', budgetJour: 50 }, '2026-10-05T00:00:00Z', 1), aboY]).protocole.cbo).toBe(false);
  });
  it('export SEUL · une ad sans campagne ni identifiant · sa seule ligne établit pour elle · deux lignes sans rien à comparer ne sont pas de la même campagne', () => {
    const nu = (o: Partial<EntreeCsvRetenable['protocole']>, importeLe: string, k: number) => csv(J(k), J(k), jour(1, 0), importeLe, { campagne: null, campagneId: null, ...o });
    expect(protocoleRetenu(null, [nu({ budgetJour: 50 }, '2026-10-09T00:00:00Z', 1)]).protocole.cbo, 'la ligne la plus récente n’établit pas pour elle-même').toBe(false);
    expect(protocoleRetenu(null, [nu({ budgetJour: 50 }, '2026-10-01T00:00:00Z', 0), nu({ budgetJour: null }, '2026-10-09T00:00:00Z', 1)]).protocole.cbo, 'deux lignes sans campagne ni identifiant (NULL et NULL) passent pour la même campagne').toBeNull();
  });
  it('rien · protocole inconnu, source nulle · CBO inconnu (`null`)', () => {
    expect(protocoleRetenu(undefined, [])).toEqual({ protocole: PROTOCOLE_INCONNU, source: null });
    expect(PROTOCOLE_INCONNU.cbo).toBeNull();
  });
});

describe('protocoleMetaRetenu · un ensemble NON LU ne fait rien oublier (budget, CBO)', () => {
  const annonce = { nomAnnonce: 'Pub v1', campagne: 'C du jour', campagneId: 'c2', ensemble: 'ES du jour', ensembleId: 'as-2' };
  const stocke: ProtocoleAd = { nomAnnonce: null, campagne: 'C', campagneId: 'c1', ensemble: 'ES', ensembleId: 'as-1', budgetJour: 45, cbo: false };
  it('ensemble lu · ce qui vient d’être lu l’emporte, budget nul et CBO compris', () => {
    expect(protocoleMetaRetenu({ annonce, ensemble: { budgetJour: null, cbo: true } }, stocke, { instance: false, relais: false }))
      .toEqual({ ...annonce, budgetJour: null, cbo: true });
  });
  it('ensemble NON lu · l’annonce du jour, le budget et le CBO de l’instance · jamais « sans CBO, budget inconnu »', () => {
    // Le budget stocké est TOUJOURS celui de l'ensemble du jour · l'instance est réécrite avant le recalcul, et `ingest`
    // efface budget et statut quand l'ad change d'ensemble (garde en base · `synchro-ensembles-echec-db.test.ts`). Une
    // comparaison d'ensembles ici ne s'exécuterait jamais en production · elle a été retirée, pas dupliquée.
    expect(protocoleMetaRetenu({ annonce: { ...annonce, ensembleId: 'as-1' }, ensemble: null }, stocke, { instance: true, relais: false }), 'ensemble non lu · le CBO ou le budget connus ont été oubliés')
      .toEqual({ ...annonce, ensembleId: 'as-1', budgetJour: 45, cbo: true });
  });
  it('ensemble NON lu, instance d’avant 0073 (CBO NULL) · le relais du lot', () => {
    expect(protocoleMetaRetenu({ annonce, ensemble: null }, stocke, { instance: null, relais: true })?.cbo).toBe(true);
  });
  it('ensemble NON lu, rien de stocké · budget inconnu, CBO du relais', () => {
    expect(protocoleMetaRetenu({ annonce, ensemble: null }, undefined, { instance: undefined, relais: true })).toEqual({ ...annonce, budgetJour: null, cbo: true });
  });
  it('ensemble NON lu, ni instance ni relais · CBO INCONNU (`null`), jamais `false`', () => {
    expect(protocoleMetaRetenu({ annonce, ensemble: null }, undefined, { instance: undefined, relais: false })?.cbo, 'rien de connu · le CBO vaut « non » au lieu d’inconnu').toBeNull();
    const sansBudget = { ...stocke, budgetJour: null };
    expect(protocoleMetaRetenu({ annonce, ensemble: null }, sansBudget, { instance: null, relais: false })?.cbo, 'instance d’avant 0073 sans relais ni budget · le CBO vaut « non » au lieu d’inconnu').toBeNull();
    expect(protocoleMetaRetenu(undefined, sansBudget, { instance: null, relais: false })?.cbo).toBeNull();
  });
  it('instance d’avant 0073 · CBO NULL mais budget d’ensemble connu (45 €) · il prouve l’ABO, comme la colonne budget d’un export', () => {
    expect(protocoleMetaRetenu({ annonce, ensemble: null }, stocke, { instance: null, relais: false })?.cbo, 'un budget d’ensemble connu ne prouve pas l’ABO').toBe(false);
    expect(protocoleMetaRetenu(undefined, stocke, { instance: null, relais: false })?.cbo).toBe(false);
    expect(protocoleMetaRetenu(undefined, stocke, { instance: null, relais: true })?.cbo, 'le relais (CBO lu) cède à un budget').toBe(true);
  });
  it('cboRetenu · instance d’abord (lue, vraie ou fausse), puis le relais (CBO seulement), sinon inconnu', () => {
    expect([cboRetenu(true, false), cboRetenu(false, true), cboRetenu(null, true), cboRetenu(null, false), cboRetenu(undefined, false)]).toEqual([true, false, true, null, null]);
    expect([cboRetenu(null, false, 50), cboRetenu(null, true, 50), cboRetenu(true, false, 50), cboRetenu(null, false, null)]).toEqual([false, true, true, null]);
  });
  it('rien de lu ce passage (import) · le protocole stocké, CBO de l’instance · rien du tout · aucun protocole Meta', () => {
    expect(protocoleMetaRetenu(undefined, stocke, { instance: true, relais: false })).toEqual({ ...stocke, cbo: true });
    expect(protocoleMetaRetenu(undefined, undefined, { instance: undefined, relais: false })).toBeUndefined();
  });
});

describe('cboParCampagne · le CBO est une propriété de la campagne', () => {
  const p = (campagneId: string | null, cbo: boolean | null, budgetJour: number | null = 20) => ({ protocole: { campagneId, cbo, budgetJour } });
  it('une ad qui l’établit le dit pour sa campagne · désaccord ⇒ CBO · sans identifiant, rien', () => {
    const r = cboParCampagne([p('c1', false), p('c1', null), p('c2', false), p('c2', true), p('c4', true), p('c4', false), p(null, true), p('c3', null)]);
    expect(Object.fromEntries(r), 'désaccord dans la campagne · l’ordre de lecture décide au lieu du CBO').toEqual({ c1: false, c2: true, c4: true });
  });
  it('« non » sans budget d’ensemble (ligne d’export muette) ne parle pas pour les autres', () => {
    expect(cboParCampagne([p('c1', false, null)]).has('c1')).toBe(false);
  });
  it('dans le lot · une ad au CBO inconnu prend celui de sa campagne · le lot se compare (ABO) ou reste relatif (CBO)', () => {
    const ad = (id: string, campagneId: string, cbo: boolean | null) => ({ id, lotId: 'L', lotNumero: 1, lanceLe: J(0), entrees: [0, 1, 2, 3, 4, 5, 6].map((k) => ({ debut: J(k), fin: J(k), mesures: jour(50, 5, { impressions: 5000 }) })),
      protocole: { nomAnnonce: id, campagne: 'C', campagneId, ensemble: `ES ${id}`, ensembleId: `as-${id}`, budgetJour: 50, cbo } });
    const ctx = { config: DEFAULT_VERDICT_CONFIG, regles: { structure: 'abo_one_adset_per_ad' as const, campaignNamePattern: '[ADSMAP] TEST {brand} B{batch}', budgetVarianceTolerance: 0.2, minSpendShare: 0.35 }, marque: 'M', aujourdhui: J(8) };
    const codes = (r: ReturnType<typeof verdictsDesMesures>) => r.protocoles[0]!.check.violations.map((v) => v.code);
    expect(codes(verdictsDesMesures([ad('a', 'c1', false), ad('b', 'c1', null)], ctx)), 'la campagne est connue (ABO) · l’ad terminée reste « inconnue »').toEqual(['campaign_name']);
    expect(codes(verdictsDesMesures([ad('a', 'c1', true), ad('b', 'c1', null)], ctx))).toEqual(['campaign_name', 'cbo']);
    expect(codes(verdictsDesMesures([ad('a', 'c1', false), ad('b', 'c2', null)], ctx))).toContain('cbo_inconnu');
    // Changé à la seconde relecture · les prêteurs se limitent au MÊME lot. Une campagne lue en ABO sur un lot clos a pu
    // passer en CBO depuis · emprunter à toute la marque (repères), sans âge, rendait comparable à tort un autre lot.
    expect(codes(verdictsDesMesures([ad('b', 'c1', null)], { ...ctx, reperes: [ad('a', 'c1', false)] })), 'une ad d’un AUTRE lot (repères de la marque) a prêté son CBO').toContain('cbo_inconnu');
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

describe('preuveAEcrire · un réimport MUET de la même période garde la preuve qu’il remplace, et sa date', () => {
  const ancienne = { metaAdId: '120200000000000301', campagne: 'C1', campagneId: 'c1', ensemble: 'ES 1', ensembleId: 'as1', cbo: true, budgetJour: null, importeLe: 'janvier' };
  const muette = { metaAdId: '120200000000000301', campagne: 'C1', campagneId: 'c1', ensemble: 'ES 1', ensembleId: 'as1', cbo: false, budgetJour: null, importeLe: 'octobre' };
  it('muette, même annonce · la preuve ET sa date restent', () => {
    expect(preuveAEcrire(ancienne, muette), 'la preuve gardée prend la date du réimport · elle passe devant une preuve plus récente').toEqual({ cbo: true, budgetJour: null, importeLe: 'janvier' });
    expect(preuveAEcrire({ ...ancienne, cbo: false, budgetJour: 50 }, muette)).toEqual({ cbo: false, budgetJour: 50, importeLe: 'janvier' });
  });
  it('une ligne qui DIT un budget remplace la preuve · une ancienne muette n’a rien à garder · rien d’ancien · la nouvelle', () => {
    expect(preuveAEcrire(ancienne, { ...muette, budgetJour: 50 })).toEqual({ cbo: false, budgetJour: 50, importeLe: 'octobre' });
    expect(preuveAEcrire({ ...ancienne, cbo: false }, muette)).toEqual({ cbo: false, budgetJour: null, importeLe: 'octobre' });
    expect(preuveAEcrire(undefined, muette)).toEqual({ cbo: false, budgetJour: null, importeLe: 'octobre' });
  });
  it('la même annonce · l’Ad ID d’abord, puis la campagne comme `memeCampagne` · des identifiants différents tranchent « non »', () => {
    expect(preuveAEcrire(ancienne, { ...muette, campagne: 'Autre nom', campagneId: null }).cbo, 'même Ad ID, nom de campagne différent · la preuve est perdue').toBe(true);
    expect(preuveAEcrire({ ...ancienne, metaAdId: null }, { ...muette, metaAdId: null, campagneId: 'c2' }).cbo, 'deux identifiants de campagne différents, même nom · passent pour la même campagne').toBe(false);
    expect(preuveAEcrire({ ...ancienne, metaAdId: null }, { ...muette, metaAdId: null, campagne: ' c1 ' }).cbo, 'même identifiant de campagne').toBe(true);
    expect(preuveAEcrire({ ...ancienne, metaAdId: null, campagneId: null, campagne: null }, { ...muette, metaAdId: null, campagneId: null, campagne: null }).cbo, 'NULL et NULL · rien à comparer passe pour la même annonce').toBe(false);
    expect(preuveAEcrire({ ...ancienne, metaAdId: null, campagneId: null }, { ...muette, metaAdId: null, campagneId: null, campagne: '  c1 ' }).cbo, 'même nom, casse et espaces près').toBe(true);
  });
  it('le budget d’ensemble ne se garde que pour le MÊME ensemble · Ad ID, sinon identifiant d’ensemble, sinon nom · le CBO, lui, sur la campagne', () => {
    const abo = { ...ancienne, metaAdId: null, cbo: false, budgetJour: 50 };
    const m = { ...muette, metaAdId: null };
    expect(preuveAEcrire(abo, { ...m, ensembleId: 'as2', ensemble: 'ES 2' }), 'un AUTRE ensemble de la même campagne · son budget est gardé (fausse `budget_variance`)').toEqual({ cbo: false, budgetJour: null, importeLe: 'octobre' });
    expect(preuveAEcrire(abo, m), 'même identifiant d’ensemble · le budget est perdu').toEqual({ cbo: false, budgetJour: 50, importeLe: 'janvier' });
    expect(preuveAEcrire({ ...abo, ensembleId: null }, { ...m, ensembleId: null, ensemble: ' es  1 ' }).budgetJour, 'sans identifiant · même nom d’ensemble (casse, espaces)').toBe(50);
    expect(preuveAEcrire({ ...abo, ensembleId: null }, { ...m, ensembleId: null, ensemble: 'ES 2' }).budgetJour, 'sans identifiant · un autre nom d’ensemble garde le budget').toBeNull();
    expect(preuveAEcrire({ ...abo, ensembleId: null, ensemble: null }, { ...m, ensembleId: null, ensemble: null }).budgetJour, 'NULL et NULL · rien à comparer passe pour le même ensemble').toBeNull();
    expect(preuveAEcrire({ ...abo, ensembleId: 'as1' }, { ...m, ensembleId: 'as2', ensemble: 'ES 1' }).budgetJour, 'des identifiants d’ensemble différents tranchent « non », même nom').toBeNull();
    expect(preuveAEcrire({ ...abo, metaAdId: '120200000000000301' }, { ...m, metaAdId: '120200000000000301', ensembleId: null, ensemble: 'renommé' }).budgetJour, 'même Ad ID · le même ensemble, même renommé').toBe(50);
    expect(preuveAEcrire({ ...ancienne, metaAdId: null }, { ...m, ensembleId: 'as2', ensemble: 'ES 2' }), 'le CBO est de la campagne · un autre ensemble le perd').toEqual({ cbo: true, budgetJour: null, importeLe: 'janvier' });
  });
});

describe('le verrou d’écriture d’un import de mesures · une clé par marque, un refus lisible', () => {
  it('deux marques ne partagent jamais leur clé · la même marque, toujours la même', () => {
    const a = '0d6f3b5e-0000-4000-8000-000000000001';
    const b = '0d6f3b5e-0000-4000-8000-000000000002';
    expect(cleVerrouImportMesures(a), 'la clé ne porte pas la marque').toBe(`adsmap-mesures-import:${a}`);
    expect(cleVerrouImportMesures(a), 'deux marques se bloqueraient l’une l’autre').not.toBe(cleVerrouImportMesures(b));
  });
  it('le refus dit quoi faire, en français, sans tiret cadratin', () => {
    expect(REFUS_IMPORT_MESURES_EN_COURS).toBe('Un import de mesures est déjà en cours pour cette marque · réessaie dans un instant.');
    expect(REFUS_IMPORT_MESURES_EN_COURS).not.toMatch(/\u2014/);
  });
});
