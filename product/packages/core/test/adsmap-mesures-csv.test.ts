import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildImportPlan, buildUniqueNames, conclusionLot, referenceConclusion, etatLotSpatial, DEFAULT_VERDICT_CONFIG,
  lireMesuresMeta, lireEnteteMesures, nombreExport, dateExport, identifiantMeta, rattacherAnnonces, annoncesDuFichier,
  retenirMesures, planImportMesures, verdictsDesMesures, MIN_JETONS_APPROCHE, PRIORITE_MESURES,
  etatRemontee, prochaineRemontee, motifEchecRemontee, bilanRattachement, texteRemontee, MOTIF_REMONTEE_ADSMAP, HEURE_REMONTEE_UTC, RETARD_REMONTEE_MS,
  type CandidatMesure, type EntreeMesure, type AdAMesurer, type FaitsLotSpatial,
} from '../src';

/**
 * Lot 4 V5 · les MESURES d'un export Ads Manager arrivent dans les lots.
 *
 * Les en-têtes ci-dessous sont CONSTRUITS d'après la documentation publique des
 * colonnes d'Ads Manager (aucun export réel n'a pu être lu · voir l'en-tête de
 * `mesures-csv.ts`) · en français au point-virgule et décimales à la virgule
 * (Excel français), en anglais à la virgule, ventilé par jour (« Day »).
 */

const FR_ENTETE = 'Début des rapports;Fin des rapports;Nom de la campagne;Nom de l’ensemble de publicités;Nom de la publicité;Identifiant de la publicité;Diffusion de la publicité;Résultats;Indicateur de résultats;Couverture;Impressions;Montant dépensé (EUR);Clics sur un lien;Achats;Valeur de conversion des achats;Budget de l’ensemble de publicités;Type de budget de l’ensemble de publicités';
const EN_ENTETE = 'Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad ID,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (USD),Link clicks,Purchases,Purchases conversion value,Ad set budget,Ad set budget type';

const fr = (l: Array<{ debut: string; fin: string; nom: string; id?: string; depense: string; imp: string; achats: string; ensemble?: string }>) =>
  [FR_ENTETE, ...l.map((x) => [x.debut, x.fin, '[ADSMAP] TEST Truefords B2', x.ensemble ?? `ES ${x.nom}`, x.nom, x.id ?? '', 'active', x.achats, 'actions:offsite_conversion.fb_pixel_purchase', '900', x.imp, x.depense, '120', x.achats, '0', '20', 'Quotidien'].join(';'))].join('\n') + '\n';

describe('en-tête · intitulés Meta reconnus en français et en anglais', () => {
  it('français · toutes les colonnes utiles retrouvées, langue lue', () => {
    const e = lireEnteteMesures(FR_ENTETE.split(';'));
    expect(e.langue).toBe('fr');
    expect(e.manquantes).toEqual([]);
    expect(Object.keys(e.colonnes).sort()).toEqual(['achats', 'adId', 'budgetEnsemble', 'campagne', 'clicsLien', 'couverture', 'debut', 'depense', 'ensemble', 'fin', 'impressions', 'indicateurResultat', 'nom', 'resultats', 'typeBudgetEnsemble', 'valeurAchats'].sort());
  });
  it('anglais · « Amount spent (USD) » reconnu malgré la devise, « Day » reconnu', () => {
    const e = lireEnteteMesures(EN_ENTETE.split(','));
    expect(e.langue).toBe('en');
    expect(e.colonnes.depense).toBe(12);
    expect(e.colonnes.jour).toBe(0);
    expect(e.manquantes).toEqual([]);
  });
  it('strict sur le fond · « Coût par résultat » n’est jamais « Résultats », apostrophe droite tolérée', () => {
    const e = lireEnteteMesures(['Nom de la publicité', 'Coût par résultat', "Nom de l'ensemble de publicités", 'Jour', 'Montant dépensé (EUR)', 'Impressions']);
    expect(e.colonnes.resultats).toBeUndefined();
    expect(e.colonnes.ensemble).toBe(2);
  });
  it('refus · dit les colonnes absentes, dans la langue de l’en-tête', () => {
    const l = lireMesuresMeta('Ad name,Impressions,Reach\nA,1000,800\n');
    expect(l.refus).toMatch(/^Export Meta non reconnu · colonnes absentes : « Reporting starts », « Reporting ends », « Amount spent »/);
    expect(l.lignes).toEqual([]);
  });
});

describe('valeurs · nombres, dates, identifiants', () => {
  it.each([
    ['36,12', 'fr', 36.12], ['36.12', 'en', 36.12], ['1 234,5', 'fr', 1234.5], ['1,234.5', 'en', 1234.5],
    ['1,234', 'en', 1234], ['1,234', 'fr', 1.234], ['12 €', 'fr', 12], ['', 'fr', null], ['-', 'fr', null], ['abc', 'en', null],
  ] as const)('%s (%s) → %s', (v, l, attendu) => expect(nombreExport(v, l)).toBe(attendu));
  it('dates · ISO toujours, barres selon la langue, jamais une date inventée', () => {
    expect(dateExport('2026-10-03', null)).toBe('2026-10-03');
    expect(dateExport('03/10/2026', 'fr')).toBe('2026-10-03');
    expect(dateExport('10/03/2026', 'en')).toBe('2026-10-03');
    expect(dateExport('03/10/2026', null)).toBeNull();
    expect(dateExport('31/10/2026', null)).toBe('2026-10-31');
    expect(dateExport('2026-02-30', 'fr')).toBeNull();
  });
  it('identifiant · des chiffres, ou rien (notation scientifique d’un tableur = abîmé)', () => {
    expect(identifiantMeta('120212345678901234')).toEqual({ id: '120212345678901234', abime: false });
    expect(identifiantMeta('1,20212E+17')).toEqual({ id: null, abime: true });
    expect(identifiantMeta('')).toEqual({ id: null, abime: false });
  });
});

describe('lecture · lignes, totaux, ventilation, doublons', () => {
  it('français · une ligne par annonce, achats lus, neutralisation retirée, ligne de total écartée', () => {
    const csv = fr([
      { debut: '2026-10-01', fin: '2026-10-07', nom: "'=Truefords_B2_v1", depense: '36,12', imp: '5 000', achats: '3' },
      { debut: '2026-10-01', fin: '2026-10-07', nom: 'Truefords_B2_v2', depense: '40', imp: '6000', achats: '1' },
    ]) + '2026-10-01;2026-10-07;;;;;;;;;11000;76,12;;;;;\n';
    const l = lireMesuresMeta(csv);
    expect(l.refus).toBeNull();
    expect(l.lignes.map((x) => [x.nom, x.mesures.spend, x.mesures.impressions, x.mesures.purchases])).toEqual([
      ['=Truefords_B2_v1', 36.12, 5000, 3], ['Truefords_B2_v2', 40, 6000, 1],
    ]);
    expect(l.ecartees).toEqual([{ ligne: 4, motif: 'sans_annonce' }]);
    expect(l.lignes[0]!.protocole).toMatchObject({ campagne: '[ADSMAP] TEST Truefords B2', budgetJour: 20, cbo: false });
  });
  it('ventilé (placement) · les lignes d’une même annonce et d’un même jour s’additionnent · une ligne recopiée compte une fois', () => {
    const csv = `${EN_ENTETE}\n2026-10-01,2026-10-01,2026-10-01,C,S,Ad A,111111,active,2,purchase,500,1000,10,20,2,80,15,Daily\n2026-10-01,2026-10-01,2026-10-01,C,S,Ad A,111111,active,1,purchase,300,500,5,10,1,40,15,Daily\n2026-10-01,2026-10-01,2026-10-01,C,S,Ad A,111111,active,1,purchase,300,500,5,10,1,40,15,Daily\n`;
    const l = lireMesuresMeta(csv);
    expect(l.lignes).toHaveLength(1);
    expect(l.lignes[0]!.mesures).toMatchObject({ spend: 15, impressions: 1500, purchases: 3, reach: 500 });
    expect([l.regroupees, l.doublons]).toEqual([1, 1]);
  });
  it('« Utilisation du budget de la campagne » · CBO lu, pas de budget d’ensemble', () => {
    const csv = FR_ENTETE + '\n' + ['2026-10-01', '2026-10-07', 'C', 'E', 'P', '', 'active', '1', 'achat', '10', '1000', '10', '1', '1', '0', 'Utilisation du budget de la campagne', ''].join(';') + '\n';
    expect(lireMesuresMeta(csv).lignes[0]!.protocole).toMatchObject({ cbo: true, budgetJour: null });
  });
});

/* ───────────────────────── rattachement ───────────────────────── */

const C = (id: string, o: Partial<CandidatMesure> = {}): CandidatMesure => ({ id, idMeta: null, nomRegie: null, lot: 2, variante: 'v1', ...o });
const A = (nom: string | null, adIdMeta: string | null = null) => ({ cle: adIdMeta ? `id:${adIdMeta}` : `nom:${nom}`, adIdMeta, nom, lignes: [2] });

describe('rattachement · identifiant, puis nom régie, jamais une devinette', () => {
  it('l’identifiant épinglé l’emporte sur un nom qui désigne une autre ad', () => {
    const r = rattacherAnnonces([A('Truefords_B2_v2', '999')], [C('a1', { idMeta: '999', nomRegie: 'Truefords_B2_v1' }), C('a2', { nomRegie: 'Truefords_B2_v2', variante: 'v2' })]);
    expect(r.get('id:999')).toEqual({ etat: 'rattachee', adId: 'a1', par: 'identifiant' });
  });
  it('le nom régie identique (casse, ponctuation, accents) rattache', () => {
    const r = rattacherAnnonces([A('truefords b2 crème v1')], [C('a1', { nomRegie: 'Truefords_B2_Creme_v1' })]);
    expect(r.get('nom:truefords b2 crème v1')).toEqual({ etat: 'rattachee', adId: 'a1', par: 'nom' });
  });
  it('un nom qui correspond à une ad épinglée sur une AUTRE annonce · non rattachée, raison dite', () => {
    const r = rattacherAnnonces([A('Truefords_B2_v1', '777')], [C('a1', { idMeta: '999', nomRegie: 'Truefords_B2_v1' })]).get('id:777')!;
    expect(r.etat).toBe('non_rattachee');
    expect(r.etat === 'non_rattachee' && r.raison).toMatch(/épinglée à une autre annonce Meta \(999\)/);
  });
  it('deux ads de la marque portent le même nom · ambiguë, aucune ne reçoit rien', () => {
    const r = rattacherAnnonces([A('Truefords_B2_v1')], [C('a1', { nomRegie: 'Truefords_B2_v1' }), C('a2', { nomRegie: 'Truefords_B2_v1', lot: 3 })]).get('nom:Truefords_B2_v1')!;
    expect(r).toMatchObject({ etat: 'ambigue', candidats: ['a1', 'a2'] });
  });
  it('un nom approché (« - Copie ») n’est qu’une PROPOSITION à confirmer', () => {
    const r = rattacherAnnonces([A('Truefords_B2_Avant-apres_v1_hook - Copie')], [C('a1', { nomRegie: 'Truefords_B2_Avant-apres_v1_hook' })]).get('nom:Truefords_B2_Avant-apres_v1_hook - Copie')!;
    expect(r).toMatchObject({ etat: 'a_confirmer', adId: 'a1', par: 'nom_contenu' });
  });
  it('contenu MOT À MOT · « NEWB2_v1 » ne contient pas « B2_v1 »', () => {
    const r = rattacherAnnonces([A('NEWTruefords_B2_v1')], [C('a1', { nomRegie: 'Truefords_B2_v1' })]).get('nom:NEWTruefords_B2_v1')!;
    expect(r.etat).toBe('non_rattachee');
  });
  it('une ad hors des candidates (autre marque) n’est jamais rattachée · seules les candidates sont lues', () => {
    // L'appelant borne les candidates à la marque active · l'ad homonyme de l'autre marque n'y est pas.
    const r = rattacherAnnonces([A('Truefords_B2_v1')], [C('a1', { nomRegie: 'Autre_B2_v1' })]).get('nom:Truefords_B2_v1')!;
    expect(r).toEqual({ etat: 'non_rattachee', raison: 'aucune ad de la marque ne porte ce nom ni cet identifiant' });
  });
  it('deux annonces du fichier sur la même ad · le rattachement sûr garde l’ad, l’autre s’arrête', () => {
    const an = [A('Truefords_B2_Avant_v1_hook'), A('Truefords_B2_Avant_v1_hook - Copie')];
    const r = rattacherAnnonces(an, [C('a1', { nomRegie: 'Truefords_B2_Avant_v1_hook' })]);
    expect(r.get(an[0]!.cle)).toMatchObject({ etat: 'rattachee', adId: 'a1' });
    expect(r.get(an[1]!.cle)).toMatchObject({ etat: 'ambigue' });
  });
  it('lot et variante · seulement pour une ad SANS nom régie (comme la synchro)', () => {
    expect(rattacherAnnonces([A('Promo B2 v1 octobre')], [C('a1')]).get('nom:Promo B2 v1 octobre')).toMatchObject({ etat: 'a_confirmer', par: 'lot_variante' });
    expect(rattacherAnnonces([A('Promo B2 v1 octobre')], [C('a1', { nomRegie: 'Truefords_B2_x_v1' })]).get('nom:Promo B2 v1 octobre')!.etat).toBe('non_rattachee');
  });
});

/**
 * La MESURE du seuil `MIN_JETONS_APPROCHE`, refaite · tableau dans le module.
 * Tombe si le seuil est relâché (des propositions fausses apparaissent) ou
 * resserré (les propositions justes d'un nom de trois mots disparaissent).
 */
describe('seuil des rapprochements approchés · mesuré', () => {
  const titres = [...new Set(buildImportPlan(readFileSync(join(__dirname, 'fixtures/sheet-truefords.csv'), 'utf8')).concepts.map((c) => c.title))];
  const alterer: Array<(n: string) => string> = [
    (n) => n, (n) => `${n} - Copie`, (n) => `${n}_2026-10-01`, (n) => `TEST_${n}`, (n) => `NEW${n}`,
    (n) => n.split('_').reverse().join('_'), (n) => n.split('_').slice(0, -1).join('_'),
  ];
  const lots = (marque: string, de: number, a: number, motif: string): CandidatMesure[] => {
    const out: CandidatMesure[] = [];
    for (let lot = de; lot <= a; lot++) {
      const rows = [0, 1, 2, 3].map((k) => ({ brand: marque, batch: lot, concept: titres[(lot * 4 + k) % titres.length]!, variant: `v${k + 1}`, variable: 'hook' }));
      const noms = buildUniqueNames(motif, rows);
      rows.forEach((r, k) => out.push({ id: `${marque}-${lot}-${k}`, idMeta: null, nomRegie: noms[k]!, lot, variante: r.variant }));
    }
    return out;
  };
  const mesurer = (motif: string, minJetons: number) => {
    const cands = lots('Truefords', 1, 12, motif);
    const negatifs = [...lots('Autre', 1, 12, motif), ...lots('Truefords', 13, 24, motif)];
    let justes = 0, fausses = 0, negatifsProposes = 0;
    for (const f of alterer) {
      for (const c of cands) {
        const m = rattacherAnnonces([{ cle: 'x', adIdMeta: null, nom: f(c.nomRegie!), lignes: [2] }], cands, { minJetons }).get('x')!;
        if (m.etat === 'a_confirmer') { if (m.adId === c.id) justes++; else fausses++; }
      }
      for (const c of negatifs) {
        if (rattacherAnnonces([{ cle: 'x', adIdMeta: null, nom: f(c.nomRegie!), lignes: [2] }], cands, { minJetons }).get('x')!.etat === 'a_confirmer') negatifsProposes++;
      }
    }
    return { justes, fausses, negatifsProposes };
  };
  const DEFAUT = '{brand}_B{batch}_{concept}_{variant}_{variable}', TROIS = '{brand}_B{batch}_{variant}', DEUX = 'B{batch}_{variant}';
  it('le banc · 12 concepts réels', () => expect(titres.length).toBe(12));
  it('au seuil retenu · aucune proposition fausse, sous aucun motif', () => {
    for (const m of [DEFAUT, TROIS, DEUX, '{variant}']) {
      const r = mesurer(m, MIN_JETONS_APPROCHE);
      expect([r.fausses, r.negatifsProposes], `propositions fausses au seuil ${MIN_JETONS_APPROCHE}, motif ${m}`).toEqual([0, 0]);
    }
  });
  it('un cran plus bas · un nom de deux mots propose autant de faux que de justes (le seuil est le plus petit sans faux)', () => {
    expect(mesurer(DEUX, MIN_JETONS_APPROCHE - 1)).toEqual({ justes: 192, fausses: 0, negatifsProposes: 192 });
  });
  it('au seuil · un nom de trois mots garde ses 192 propositions justes · un cran plus haut, elles disparaissent', () => {
    expect(mesurer(TROIS, MIN_JETONS_APPROCHE)).toEqual({ justes: 192, fausses: 0, negatifsProposes: 0 });
    expect(mesurer(TROIS, MIN_JETONS_APPROCHE + 1).justes).toBe(0);
    expect(mesurer(DEFAUT, MIN_JETONS_APPROCHE)).toEqual({ justes: 192, fausses: 0, negatifsProposes: 0 });
  });
});

/* ───────────────────────── priorité et idempotence ───────────────────────── */

const M = (spend: number, purchases = 0) => ({ spend, impressions: 1000, linkClicks: 10, purchases });
const E = (debut: string, fin: string, spend = 10): EntreeMesure => ({ debut, fin, mesures: M(spend) });

describe('priorité · la connexion Meta d’abord, jamais deux fois le même jour', () => {
  it('la règle est écrite · la source qui l’emporte est la connexion', () => expect(PRIORITE_MESURES).toBe('meta'));
  it('une journée CSV sur un jour Meta est écartée · les autres comptent', () => {
    const r = retenirMesures(new Set(['2026-10-02']), [E('2026-10-01', '2026-10-01'), E('2026-10-02', '2026-10-02'), E('2026-10-03', '2026-10-03')]);
    expect(r.retenues.map((e) => e.debut)).toEqual(['2026-10-01', '2026-10-03']);
    expect(r.ecartees.map((e) => [e.entree.debut, e.motif])).toEqual([['2026-10-02', 'meta']]);
  });
  it('une période qui touche un jour Meta s’écarte entière · une période ne se découpe pas', () => {
    const r = retenirMesures(new Set(['2026-10-05']), [E('2026-10-01', '2026-10-07')]);
    expect(r.retenues).toEqual([]);
  });
  it('CSV contre CSV · la journée l’emporte sur la période qui la couvre', () => {
    const r = retenirMesures(new Set(), [E('2026-10-01', '2026-10-07', 70), E('2026-10-01', '2026-10-01'), E('2026-10-02', '2026-10-02')]);
    expect(r.retenues.map((e) => `${e.debut}/${e.fin}`)).toEqual(['2026-10-01/2026-10-01', '2026-10-02/2026-10-02']);
    expect(r.ecartees).toEqual([{ entree: E('2026-10-01', '2026-10-07', 70), motif: 'chevauchement' }]);
  });
});

describe('plan d’import · réimporter le même fichier ne double rien', () => {
  const ID = '120200000000501';
  const csv = fr([
    { debut: '2026-10-01', fin: '2026-10-07', nom: 'Truefords_B2_Avant_v1_hook', id: ID, depense: '100', imp: '6000', achats: '6' },
    { debut: '2026-10-01', fin: '2026-10-07', nom: 'Truefords_B2_Avant_v1_hook - Copie', depense: '10', imp: '600', achats: '0' },
    { debut: '2026-10-01', fin: '2026-10-07', nom: 'Autre_B9_v1', depense: '5', imp: '600', achats: '0' },
  ]);
  const copie = fr([{ debut: '2026-10-01', fin: '2026-10-07', nom: 'Truefords_B2_Apres_v2_hook - Copie', depense: '10', imp: '600', achats: '0' }]);
  const cands = [C('a1', { nomRegie: 'Truefords_B2_Avant_v1_hook' }), C('a2', { nomRegie: 'Truefords_B2_Apres_v2_hook', variante: 'v2' })];
  const vide = { existantes: new Map(), joursMeta: new Map(), confirmees: new Set<string>() };
  it('premier passage · une rattachée (son identifiant sera épinglé), sa copie arrêtée (même ad), une non rattachée', () => {
    const p = planImportMesures(lireMesuresMeta(csv), cands, vide);
    expect(p.annonces.map((a) => a.rattachement.etat)).toEqual(['rattachee', 'ambigue', 'non_rattachee']);
    expect(p.aEcrire.map((e) => e.adId)).toEqual(['a1']);
    expect(p.epingles).toEqual([{ adId: 'a1', idMeta: ID }]);
    expect(p.totaux).toMatchObject({ rattachees: 1, ambigues: 1, nonRattachees: 1, nouvelles: 1, identiques: 0, ads: 1 });
  });
  it('une proposition approchée · rien sans confirmation, écrite une fois cochée', () => {
    const lu = lireMesuresMeta(copie);
    const sans = planImportMesures(lu, cands, vide);
    expect([sans.annonces[0]!.rattachement.etat, sans.aEcrire.length]).toEqual(['a_confirmer', 0]);
    const avec = planImportMesures(lu, cands, { ...vide, confirmees: new Set([sans.annonces[0]!.cle]) });
    expect(avec.aEcrire.map((e) => e.adId)).toEqual(['a2']);
    expect(avec.totaux.confirmees).toBe(1);
  });
  it('réimport · la même entrée est « identique », aucune nouvelle', () => {
    const lu = lireMesuresMeta(csv);
    const p1 = planImportMesures(lu, cands, vide);
    const existantes = new Map(p1.aEcrire.map((e) => [`${e.adId}|${e.debut}|${e.fin}`, e.mesures]));
    const p2 = planImportMesures(lu, cands, { ...vide, existantes });
    expect(p2.totaux).toMatchObject({ nouvelles: 0, identiques: 1, misesAJour: 0 });
  });
  it('un export plus récent de la même période · « remplacée », jamais ajoutée en double', () => {
    const p1 = planImportMesures(lireMesuresMeta(csv), cands, vide);
    const existantes = new Map(p1.aEcrire.map((e) => [`${e.adId}|${e.debut}|${e.fin}`, { ...e.mesures, purchases: 4 }]));
    expect(planImportMesures(lireMesuresMeta(csv), cands, { ...vide, existantes }).totaux).toMatchObject({ nouvelles: 0, misesAJour: 1 });
  });
  it('une journée déjà mesurée par la connexion · comptée « meta »', () => {
    const p = planImportMesures(lireMesuresMeta(csv), cands, { ...vide, joursMeta: new Map([['a1', new Set(['2026-10-03'])]]) });
    expect(p.totaux.meta).toBe(1);
  });
  it('annonces du fichier · une par identifiant, sinon par nom', () => {
    expect(annoncesDuFichier(lireMesuresMeta(csv).lignes).map((a) => a.cle)).toEqual([`id:${ID}`, 'nom:truefords b2 avant v1 hook copie', 'nom:autre b9 v1']);
  });
});

/* ───────────────────────── verdicts et conclusion du lot (témoin) ───────────────────────── */

describe('des mesures au verdict · la conclusion du lot parle une fois les mesures assez nombreuses', () => {
  const aujourdhui = '2026-10-20';
  const proto = (n: string, ens: string) => ({ nomAnnonce: n, campagne: '[ADSMAP] TEST Truefords B2', campagneId: null, ensemble: ens, ensembleId: null, budgetJour: 20, cbo: false });
  const ad = (id: string, lot: string, numero: number, spend: number, purchases: number): AdAMesurer => ({
    id, lotId: lot, lotNumero: numero, lanceLe: '2026-10-01',
    entrees: [{ debut: '2026-10-01', fin: '2026-10-07', mesures: { spend, impressions: 20000, linkClicks: 300, purchases } }],
    protocole: proto(id, `ES ${id}`),
  });
  const ctx = { config: DEFAULT_VERDICT_CONFIG, regles: { structure: 'abo_one_adset_per_ad' as const, campaignNamePattern: '[ADSMAP] TEST {brand} B{batch}', budgetVarianceTolerance: 0.2, minSpendShare: 0.35 }, marque: 'Truefords', aujourdhui };
  // Lot 1 · la référence · 4 perdantes. Lot 2 · 4 gagnantes (CPA 15 € contre une cible de 35 €).
  const tous = [
    ...[0, 1, 2, 3].map((k) => ad(`r${k}`, 'L1', 1, 150, 0)),
    ...[0, 1, 2, 3].map((k) => ad(`g${k}`, 'L2', 2, 300, 20)),
  ];
  const lot = (id: string, numero: number, verdicts: Map<string, { computed: string; comparable: boolean }>, ids: string[]): FaitsLotSpatial => ({
    id, numero, but: null, statut: 'testing', lanceLe: '2026-10-01T00:00:00.000Z', protocole: null,
    ads: ids.map((x) => ({ id: x, variante: x, statut: 'live', hypothese: 'Si… alors… parce que…', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
      verdict: verdicts.has(x) ? { calcule: verdicts.get(x)!.computed as never, retenu: null, statut: 'computed', comparable: verdicts.get(x)!.comparable, raison: null, depense: null, impressions: null, achats: null, cpa: null } : null })),
  });
  it('mesures en place · verdicts tranchés au protocole, conclusion « confirmée »', () => {
    const r = verdictsDesMesures(tous, { ...ctx, reperes: tous });
    const v = new Map(r.verdicts.map((x) => [x.adId, { computed: x.res.computed, comparable: x.res.comparable }]));
    expect([...v.values()].map((x) => x.computed)).toEqual(['loser', 'loser', 'loser', 'loser', 'winner', 'winner', 'winner', 'winner']);
    expect(r.protocoles.every((p) => p.check.compliant)).toBe(true);
    const lots = [lot('L1', 1, v, ['r0', 'r1', 'r2', 'r3']), lot('L2', 2, v, ['g0', 'g1', 'g2', 'g3'])];
    const maintenant = new Date(`${aujourdhui}T12:00:00Z`);
    const etat = etatLotSpatial(lots[1]!, { maintenant, fenetreJours: 7 });
    expect(etat).toBe('a_conclure');
    expect(conclusionLot(lots[1]!, etat, referenceConclusion(lots, 'L2'))).toMatchObject({ conclusion: 'confirmee', motif: 'lecture' });
  });
  it('témoin · sans mesures, aucun verdict, la conclusion se tait', () => {
    const r = verdictsDesMesures(tous.map((a) => ({ ...a, entrees: [] })), ctx);
    expect(r.verdicts).toEqual([]);
    const lots = [lot('L1', 1, new Map(), ['r0', 'r1', 'r2', 'r3']), lot('L2', 2, new Map(), ['g0', 'g1', 'g2', 'g3'])];
    const etat = etatLotSpatial(lots[1]!, { maintenant: new Date(`${aujourdhui}T12:00:00Z`), fenetreJours: 7 });
    expect(etat).toBe('a_importer');
    expect(conclusionLot(lots[1]!, etat, referenceConclusion(lots, 'L2')).conclusion).toBe('en_attente');
  });
  it('deux annonces dans le même ensemble · protocole non respecté, verdicts non comparables', () => {
    const memes = tous.filter((a) => a.lotId === 'L2').map((a) => ({ ...a, protocole: proto(a.id, 'ES commun') }));
    const r = verdictsDesMesures(memes, ctx);
    expect(r.protocoles[0]!.check.compliant).toBe(false);
    expect(r.verdicts.every((v) => !v.res.comparable)).toBe(true);
  });
});

/* ───────────────────────── remontée planifiée ───────────────────────── */

describe('remontée planifiée · dernière, prochaine, erreur', () => {
  const maintenant = new Date('2026-11-08T10:00:00Z');
  const base = { connecte: true, cleDeclenchement: true, suspendueLe: null, derniereReussie: '2026-11-08T07:02:00Z', journal: [] };
  it('le motif du worker et l’heure affichée sont la même donnée', () => {
    expect(MOTIF_REMONTEE_ADSMAP).toBe(`0 ${HEURE_REMONTEE_UTC} * * *`);
    expect(prochaineRemontee(maintenant)).toBe('2026-11-09T07:00:00.000Z');
    expect(prochaineRemontee(new Date('2026-11-08T06:59:00Z'))).toBe('2026-11-08T07:00:00.000Z');
  });
  it('planifiée · prochaine et dernière dites', () => {
    const e = etatRemontee(base, maintenant, 'Europe/Paris');
    expect(e.phase).toBe('planifiee');
    expect(e.libelle).toBe('Remontée chaque nuit · prochaine lundi 08:00 · dernière le 8 nov. à 08:02');
  });
  it('dernière tentative en échec · l’erreur en mots, jamais le message brut', () => {
    const e = etatRemontee({ ...base, journal: [{ source: 'meta', declencheur: 'nuit', le: '2026-11-08T07:01:00Z', ok: false, motif: 'jeton', resume: null }] }, maintenant, 'Europe/Paris');
    expect([e.phase, e.erreur]).toEqual(['en_echec', 'le jeton Meta a expiré ou a été révoqué · reconnecte Meta Ads']);
  });
  it('en retard · aucune réussite depuis plus d’une nuit (seuil dérivé du planning)', () => {
    expect(RETARD_REMONTEE_MS).toBe(25 * 3_600_000);
    expect(etatRemontee({ ...base, derniereReussie: '2026-11-07T08:59:00Z' }, maintenant, 'Europe/Paris').phase).toBe('en_retard');
    expect(etatRemontee({ ...base, derniereReussie: '2026-11-07T09:01:00Z' }, maintenant, 'Europe/Paris').phase).toBe('planifiee');
  });
  it('sans clé de déclenchement · inactive, raison écrite à côté du réglage', () => {
    const e = etatRemontee({ ...base, cleDeclenchement: false }, maintenant, 'Europe/Paris');
    expect(e.phase).toBe('inactive');
    expect(e.prochaine).toBeNull();
    expect(e.raisonFermee).toMatch(/CRON_SECRET/);
  });
  it('suspendue · pas de prochaine remontée', () => {
    expect(etatRemontee({ ...base, suspendueLe: '2026-11-01T00:00:00Z' }, maintenant, 'Europe/Paris')).toMatchObject({ phase: 'suspendue', prochaine: null });
  });
  it.each([
    ['Meta : Error validating access token: Session has expired', 'jeton'], ['Meta : (#17) User request limit reached', 'limite'],
    ['Meta : (#10) Application does not have permission for this action', 'droits'], ['fetch failed', 'reseau'], ['meta_not_connected', 'non_connecte'], ['HTTP 400', 'autre'],
  ])('« %s » → %s', (m, code) => expect(motifEchecRemontee(m)).toBe(code));
  it('rattachement aux lots · épinglées, nommées, sans repère', () => {
    expect(bilanRattachement([{ idMeta: '1', nomRegie: 'x' }, { idMeta: null, nomRegie: 'y' }, { idMeta: null, nomRegie: null }]).phrase)
      .toBe('1 ad épinglée à l’annonce Meta · 1 rattachable par le nom régie · 1 sans nom ni identifiant (non mesurable tant qu’elle n’en a pas).');
  });
  it('journal · une ligne CSV dite avec ses lots', () => {
    expect(texteRemontee({ source: 'csv', declencheur: 'import', le: '', ok: true, motif: null, resume: { variantes: 3, journees: 21, lotsNumeros: [2] } })).toBe('CSV · Lot #2 · 3 variantes · 21 journées');
  });
});
