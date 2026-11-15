import { describe, expect, it } from 'vitest';
import {
  CHEMIN_IMPORT_RESULTATS, DEFAULT_VERDICT_CONFIG, RAISON_IMPORT_FERME, adresseListeLot, etatLotSpatial, importFicheLot, lienImportLot,
  listeLotImport, lotAttendDesMesures, lotImport, phraseSansMesureApres, presentationLot, prochaineActionBoucle, syntheseLot,
  variantesSansMesureApres,
  type EtatLotSpatial, type FaitsAdSpatial, type FaitsLotSpatial, type FaitsVerdictSpatial, type VerdictValue,
} from '../src';

/**
 * Chaque « Importer » arrive sur son lot · la liste « Lot » de l'écran d'import
 * (I06). Pur · horloge fixe. On lit le RÉSULTAT · l'adresse rendue, les lots
 * retenus et leur ordre, la valeur choisie, la phrase après le dépôt.
 */

const MAINTENANT = new Date('2026-10-27T12:00:00Z');
const CTX = { maintenant: MAINTENANT, fenetreJours: 7 };
const ilYa = (j: number) => new Date(MAINTENANT.getTime() - j * 86_400_000).toISOString();
const SEUIL = DEFAULT_VERDICT_CONFIG;

const verdict = (calcule: VerdictValue | null, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, ...o,
});
const ad = (id: string, v: FaitsVerdictSpatial | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v, ...o,
});
const lot = (id: string, numero: number, o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({
  id, numero, but: `But ${numero}`, statut: 'testing', lanceLe: ilYa(10), protocole: null, ads: [ad('v1', null), ad('v2', null)], ...o,
});

/** Un corpus qui couvre chaque état, et chaque raison d'attendre ou non · l'état écrit à côté, vérifié. */
const CORPUS: ReadonlyArray<{ l: FaitsLotSpatial; etat: EtatLotSpatial; attend: boolean; pourquoi: string }> = [
  { l: lot('a', 1), etat: 'a_importer', attend: true, pourquoi: 'aucune mesure reçue' },
  { l: lot('b', 2, { ads: [ad('v1', verdict('loser')), ad('v2', null)] }), etat: 'a_importer', attend: true, pourquoi: 'une variante sans mesure' },
  { l: lot('c', 3, { lanceLe: ilYa(2) }), etat: 'diffusion', attend: true, pourquoi: 'en diffusion, rien de mesuré' },
  { l: lot('d', 4, { lanceLe: ilYa(2), ads: [ad('v1', verdict('loser')), ad('v2', verdict('winner'))] }), etat: 'diffusion', attend: false, pourquoi: 'en diffusion, chaque variante au-dessus du minimum' },
  { l: lot('e', 5, { lanceLe: ilYa(2), ads: [ad('v1', verdict('inconclusive', { impressions: 900, depense: 12 }))] }), etat: 'diffusion', attend: true, pourquoi: 'en diffusion, sous le minimum du moteur' },
  { l: lot('f', 6, { ads: [ad('v1', null, { plateforme: 'tiktok' })] }), etat: 'a_importer', attend: false, pourquoi: 'aucune source (TikTok)' },
  { l: lot('g', 7, { ads: [ad('v1', null, { statut: 'draft' })] }), etat: 'a_importer', attend: false, pourquoi: 'aucune source (brouillon)' },
  { l: lot('h', 8, { ads: [] }), etat: 'a_importer', attend: false, pourquoi: 'aucune variante · le silence' },
  { l: lot('i', 9, { ads: [ad('v1', verdict('winner')), ad('v2', verdict('loser'))] }), etat: 'a_conclure', attend: false, pourquoi: 'à conclure' },
  { l: lot('j', 10, { ads: [ad('v1', verdict('inconclusive', { impressions: 900, depense: 12 }))] }), etat: 'non_concluant', attend: false, pourquoi: 'non concluant · on arbitre, on n’importe pas' },
  { l: lot('k', 11, { ads: [ad('v1', verdict('winner', { statut: 'validated', retenu: 'winner' }))] }), etat: 'conclu', attend: false, pourquoi: 'conclu' },
  { l: lot('m', 12, { statut: 'planned', lanceLe: null }), etat: 'composition', attend: false, pourquoi: 'en préparation' },
  { l: lot('n', 13, { statut: 'ready', lanceLe: null }), etat: 'pret', attend: false, pourquoi: 'prêt à lancer' },
  { l: lot('o', 14, { statut: 'analyzed', lanceLe: null }), etat: 'importe', attend: false, pourquoi: 'historique importé' },
];

describe('une seule adresse · chaque « Importer » d’un lot arrive sur lui', () => {
  const ID = 'lot é/3?x=1&y';
  it('la liste, la fiche, la boucle et la sélection rendent LA même adresse, encodée', () => {
    const attendu = `/adsmap/import?lot=${encodeURIComponent(ID)}`;
    expect(lienImportLot(ID)).toBe(attendu);
    expect(adresseListeLot(ID), 'la sélection de la liste').toBe(attendu);
    const l = lot(ID, 3);
    const p = presentationLot(l, CTX);
    expect(p.etat).toBe('a_importer');
    expect(p.action, '« Importer » de « Lots de test »').toEqual({ libelle: 'Importer', href: attendu, primaire: false });
    expect(prochaineActionBoucle([{ presentation: p, synthese: syntheseLot(l, 35) }], false).href, 'la prochaine action de la boucle').toBe(attendu);
    // Import fermé (membre) · la fiche du lot, où le bouton fermé et sa raison sont écrits · la raison dite.
    const m = prochaineActionBoucle([{ presentation: p, synthese: syntheseLot(l, 35) }], false, { refusImport: 'role' });
    expect([m.bouton, m.href]).toEqual(['Voir le lot', `/adsmap/lots/${encodeURIComponent(ID)}`]);
    expect(m.phrase).toContain(RAISON_IMPORT_FERME.role);
    const f = importFicheLot({ etat: p.etat, lot: l, variantes: l.ads, seuil: SEUIL, acces: { refus: null } });
    expect(f?.geste, 'le bouton de la fiche').toEqual({ etat: 'ouvert', libelle: 'Importer les mesures du lot #3', href: attendu });
  });
  it('« Tous les lots » · l’écran sans lot, tel qu’il était', () => {
    expect(adresseListeLot('')).toBe(CHEMIN_IMPORT_RESULTATS);
    expect(CHEMIN_IMPORT_RESULTATS).toBe('/adsmap/import');
  });
  it('un lot dans un autre état mène toujours à sa fiche, jamais à l’import', () => {
    for (const c of CORPUS.filter((x) => x.etat !== 'a_importer')) {
      expect(presentationLot(c.l, CTX).action.href, c.pourquoi).toBe(`/adsmap/lots/${encodeURIComponent(c.l.id)}`);
    }
  });
});

describe('quels lots attendent des mesures', () => {
  it.each(CORPUS.map((c) => [c.pourquoi, c] as const))('%s', (_, c) => {
    expect(etatLotSpatial(c.l, CTX), 'préalable · l’état du corpus').toBe(c.etat);
    expect(lotAttendDesMesures(c.l, CTX, SEUIL)).toBe(c.attend);
  });
  it('le minimum est celui de la MARQUE · 9 000 impressions et 60 € attendent sous 15 000, pas sous le défaut', () => {
    const l = lot('x', 1, { lanceLe: ilYa(2), ads: [ad('v1', verdict('inconclusive', { impressions: 9000, depense: 60 }))] });
    expect(lotAttendDesMesures(l, CTX, SEUIL), 'défaut · 5 000 impressions atteintes').toBe(false);
    expect(lotAttendDesMesures(l, CTX, { ...SEUIL, minImpressions: 15_000 }), 'marque · 15 000 impressions').toBe(true);
  });
});

describe('la liste « Lot »', () => {
  const lots = CORPUS.map((c) => c.l);
  it('les lots qui attendent, dans l’ordre lu · le libellé dit le lot, son but et son état · « Tous les lots » choisi sans adresse', () => {
    const r = listeLotImport(lots, null, CTX, SEUIL)!;
    expect(r.choisi).toBe('');
    expect(r.options.map((o) => o.id)).toEqual(CORPUS.filter((c) => c.attend).map((c) => c.l.id));
    expect(r.options.map((o) => o.libelle)).toEqual([
      'Lot #1 · But 1 · Mesures à importer', 'Lot #2 · But 2 · Mesures à importer', 'Lot #3 · But 3 · En diffusion', 'Lot #5 · But 5 · En diffusion',
    ]);
    // L'ordre est celui des lots lus · inversé, la liste s'inverse.
    expect(listeLotImport([...lots].reverse(), null, CTX, SEUIL)!.options.map((o) => o.id)).toEqual(['e', 'c', 'b', 'a']);
  });
  it('l’adresse est l’état · le lot de l’adresse est choisi · un lot qui n’attend pas, mené là par un « Importer », y figure à sa place', () => {
    expect(listeLotImport(lots, 'b', CTX, SEUIL)!.choisi).toBe('b');
    const f = listeLotImport(lots, 'f', CTX, SEUIL)!;
    expect(f.choisi, 'le lot TikTok de l’adresse').toBe('f');
    expect(f.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'e', 'f']);
    expect(f.options.at(-1)!.libelle).toBe('Lot #6 · But 6 · Mesures à importer');
  });
  it('sans but, le libellé reste lisible · aucun lot à choisir · aucune liste', () => {
    expect(listeLotImport([lot('a', 4, { but: '  ' })], null, CTX, SEUIL)!.options[0]!.libelle).toBe('Lot #4 · Mesures à importer');
    expect(listeLotImport(CORPUS.filter((c) => !c.attend).map((c) => c.l), null, CTX, SEUIL)).toBeNull();
    expect(listeLotImport([], null, CTX, SEUIL)).toBeNull();
  });
});

describe('après le dépôt d’un export · les variantes du lot choisi qui restent sans mesure', () => {
  const l = lotImport({ id: 'a', numero: 3, but: null }, [
    { code: 'v1', nomRegie: 'N1', statut: 'live', plateforme: 'meta', verdict: null },
    { code: 'v2', nomRegie: 'N2', statut: 'live', plateforme: 'meta', verdict: null },
    { code: 'v3', nomRegie: 'N3', statut: 'live', plateforme: 'meta', verdict: { calcule: 'loser', impressions: 20_000, depense: 150 } },
    { code: 'v4', nomRegie: null, statut: 'draft', plateforme: 'meta', verdict: null },
  ], SEUIL);
  const an = (cle: string, etat: string, lotN: number | null, variante: string) => ({ cle, etat, cible: { lot: lotN, variante } });
  it('une annonce rattachée couvre sa variante · une à confirmer seulement cochée · ambiguë, autre lot ou hors lot · rien', () => {
    const annonces = [an('k1', 'rattachee', 3, 'v1'), an('k2', 'a_confirmer', 3, 'v2'), an('k3', 'ambigue', 3, 'v2'), an('k4', 'rattachee', 4, 'v2'), an('k5', 'rattachee', null, 'v2')];
    expect(variantesSansMesureApres(l, annonces, new Set())).toEqual(['v2']);
    expect(variantesSansMesureApres(l, annonces, new Set(['k2']))).toEqual([]);
    expect(variantesSansMesureApres(l, [], new Set())).toEqual(['v1', 'v2']);
    expect(variantesSansMesureApres(l, [{ cle: 'k', etat: 'non_rattachee', cible: null }], new Set())).toEqual(['v1', 'v2']);
  });
  it('la phrase · une, plusieurs, aucune · rien à dire quand aucune variante n’était sans mesure', () => {
    expect(phraseSansMesureApres(l, ['v2'])).toBe('1 variante du lot #3 reste sans mesure après ce fichier · v2.');
    expect(phraseSansMesureApres(l, ['v1', 'v2'])).toBe('2 variantes du lot #3 restent sans mesure après ce fichier · v1, v2.');
    expect(phraseSansMesureApres(l, [])).toBe('Avec ce fichier, plus aucune variante du lot #3 ne reste sans mesure.');
    const mesure = { numero: 3, variantes: l.variantes.filter((v) => v.etat !== 'sans-mesure') };
    expect(phraseSansMesureApres(mesure, [])).toBeNull();
  });
});

describe('la fiche d’un lot « Mesures à importer »', () => {
  const l = lot('a', 4);
  const f = (etat: EtatLotSpatial, refus: 'role' | 'plan' | null, x: FaitsLotSpatial = l) => importFicheLot({ etat, lot: x, variantes: x.ads, seuil: SEUIL, acces: { refus } });
  it('admin · le cas mesuré et l’import ouvert sur CE lot', () => {
    expect(f('a_importer', null)).toEqual({ lotId: 'a', texte: 'Lot #4 · aucune mesure reçue depuis le lancement', geste: { etat: 'ouvert', libelle: 'Importer les mesures du lot #4', href: '/adsmap/import?lot=a' } });
  });
  it('membre · fermé avec la raison existante · formule · la sienne', () => {
    expect(f('a_importer', 'role')!.geste).toEqual({ etat: 'ferme', libelle: 'Importer les mesures du lot #4', raison: RAISON_IMPORT_FERME.role });
    expect(RAISON_IMPORT_FERME.role).toMatch(/réservé aux admins de l’espace/);
    expect(f('a_importer', 'plan')!.geste).toEqual({ etat: 'ferme', libelle: 'Importer les mesures du lot #4', raison: RAISON_IMPORT_FERME.plan });
  });
  it('sans source · dit, aucun bouton · un autre état · rien', () => {
    const t = lot('t', 5, { ads: [ad('v1', null, { plateforme: 'tiktok' })] });
    expect(f('a_importer', null, t)!.geste).toEqual({ etat: 'sans-source', raison: 'aucune source d’import · TikTok n’a encore ni connexion ni export, seul Meta remonte des mesures' });
    for (const e of ['diffusion', 'a_conclure', 'non_concluant', 'conclu', 'composition', 'pret', 'importe'] as const) expect(f(e, null), e).toBeNull();
  });
});
