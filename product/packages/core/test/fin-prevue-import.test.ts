import { describe, expect, it } from 'vitest';
import {
  CHEMIN_IMPORT_RESULTATS, DEFAULT_VERDICT_CONFIG, PARAM_LOT_IMPORT, RAISON_IMPORT_FERME, computeVerdict, diagnosticFinPrevue, etapesBoucleAccueil,
  etatVarianteImport, finPrevueAccueil, gesteFinPrevue, lienImportLot, lotCibleImport, lotImport, lotsFinPrevuePassee, phraseAnnoncesDuLot,
  lienLotApercu, phraseDiagnosticFinPrevue, phraseFinPrevuePassee, phraseMinimumMoteur, sourcesImportLot, sousLeMinimumDuMoteur,
  type AdMetrics, type CasFinPrevue, type LotAccueil, type VarianteFinPrevue, type VerdictValue,
} from '../src';

/**
 * « Fin prévue passée » mène à l'import des mesures du lot (suite de #1080).
 * Pur · l'horloge est fixe. On lit le RÉSULTAT · le cas rendu, la phrase, le
 * geste, l'étape « En diffusion » de l'Accueil.
 *
 * Le corpus couvre chaque cas · sans mesure (aucun verdict, ou un verdict
 * importé jamais calculé), sous le minimum du moteur (seul ou avec des
 * variantes sans mesure), partielles, autre, et le silence (aucune variante,
 * agrégat illisible). Le minimum est CELUI du moteur (`sousLeMinimumDuMoteur`,
 * la règle 2 de `computeVerdict`) · jamais un seuil reposé à côté.
 */

const SEUIL = DEFAULT_VERDICT_CONFIG;
const v = (calcule: VerdictValue | null, impressions: number | null = 20_000, depense: number | null = 150, o: Partial<VarianteFinPrevue> = {}): VarianteFinPrevue => ({
  statut: 'live', plateforme: 'meta', verdict: { calcule, impressions, depense }, ...o,
});
const sans = (o: Partial<VarianteFinPrevue> = {}): VarianteFinPrevue => ({ statut: 'live', plateforme: 'meta', verdict: null, ...o });
/** Sous le minimum par défaut · 900 impressions, 12 € (minimum · 5 000 impressions ou 105 €). */
const maigre = () => v('inconclusive', 900, 12);

const CORPUS: ReadonlyArray<{ nom: string; variantes: VarianteFinPrevue[]; cas: CasFinPrevue | null }> = [
  { nom: 'aucun verdict', variantes: [sans(), sans()], cas: 'sans-mesure' },
  { nom: 'verdict importé, jamais calculé', variantes: [v(null, null, null), sans()], cas: 'sans-mesure' },
  { nom: 'tout sous le minimum', variantes: [maigre(), maigre()], cas: 'sous-minimum' },
  { nom: 'sous le minimum, une variante sans mesure', variantes: [maigre(), sans()], cas: 'sous-minimum' },
  { nom: 'une mesurée au-dessus, une sans mesure', variantes: [v('winner'), sans()], cas: 'partielles' },
  { nom: 'mesurée illisible, une sans mesure', variantes: [v('winner', null, null), sans()], cas: 'partielles' },
  { nom: 'toutes mesurées, une au-dessus', variantes: [v('winner'), maigre()], cas: 'autre' },
  { nom: 'toutes arbitrées', variantes: [v('loser'), v('winner')], cas: 'autre' },
  // L'un des deux seuils atteint suffit à sortir du minimum · 150 € avec 900 impressions, 20 000 impressions avec 12 €.
  { nom: 'un seul des deux seuils atteint, chaque fois', variantes: [v('loser', 900, 150), v('inconclusive', 20_000, 12)], cas: 'autre' },
  { nom: 'aucune variante', variantes: [], cas: null },
  { nom: 'toutes mesurées, un agrégat illisible', variantes: [v('winner', null, 150), maigre()], cas: null },
];

describe('diagnostic · pourquoi aucun verdict · un corpus qui couvre chaque cas', () => {
  it('chaque cas du corpus est rendu · le silence quand les données ne tranchent pas', () => {
    for (const c of CORPUS) expect(diagnosticFinPrevue(c.variantes, SEUIL)?.cas ?? null, c.nom).toBe(c.cas);
    expect(new Set(CORPUS.map((c) => c.cas)), 'préalable · chaque cas est couvert').toEqual(new Set(['sans-mesure', 'sous-minimum', 'partielles', 'autre', null]));
  });

  it('les phrases disent le cas mesuré · le minimum est écrit avec les réglages de la marque', () => {
    const p = (vs: VarianteFinPrevue[]) => phraseDiagnosticFinPrevue(3, diagnosticFinPrevue(vs, SEUIL), SEUIL);
    expect(p([sans(), sans()])).toBe('Lot #3 · aucune mesure reçue depuis le lancement');
    expect(p([maigre(), maigre()])).toBe(`Lot #3 · mesures reçues, sous le minimum du moteur (${(5000).toLocaleString('fr-FR')} impressions ou 105 € dépensés par variante)`);
    expect(p([maigre(), sans()]), 'la variante sans mesure n’est pas dite').toMatch(/sous le minimum du moteur .* · 1 variante sur 2 sans mesure$/);
    expect(p([v('winner'), sans(), sans()])).toBe('Lot #3 · 2 variantes sur 3 sans mesure');
    expect(p([v('winner'), maigre()])).toBe('Lot #3 · chaque variante a ses mesures, au moins une au-dessus du minimum du moteur');
    expect(p([])).toBeNull();
    const marque = { ...SEUIL, minImpressions: 15_000, targetCpa: 20 };
    expect(phraseMinimumMoteur(marque), 'le minimum n’est pas celui de la marque').toBe(`${(15_000).toLocaleString('fr-FR')} impressions ou 60 € dépensés par variante`);
  });

  it('le minimum est celui du MOTEUR · même verdict « trop peu de données » sur une grille, avec les réglages de la marque', () => {
    const marques = [SEUIL, { ...SEUIL, minImpressions: 15_000 }, { ...SEUIL, targetCpa: 12, minSpendMultiple: 2 }];
    const metrics = (spend: number, impressions: number): AdMetrics => ({
      spend, impressions, linkClicks: 0, purchases: 0, clicks: 0, reach: 0, purchaseValue: 0, video3s: 0, thruplays: 0, videoP50: 0, addToCart: 0, landingViews: 0,
    } as unknown as AdMetrics);
    let sousVus = 0, dessusVus = 0;
    for (const cfg of marques) for (const spend of [0, 10, 23.99, 24, 60, 104.99, 105, 400]) for (const impressions of [0, 900, 4999, 5000, 14_999, 15_000, 40_000]) {
      const moteur = computeVerdict({ metrics: metrics(spend, impressions), config: cfg, brandMedians: {}, comparable: true }).reason.startsWith('Trop peu de données');
      const regle = sousLeMinimumDuMoteur({ spend, impressions }, cfg);
      expect(regle, `minimum divergent du moteur · ${spend} €, ${impressions} impressions, cible ${cfg.targetCpa}`).toBe(moteur);
      const d = diagnosticFinPrevue([v('inconclusive', impressions, spend)], cfg)!;
      expect(d.cas === 'sous-minimum', `le diagnostic ne lit pas le minimum du moteur · ${spend} €, ${impressions}`).toBe(moteur);
      if (moteur) sousVus++; else dessusVus++;
    }
    expect(sousVus > 10 && dessusVus > 10, 'préalable · la grille traverse le minimum').toBe(true);
    // Indépendant du moteur · la règle 2 exige les DEUX manques (dépense ET impressions).
    expect(sousLeMinimumDuMoteur({ spend: 150, impressions: 900 }, SEUIL), 'la dépense atteinte ne sort pas du minimum').toBe(false);
    expect(sousLeMinimumDuMoteur({ spend: 12, impressions: 20_000 }, SEUIL), 'les impressions atteintes ne sortent pas du minimum').toBe(false);
    expect(sousLeMinimumDuMoteur({ spend: 104.99, impressions: 4999 }, SEUIL)).toBe(true);
  });
});

describe('sources et geste · l’import EXISTANT, ouvert sur ce lot', () => {
  const LOT = { id: 'lot/a b', numero: 4 };
  it('aucune source · brouillons, ou aucune variante sur Meta · dit, jamais un écran vide', () => {
    expect(sourcesImportLot([sans({ statut: 'draft' }), sans({ statut: 'draft' })])).toEqual({ ok: false, raison: 'aucune source d’import · ses variantes sont en brouillon, rien n’a été diffusé' });
    expect(sourcesImportLot([sans({ plateforme: 'tiktok' }), sans({ plateforme: 'google' })])).toEqual({ ok: false, raison: 'aucune source d’import · TikTok et Google n’a encore ni connexion ni export, seul Meta remonte des mesures' });
    expect(sourcesImportLot([sans({ plateforme: 'tiktok' }), sans(), sans({ statut: 'draft' })])).toEqual({ ok: true, importables: 1 });
  });

  it('le geste · ouvert (lien vers l’import sur ce lot), fermé (raison), sans source, rien pour « autre » et au silence', () => {
    const d = diagnosticFinPrevue([sans()], SEUIL);
    expect(lienImportLot(LOT.id)).toBe(`${CHEMIN_IMPORT_RESULTATS}?${PARAM_LOT_IMPORT}=lot%2Fa%20b`);
    expect(gesteFinPrevue(LOT, d, { ok: true, importables: 1 }, { refus: null })).toEqual({ etat: 'ouvert', libelle: 'Importer les mesures du lot #4', href: '/adsmap/import?lot=lot%2Fa%20b' });
    expect(gesteFinPrevue(LOT, d, { ok: true, importables: 1 }, { refus: 'role' })).toEqual({ etat: 'ferme', libelle: 'Importer les mesures du lot #4', raison: RAISON_IMPORT_FERME.role });
    expect(gesteFinPrevue(LOT, d, { ok: true, importables: 1 }, { refus: 'plan' })?.etat).toBe('ferme');
    expect(gesteFinPrevue(LOT, d, { ok: false, raison: 'x' }, { refus: 'role' }), 'l’absence de source passe après le droit').toEqual({ etat: 'sans-source', raison: 'x' });
    expect(gesteFinPrevue(LOT, diagnosticFinPrevue([maigre()], SEUIL), { ok: true, importables: 1 }, { refus: null })?.etat, 'sous le minimum · l’import reste le geste').toBe('ouvert');
    expect(gesteFinPrevue(LOT, diagnosticFinPrevue([v('winner')], SEUIL), { ok: true, importables: 1 }, { refus: null }), '« autre » · l’import n’y répond pas').toBeNull();
    expect(gesteFinPrevue(LOT, null, { ok: true, importables: 1 }, { refus: null }), 'silence · aucun geste').toBeNull();
  });

  it('sans source · la phrase le dit, à la suite du cas mesuré', () => {
    const f = finPrevueAccueil({ lot: LOT, variantes: [sans({ plateforme: 'tiktok' })], seuil: SEUIL, acces: { refus: null } });
    expect(f.texte).toBe('Lot #4 · aucune mesure reçue depuis le lancement · aucune source d’import · TikTok n’a encore ni connexion ni export, seul Meta remonte des mesures');
    expect(f.geste?.etat).toBe('sans-source');
  });
});

describe('l’Accueil · « En diffusion » porte le diagnostic et le geste du PREMIER lot à fin prévue passée', () => {
  const NOW = new Date('2026-10-27T12:00:00Z');
  const il = (j: number) => new Date(NOW.getTime() - j * 86_400_000).toISOString();
  const lotA = (id: string, numero: number, fin: number): LotAccueil => ({ id, numero, statut: 'testing', but: null, lanceLe: il(20), finPrevue: il(fin), variantes: 2, vignette: null });
  const LOTS = [lotA('recent', 7, 1), lotA('ancien', 3, 5), { ...lotA('court', 2, 1), finPrevue: null }];
  const comptes = { tests: 2, avecHypothese: 2, aArbitrer: 0, arbitres: 0, apprentissages: 0 };
  const zero = { n: 0, lots: [] };
  const diffusion = (finPrevue: Parameters<typeof etapesBoucleAccueil>[0]['finPrevue']) =>
    etapesBoucleAccueil({ comptes, lots: LOTS, aConclure: zero, maintenant: NOW, lotsOuverts: true, finPrevue }).find((e) => e.cle === 'diffusion')!;

  it('geste ouvert · le lien et le bouton de l’étape mènent à l’import sur ce lot · le libellé #1080 reste mot pour mot', () => {
    expect(lotsFinPrevuePassee(LOTS, NOW, zero).map((l) => l.id), 'préalable · le plus ancien d’abord').toEqual(['ancien', 'recent']);
    const avant = diffusion(null);
    const f = finPrevueAccueil({ lot: { id: 'ancien', numero: 3 }, variantes: [sans(), sans()], seuil: SEUIL, acces: { refus: null } });
    const d = diffusion(f);
    expect(d.sous, 'le libellé de #1080 a changé').toBe(avant.sous);
    expect(d.sous).toBe(phraseFinPrevuePassee([{ numero: 3 }, { numero: 7 }]));
    expect(d.href, 'l’étape ne mène pas à l’import sur ce lot').toBe('/adsmap/import?lot=ancien');
    expect(d.action).toBe('Importer les mesures du lot #3');
    expect(d.finPrevue).toEqual({ texte: 'Lot #3 · aucune mesure reçue depuis le lancement', ferme: null });
    expect(avant.href, 'préalable · sans diagnostic, le lien du lot').toBe(lienLotApercu('ancien'));
    expect(avant.action).toBeNull();
    expect('finPrevue' in avant, 'sans diagnostic, rien n’est ajouté à l’étape').toBe(false);
  });

  it('geste fermé · le lien reste celui du lot, aucun bouton actif, le contrôle fermé et sa raison', () => {
    const d = diffusion(finPrevueAccueil({ lot: { id: 'ancien', numero: 3 }, variantes: [maigre(), sans()], seuil: SEUIL, acces: { refus: 'role' } }));
    expect(d.href).toBe(lienLotApercu('ancien'));
    expect(d.action, 'un bouton actif pour un import fermé').toBeNull();
    expect(d.finPrevue?.ferme).toEqual({ libelle: 'Importer les mesures du lot #3', raison: RAISON_IMPORT_FERME.role });
    expect(d.finPrevue?.texte).toMatch(/^Lot #3 · mesures reçues, sous le minimum du moteur/);
  });

  it('un diagnostic d’un AUTRE lot est ignoré · « autre » et le silence n’ajoutent aucun geste', () => {
    const autreLot = diffusion(finPrevueAccueil({ lot: { id: 'recent', numero: 7 }, variantes: [sans()], seuil: SEUIL, acces: { refus: null } }));
    expect(autreLot.href, 'le geste d’un autre lot est posé').toBe(lienLotApercu('ancien'));
    expect('finPrevue' in autreLot).toBe(false);
    const autre = diffusion(finPrevueAccueil({ lot: { id: 'ancien', numero: 3 }, variantes: [v('winner'), v('loser')], seuil: SEUIL, acces: { refus: null } }));
    expect(autre.action).toBeNull();
    expect(autre.finPrevue?.texte).toBe('Lot #3 · chaque variante a ses mesures, au moins une au-dessus du minimum du moteur');
    const silence = diffusion(finPrevueAccueil({ lot: { id: 'ancien', numero: 3 }, variantes: [], seuil: SEUIL, acces: { refus: null } }));
    expect('finPrevue' in silence || silence.action !== null, 'le silence ajoute quelque chose').toBe(false);
  });
});

describe('l’écran d’import ouvert sur un lot', () => {
  it('le paramètre ne vaut que pour un lot LU dans la portée · sinon ignoré', () => {
    const lots = [{ id: 'a' }, { id: 'b' }];
    expect(lotCibleImport(lots, 'b')).toEqual({ id: 'b' });
    expect(lotCibleImport(lots, ['a', 'b'])).toEqual({ id: 'a' });
    for (const x of ['c', '', undefined, null, 3, {}]) expect(lotCibleImport(lots, x), `paramètre ${String(x)} retenu`).toBeNull();
  });

  it('chaque variante dit son état · la même lecture que le diagnostic', () => {
    expect(etatVarianteImport(sans({ statut: 'draft' }), SEUIL)).toBe('brouillon');
    expect(etatVarianteImport(sans({ plateforme: 'tiktok' }), SEUIL)).toBe('hors-meta');
    expect(etatVarianteImport(sans(), SEUIL)).toBe('sans-mesure');
    expect(etatVarianteImport(v(null, null, null), SEUIL)).toBe('sans-mesure');
    expect(etatVarianteImport(maigre(), SEUIL)).toBe('sous-minimum');
    expect(etatVarianteImport(v('winner'), SEUIL)).toBe('mesuree');
    const l = lotImport({ id: 'x', numero: 2, but: ' Preuve ' }, [{ ...sans(), code: 'v1', nomRegie: 'N_B2_v1' }, { ...maigre(), code: 'v2', nomRegie: null }], SEUIL);
    expect(l).toMatchObject({ titre: 'Lot #2 · Preuve', sansSource: null, diagnostic: expect.stringMatching(/^Lot #2 · mesures reçues, sous le minimum du moteur .* · 1 variante sur 2 sans mesure$/) });
    expect(l.variantes.map((x) => `${x.code}:${x.libelle}`)).toEqual(['v1:Sans mesure', 'v2:Sous le minimum du moteur']);
    expect(lotImport({ id: 'y', numero: 5, but: null }, [{ ...sans({ statut: 'draft' }), code: 'v1', nomRegie: null }], SEUIL).sansSource).toBe('Lot #5 · aucune source d’import · ses variantes sont en brouillon, rien n’a été diffusé');
  });

  it('après l’aperçu d’un export · combien d’annonces vont au lot', () => {
    const a = (lot: number | null) => ({ cible: lot === null ? null : { lot } });
    expect(phraseAnnoncesDuLot(3, [a(3), a(3), a(4), a(null)])).toBe('2 annonces de ce fichier vont aux variantes du lot #3.');
    expect(phraseAnnoncesDuLot(4, [a(3), a(4)])).toBe('1 annonce de ce fichier va aux variantes du lot #4.');
    expect(phraseAnnoncesDuLot(9, [a(3)])).toBe('Aucune annonce de ce fichier ne va au lot #9 · vérifie le nom régie ou l’identifiant Meta de ses variantes.');
  });
});
