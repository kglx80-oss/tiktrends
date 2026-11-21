import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VERDICT_CONFIG, compteAConclure, diagnosticFinPrevue, etatLotSpatial, finPrevueAccueil, lotConcluAccueil, lotsConclusLus,
  lienImportLot, lotsFinPrevuePassee, mesureArretee, phraseDiagnosticFinPrevue, reserveFenetreIncomplete, RAISON_IMPORT_FERME,
  type FaitsAdSpatial, type FaitsLotSpatialEntier, type FaitsVerdictSpatial, type LotAccueil, type VerdictValue,
} from '../src';

/**
 * Ce que l'Accueil et la fiche disent d'un lot (suite de #1113). Pur · horloge fixe.
 *
 *  1. La lecture des variantes est BORNÉE (`LIMITE_ADS_LOTS`, 2 000, ordre par
 *     code) · au-delà, les derniers codes d'un lot sont coupés. Un lot dont
 *     toutes les variantes LUES sont arbitrées, mais dont une variante non
 *     arbitrée a été coupée, sortait `conclu` · il disparaissait de l'Accueil
 *     (« En diffusion », « fin prévue passée ») sans trace. `conclu` ne se dit
 *     plus que si la lecture a vu AUTANT de variantes que l'Accueil en compte.
 *  2. Après 120 jours (`FENETRE_SYNCHRO_JOURS`), l'ÉTAT redevient arbitrable
 *     (voulu, gardé) · mais la PHRASE ne se tait plus · le diagnostic dit
 *     toujours « mesures arrêtées », et la fiche d'un lot arbitrable le dit à
 *     l'arbitre (« Fenêtre incomplète »).
 */

const J = 86_400_000;
const LANCE = new Date('2026-10-05T08:00:00Z');
const aJ = (n: number) => ({ maintenant: new Date(LANCE.getTime() + n * J), fenetreJours: 7 });
const A_J8 = aJ(8);
const SEUIL = DEFAULT_VERDICT_CONFIG;
const J3 = new Date(Date.UTC(2026, 9, 8, 5)).toISOString();

const verdict = (calcule: VerdictValue, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 150, impressions: 20_000, achats: 3, cpa: 30, calculeLe: A_J8.maintenant.toISOString(), ...o,
});
const valide = (v: VerdictValue) => verdict(v, { statut: 'validated', retenu: v });
const ad = (id: string, v: FaitsVerdictSpatial | null): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v,
});
const faits = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatialEntier => ({
  id, numero, but: null, statut: 'testing', lanceLe: LANCE.toISOString(), protocole: null, ads,
});
const accueil = (id: string, numero: number, variantes: number, conclu: boolean): LotAccueil => ({
  id, numero, statut: 'testing', but: null, lanceLe: LANCE.toISOString(), finPrevue: new Date(LANCE.getTime() + 7 * J).toISOString(), variantes, vignette: null, conclu,
});

describe('1 · la troncature ne fait plus passer un lot pour conclu', () => {
  // `tronque` · trois variantes en base (l'Accueil les compte) · la lecture bornée n'en a vu que deux, arbitrées · la troisième, sans verdict, coupée.
  const LUS = [
    faits('tronque', 4, [ad('a1', valide('winner')), ad('a2', valide('loser'))]),
    faits('complet', 3, [ad('a1', valide('winner')), ad('a2', valide('loser'))]),
    faits('a-conclure', 2, [ad('a1', verdict('winner')), ad('a2', verdict('loser'))]),
  ];
  const VARIANTES_EN_BASE: Record<string, number> = { tronque: 3, complet: 2, 'a-conclure': 2 };
  // Lus dans chaque cas (jamais au chargement du fichier) · sur main, l'absence de la règle fait tomber les cas, pas le fichier.
  const lus = () => lotsConclusLus(LUS, A_J8);
  const lotsAccueil = () => { const c = lus(); return LUS.map((l) => accueil(l.id, l.numero, VARIANTES_EN_BASE[l.id]!, lotConcluAccueil({ id: l.id, variantes: VARIANTES_EN_BASE[l.id]! }, c))); };

  it('préalable · la lecture tronquée voit le lot comme conclu (l’état, sur ce qu’elle a lu)', () => {
    expect(LUS.map((l) => etatLotSpatial(l, A_J8))).toEqual(['conclu', 'conclu', 'a_conclure']);
    expect([...lus().entries()], 'les lots conclus et leurs variantes LUES').toEqual([['tronque', 2], ['complet', 2]]);
  });

  it('`conclu` · seulement quand la lecture a vu toutes les variantes que l’Accueil compte', () => {
    const conclus = lus();
    expect(lotsAccueil().map((l) => [l.id, l.conclu]), 'un lot dont une variante a été coupée est dit conclu').toEqual([['tronque', false], ['complet', true], ['a-conclure', false]]);
    expect(lotConcluAccueil({ id: 'tronque', variantes: 2 }, conclus), 'lecture complète · conclu').toBe(true);
    expect(lotConcluAccueil({ id: 'complet', variantes: 1 }, conclus), 'plus de variantes lues que comptées · on ne tranche pas').toBe(false);
    expect(lotConcluAccueil({ id: 'complet', variantes: 2 }, null), 'états illisibles · rien n’est caché').toBe(false);
    expect(lotConcluAccueil({ id: 'inconnu', variantes: 0 }, conclus)).toBe(false);
  });

  it('l’Accueil · le lot tronqué reste « fin prévue passée » · le lot entièrement lu et arbitré n’y est pas', () => {
    const compte = compteAConclure(LUS, A_J8);
    expect(lotsFinPrevuePassee(lotsAccueil(), A_J8.maintenant, compte).map((l) => l.id), 'un lot tronqué disparaît de l’Accueil').toEqual(['tronque']);
  });
});

describe('2 · après 120 jours, l’état s’arbitre · la phrase dit toujours « mesures arrêtées »', () => {
  // Le jeton a expiré à J3 · aucun calcul depuis · une variante tranchée.
  const TRANCHE_J3 = faits('l7', 7, [ad('v1', verdict('loser', { calculeLe: J3 })), ad('v2', verdict('inconclusive', { calculeLe: J3 }))]);
  const fenetre = (n: number) => ({ ...aJ(n), lanceLe: LANCE.toISOString() });
  const PHRASE = 'mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2';

  it('l’état garde la borne · « Mesures à importer » jusqu’à J119, arbitrable dès J120', () => {
    expect(etatLotSpatial(TRANCHE_J3, aJ(119))).toBe('a_importer');
    expect(etatLotSpatial(TRANCHE_J3, aJ(120)), 'la borne de l’état a sauté · impasse « à importer »').toBe('a_conclure');
    expect(mesureArretee(TRANCHE_J3.ads[0]!.verdict, fenetre(120)), 'la règle de l’état ne se tait plus après 120 jours').toBe(false);
  });

  for (const n of [8, 119, 120, 400]) {
    it(`J${n} · le diagnostic (Accueil, import, fiche) dit « mesures arrêtées »`, () => {
      const d = diagnosticFinPrevue(TRANCHE_J3.ads, SEUIL, fenetre(n));
      expect(d?.cas, `J${n} · le diagnostic se tait sur une fenêtre incomplète`).toBe('arretees');
      expect(phraseDiagnosticFinPrevue(7, d, SEUIL)).toBe(`Lot #7 · ${PHRASE}`);
      expect(finPrevueAccueil({ lot: TRANCHE_J3, variantes: TRANCHE_J3.ads, seuil: SEUIL, acces: { refus: null }, fenetre: fenetre(n) }).texte).toBe(`Lot #7 · ${PHRASE}`);
    });
  }

  const LOT7 = { id: 'l7', numero: 7 };
  const reserve = (n: number, refus: 'role' | 'plan' | null = null, variantes = TRANCHE_J3.ads) =>
    reserveFenetreIncomplete({ etat: etatLotSpatial(TRANCHE_J3, aJ(n)), lot: LOT7, variantes, seuil: SEUIL, fenetre: fenetre(n), acces: { refus } });
  const RECOURS = 'Mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2 · un export importé peut encore la compléter, sinon tu arbitres sur ce qui a été mesuré.';

  it('la fiche d’un lot arbitrable · l’arbitre lit qu’il tranche sur une fenêtre incomplète, et le recours · l’import de CE lot', () => {
    for (const n of [120, 127, 400]) {
      const r = reserve(n);
      expect(r?.texte, `J${n} · l’arbitre ne sait pas que la fenêtre est incomplète, ou le recours lui est caché`).toBe(RECOURS);
      expect(r?.geste, `J${n} · le recours n’ouvre pas l’import de ce lot`).toEqual({ etat: 'ouvert', libelle: 'Importer les mesures du lot #7', href: lienImportLot('l7') });
    }
    // La phrase ne dit rien de la synchro · entre J120 et J127 elle relit encore la fin de la fenêtre · une marque sans connexion n'en a pas.
    expect(RECOURS, 'la phrase affirme ce que la synchro fait ou ne fait pas').not.toMatch(/synchro/);
    expect(RECOURS, 'tiret cadratin à l’écran').not.toMatch(/[—–]/);
    // Avant J120 · le lot est « Mesures à importer », la fiche porte déjà l'import et son diagnostic · aucune réserve en double.
    expect(reserve(119), 'J119 · réserve sur un lot « Mesures à importer », en double de l’import').toBeNull();
  });

  it('import fermé à la personne · le contrôle fermé et sa raison · aucune source · le recours n’est pas promis', () => {
    expect(reserve(400, 'role')?.geste, 'un membre reçoit un import ouvert').toEqual({ etat: 'ferme', libelle: 'Importer les mesures du lot #7', raison: RAISON_IMPORT_FERME.role });
    const tiktok = TRANCHE_J3.ads.map((a) => ({ ...a, plateforme: 'tiktok' }));
    const r = reserve(400, null, tiktok);
    expect(r?.geste, 'un geste d’import sans source').toBeNull();
    expect(r?.texte, 'sans source, la phrase promet un export').toBe('Mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2 · aucune source d’import · TikTok n’a encore ni connexion ni export, seul Meta remonte des mesures · tu arbitres sur ce qui a été mesuré.');
  });

  it('un lot à jour · aucune réserve · un lot non arbitrable · aucune réserve', () => {
    const AJOUR = faits('l8', 8, [ad('v1', verdict('loser', { calculeLe: new Date(LANCE.getTime() + 300 * J).toISOString() })), ad('v2', verdict('inconclusive', { calculeLe: new Date(LANCE.getTime() + 300 * J).toISOString() }))]);
    expect(etatLotSpatial(AJOUR, aJ(400))).toBe('a_conclure');
    const r = (etat: 'a_conclure' | 'conclu', variantes: FaitsAdSpatial[]) => reserveFenetreIncomplete({ etat, lot: LOT7, variantes, seuil: SEUIL, fenetre: fenetre(400), acces: { refus: null } });
    expect(r('a_conclure', AJOUR.ads), 'réserve sur un lot à jour').toBeNull();
    expect(r('conclu', TRANCHE_J3.ads), 'réserve sur un lot qu’on n’arbitre pas').toBeNull();
  });
});
