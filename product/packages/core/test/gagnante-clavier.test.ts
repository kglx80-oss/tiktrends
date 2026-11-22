import { describe, it, expect } from 'vitest';
import {
  LIBELLE_ITERER_GAGNANTE, RACCOURCIS, RAISON_GAGNANTE_AUTRE_MARQUE, RAISON_GESTE_SANS_GAGNANTE_LOT, RAISON_HORS_PLAN, RAISON_ROLE_ITERATION,
  conclusionLot, etatLotSpatial, gagnantesDeLaLignee, gestesClavierLot, gestesGagnantesLot, gestesParAdDeLaLignee, lienIterationDepuis, lienIterationVariable,
  libelleToucheIterer, lireNaissanceGagnante, messageRaccourciFerme, neeDeGagnanteRelue, phraseNeeDeGagnante, projeterLignee, referenceConclusion, resultatsDeLaLignee,
  sansTiretCadratin,
  type AdRelueGagnante, type DonneesVariantes, type FaitsAdSpatial, type FaitsLotSpatialEntier, type LotPourGagnante, type NaissanceGagnante, type TestLu, type VarianteLue,
} from '../src';

/**
 * Itérer depuis la gagnante AU CLAVIER et SUR LA CARTE DE LIGNÉE · en pur.
 *
 *  · la touche T d'un lot CONCLU avec une gagnante ouvre LE MÊME geste que le
 *    bouton de sa variante (la même adresse, les mêmes raisons) · son libellé
 *    NOMME la variante · un lot pas conclu · T inchangé (lot 13 bis) ;
 *  · la carte de lignée · « née de la gagnante Vx » sur le nœud d'une
 *    itération partie d'une gagnante RELUE dans la marque · rien sinon · le
 *    geste de la fiche du lot sur le nœud d'une gagnante arbitrée d'un lot conclu.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ad = (id: string, variante: string, v: 'winner' | 'loser' | null, statut: 'validated' | 'computed' = 'validated'): FaitsAdSpatial => ({
  id, variante, statut: 'done', hypothese: `Si on teste ${variante}, alors ça baisse, parce que.`, variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: statut === 'validated' ? v : null, statut, comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null,
});
const brut = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatialEntier => ({ id, numero, but: null, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null });
const CTX = { maintenant: new Date('2026-11-09T00:00:00Z'), fenetreJours: 14 };
const REF = brut(u(900), 1, Array.from({ length: 8 }, (_, i) => ad(u(800 + i), `r${i}`, i === 0 ? 'winner' : 'loser')));
function lu(l: FaitsLotSpatialEntier): LotPourGagnante {
  const etat = etatLotSpatial(l, CTX);
  return { id: l.id, numero: l.numero, etat, conclusion: conclusionLot(l, etat, referenceConclusion([l, REF], l.id)), ads: l.ads };
}
/** C · confirmé · C1 perdante, C2 C3 C4 gagnantes arbitrées · A · à conclure (C2 du moteur seulement, A1 arbitrée gagnante). */
const C = lu(brut(u(1), 41, [ad(u(11), 'C1', 'loser'), ad(u(12), 'C2', 'winner'), ad(u(13), 'C3', 'winner'), ad(u(14), 'C4', 'winner')]));
const A = lu(brut(u(2), 42, [ad(u(21), 'A1', 'winner'), ad(u(22), 'A2', 'winner', 'computed'), ad(u(23), 'A3', 'loser', 'computed')]));
const O = { marqueActive: true, peutIterer: true };
const TOUS = new Set([...C.ads, ...A.ads].map((a) => a.id));
const clavier = (l: LotPourGagnante, o: { gagnante?: string; depuisGagnante?: Parameters<typeof gestesClavierLot>[0]['depuisGagnante'] } = {}) =>
  gestesClavierLot({ etat: l.etat, ads: l.ads, planIds: TOUS, ...o }).iterer;

describe('préalables · les conclusions calculées par la vraie règle', () => {
  it('C conclu et confirmé · A pas encore conclu', () => {
    expect([C.etat, C.conclusion?.conclusion, A.etat]).toEqual(['conclu', 'confirmee', 'a_conclure']);
  });
});

describe('la touche T · un lot CONCLU avec une gagnante · LE MÊME geste que le bouton de sa variante', () => {
  it('ouvert · la même adresse que le geste de la variante (pas une copie · celle du geste) · le libellé nomme la variante', () => {
    const g = gestesGagnantesLot(C, O);
    const t = clavier(C, { depuisGagnante: g });
    expect(t, 'T n’ouvre pas le geste de la première gagnante du lot').toEqual({ href: g[u(12)]!.href, adId: u(12), raison: null, libelle: 'Itérer depuis C2' });
    expect(t.href).toBe(lienIterationDepuis('lot', { id: C.id, adId: u(12) }));
    expect(t.href, 'T ouvre encore `?iter=`').not.toBe(lienIterationVariable({ adId: u(12) }));
  });
  it('la gagnante du verdict d’abord · puis l’ordre du lot', () => {
    const g = gestesGagnantesLot(C, O);
    expect(clavier(C, { depuisGagnante: g, gagnante: u(14) }).adId, 'la gagnante du verdict n’est pas essayée la première').toBe(u(14));
    expect(clavier(C, { depuisGagnante: g, gagnante: u(11) }).adId, 'une perdante annoncée gagnante est prise').toBe(u(12));
  });
  it('la première OUVERTE · une gagnante que le plan exclut cède sa place · toutes fermées · la première, fermée avec SA raison', () => {
    const plan = (adId: string) => (adId === u(12) ? { exclue: RAISON_HORS_PLAN, suiteEnTest: 'C9' } : { exclue: null, suiteEnTest: null });
    const g = gestesGagnantesLot(C, { ...O, plan });
    expect(clavier(C, { depuisGagnante: g, gagnante: u(12) }), 'T ouvre une gagnante exclue par le plan').toEqual({ href: g[u(13)]!.href, adId: u(13), raison: null, libelle: 'Itérer depuis C3' });
    const role = gestesGagnantesLot(C, { ...O, peutIterer: false });
    expect(clavier(C, { depuisGagnante: role }), 'sans le rôle · pas la raison du geste').toEqual({ href: null, adId: u(12), raison: RAISON_ROLE_ITERATION, libelle: 'Itérer depuis C2' });
    const exclues = gestesGagnantesLot(C, { ...O, plan: () => ({ exclue: RAISON_HORS_PLAN, suiteEnTest: null }) });
    expect(clavier(C, { depuisGagnante: exclues }).raison, 'tout exclu · pas la raison du plan').toBe(RAISON_HORS_PLAN);
  });
  it('un lot PAS conclu (aucun geste de gagnante) · T inchangé · `?iter=` de la gagnante arbitrée · sans gagnante · la raison d’avant', () => {
    expect(gestesGagnantesLot(A, O), 'préalable · un lot à conclure a un geste').toEqual({});
    const avant = gestesClavierLot({ etat: A.etat, ads: A.ads, planIds: TOUS }).iterer;
    expect(avant).toEqual({ href: lienIterationVariable({ adId: u(21) }), adId: u(21), raison: null });
    expect(clavier(A, { depuisGagnante: gestesGagnantesLot(A, O) }), 'des gestes vides changent T').toEqual(avant);
    expect(clavier(A, { depuisGagnante: null }), 'null change T').toEqual(avant);
    expect(gestesClavierLot({ etat: 'diffusion', ads: [ad(u(31), 'D1', null)], planIds: TOUS, depuisGagnante: {} }).iterer).toEqual({ href: null, adId: null, raison: RAISON_GESTE_SANS_GAGNANTE_LOT });
  });
  it('deux libellés DISTINCTS · la touche nomme la variante, le bouton de la ligne garde le sien · l’aide dit la règle · sans tiret cadratin', () => {
    expect(libelleToucheIterer('C2')).not.toBe(LIBELLE_ITERER_GAGNANTE);
    expect(libelleToucheIterer('C2')).toContain('C2');
    const t = RACCOURCIS.find((r) => r.id === 'lot-iterer')!;
    expect(t.libelle, 'l’aide « ? » ne dit pas que T suit le geste de la gagnante, fermé pour les mêmes raisons').toMatch(/lot conclu · le même geste que le bouton de sa gagnante, fermé pour les mêmes raisons/);
    expect(messageRaccourciFerme(t, RAISON_ROLE_ITERATION).endsWith(RAISON_ROLE_ITERATION), 'le toast ne dit pas la raison du geste').toBe(true);
    for (const x of [t.libelle, libelleToucheIterer('V3'), phraseNeeDeGagnante('V7')]) expect(sansTiretCadratin(x), x).toBe(x);
  });
});

/* ───────────────────────── la carte de lignée ───────────────────────── */

const COM = u(501); const NOTE = u(502); const P = u(503);
describe('lire la naissance · `depuisGagnante` (#1085) ou `gagnanteAdId` d’un fil (#1083) · identifiants seuls', () => {
  it('les trois formes · rien sans gagnante · un JSON abîmé · rien', () => {
    expect(lireNaissanceGagnante({ depuisGagnante: { source: 'lot', lotId: C.id, gagnanteAdId: u(12) } })).toEqual({ source: 'lot', lotId: C.id, gagnanteAdId: u(12) });
    expect(lireNaissanceGagnante({ depuisGagnante: { source: 'hypothese', lotId: C.id, hypotheseAdId: u(13), gagnanteAdId: u(13) } })).toEqual({ source: 'hypothese', lotId: C.id, gagnanteAdId: u(13) });
    expect(lireNaissanceGagnante({ commentaire: { commentaireId: COM, projetId: P, gagnanteAdId: u(12) } })).toEqual({ source: 'commentaire', filId: COM, projetId: P, gagnanteAdId: u(12) });
    expect(lireNaissanceGagnante({ note: { noteId: NOTE, projetId: P, gagnanteAdId: u(12) } })).toEqual({ source: 'note', filId: NOTE, projetId: P, gagnanteAdId: u(12) });
    expect(lireNaissanceGagnante({ commentaire: { commentaireId: COM, projetId: P } }), 'la pub du fil n’est pas une gagnante').toBeNull();
    for (const x of [null, 'x', {}, { depuisGagnante: { source: 'lot', lotId: 'pas-un-uuid', gagnanteAdId: u(12) } }, { note: { noteId: NOTE, gagnanteAdId: u(12) } }]) expect(lireNaissanceGagnante(x), JSON.stringify(x)).toBeNull();
  });
});

describe('relire la gagnante dans la marque du projet · rien n’est cru du JSON', () => {
  const relues = new Map<string, AdRelueGagnante>([
    [u(12), { id: u(12), variante: 'C2', lotId: C.id }],
    [u(61), { id: u(61), variante: 'F1', lotId: C.id, commentaire: { commentaireId: COM, projetId: P } }],
    [u(62), { id: u(62), variante: 'N1', lotId: null, note: { noteId: NOTE, projetId: P } }],
  ]);
  const relue = (id: string) => relues.get(id);
  const lot = (g: string, lotId = C.id): NaissanceGagnante => ({ source: 'lot', lotId, gagnanteAdId: g });
  it('lot ou carte · la gagnante de la marque, dans le lot nommé · autre lot, absente de la marque, elle-même · rien', () => {
    expect(neeDeGagnanteRelue(u(70), lot(u(12)), relue)).toBe('C2');
    expect(neeDeGagnanteRelue(u(70), { source: 'hypothese', lotId: C.id, gagnanteAdId: u(12) }, relue)).toBe('C2');
    expect(neeDeGagnanteRelue(u(70), lot(u(12), A.id), relue), 'une gagnante d’un autre lot').toBeNull();
    expect(neeDeGagnanteRelue(u(70), lot(u(99)), relue), 'une gagnante d’une autre marque (introuvable)').toBeNull();
    expect(neeDeGagnanteRelue(u(12), lot(u(12)), relue), 'née d’elle-même').toBeNull();
    expect(neeDeGagnanteRelue(u(70), null, relue)).toBeNull();
  });
  it('fil · la gagnante née du MÊME fil (même identifiant, même projet) · un autre fil, un autre projet, une ad sans fil · rien', () => {
    const c = (filId: string, projetId = P): NaissanceGagnante => ({ source: 'commentaire', filId, projetId, gagnanteAdId: u(61) });
    expect(neeDeGagnanteRelue(u(70), c(COM), relue)).toBe('F1');
    expect(neeDeGagnanteRelue(u(70), c(u(599)), relue), 'un autre commentaire').toBeNull();
    expect(neeDeGagnanteRelue(u(70), c(COM, u(598)), relue), 'un autre projet').toBeNull();
    expect(neeDeGagnanteRelue(u(70), { source: 'note', filId: NOTE, projetId: P, gagnanteAdId: u(62) }, relue)).toBe('N1');
    expect(neeDeGagnanteRelue(u(70), { source: 'note', filId: COM, projetId: P, gagnanteAdId: u(61) }, relue), 'une note qui nomme un commentaire').toBeNull();
    expect(neeDeGagnanteRelue(u(70), { source: 'commentaire', filId: COM, projetId: P, gagnanteAdId: u(12) }, relue), 'une gagnante sans fil').toBeNull();
  });
});

/** La lignée · trois créations testées · va1 (C2, gagnante du lot C), va2 (C1, perdante), va3 (l'itération X, hors lot), va4 (sans test). */
const test = (o: Partial<TestLu> & Pick<TestLu, 'linkId' | 'adsmapAdId'>): TestLu => ({
  adStatus: 'live', hypothese: 'h', variable: 'hook', valeurVariable: null, objectif: null, protocole: null, periode: null, metrique: null, isolation: null, verdict: null, lot: null, ...o,
});
const variante = (o: Partial<VarianteLue> & Pick<VarianteLue, 'id' | 'position'>): VarianteLue => ({
  versionId: 'v1', jobId: 'j1', lot: 1, assetId: `a_${o.id}`, parentVariantId: null, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
  hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-05', test: null, lecture: null, relecture: null, ...o,
});
const X = u(70);
const DONNEES: DonneesVariantes = {
  projet: { id: 'p1', titre: 'Sérum', versionCouranteId: 'v1' },
  versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' }],
  lots: [{ jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-02', attendues: 4, sorties: [] }],
  variantes: [
    variante({ id: u(101), position: 1, test: test({ linkId: 't1', adsmapAdId: u(12), lot: { id: C.id, numero: 41, statut: 'analyzed' } }) }),
    variante({ id: u(102), position: 2, test: test({ linkId: 't2', adsmapAdId: u(11), lot: { id: C.id, numero: 41, statut: 'analyzed' } }) }),
    variante({ id: u(103), position: 3, test: test({ linkId: 't3', adsmapAdId: X }) }),
    variante({ id: u(104), position: 4 }),
  ],
  adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] }, droits: { proposer: true }, relecture: { disponible: false, raison: null, coutMaxUsd: null },
};
const M = projeterLignee({ projet: { id: 'p1', titre: 'Sérum', marque: 'Neva' }, sources: [], briefs: {}, donnees: DONNEES });
const testDe = (id: string) => DONNEES.variantes.find((v) => v.id === id)?.test?.adsmapAdId ?? null;
const R = resultatsDeLaLignee(M, testDe);
const RELUES = new Map<string, AdRelueGagnante>();
for (const a of C.ads) RELUES.set(a.id, { id: a.id, variante: a.variante, lotId: C.id });
for (const a of A.ads) RELUES.set(a.id, { id: a.id, variante: a.variante, lotId: A.id });
const NAISSANCES = new Map<string, NaissanceGagnante>([[X, { source: 'lot', lotId: C.id, gagnanteAdId: u(12) }]]);
const carte = (o = O, naissances = NAISSANCES, lots: LotPourGagnante[] = [C, A]) => gagnantesDeLaLignee(R, { naissances, relue: (id) => RELUES.get(id), lots, o });

describe('la carte de lignée · « née de la gagnante » sur le bon nœud, le geste sur le nœud gagnant · rien ailleurs', () => {
  it('les nœuds « Résultat » et leur pub de test · une création sans test n’en a pas', () => {
    expect(R).toEqual([
      { noeud: `resultat:${u(101)}`, adId: u(12), enLot: true },
      { noeud: `resultat:${u(102)}`, adId: u(11), enLot: true },
      { noeud: `resultat:${u(103)}`, adId: X, enLot: false },
    ]);
  });
  it('X · « née de la gagnante C2 » · C2 · le geste de la fiche du lot (même adresse) · C1, perdante · rien · aucun autre nœud', () => {
    const c = carte();
    const fiche = gestesGagnantesLot(C, O);
    expect(c).toEqual({
      [`resultat:${u(103)}`]: { neeDe: 'C2' },
      [`resultat:${u(101)}`]: { geste: { geste: fiche[u(12)], variante: 'C2' } },
    });
    expect(c[`resultat:${u(101)}`]!.geste!.geste.href).toBe(lienIterationDepuis('lot', { id: C.id, adId: u(12) }));
    expect(gestesParAdDeLaLignee(R, c), 'les gestes par pub (le plan à lire)').toEqual({ [u(12)]: fiche[u(12)] });
  });
  it('les portes de la fiche · autre marque active · fermé, sa raison · sans le rôle · la raison du rôle · le plan · sa phrase et la suite signalée', () => {
    expect(carte({ ...O, marqueActive: false })[`resultat:${u(101)}`]!.geste!.geste).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_GAGNANTE_AUTRE_MARQUE });
    expect(carte({ ...O, peutIterer: false })[`resultat:${u(101)}`]!.geste!.geste.raison).toBe(RAISON_ROLE_ITERATION);
    const plan = () => ({ exclue: RAISON_HORS_PLAN, suiteEnTest: 'C9' });
    expect(carte({ ...O, plan } as typeof O)[`resultat:${u(101)}`]!.geste!.geste).toEqual({ libelle: LIBELLE_ITERER_GAGNANTE, href: null, raison: RAISON_HORS_PLAN, signal: 'Déjà une suite en test · C9' });
    expect(carte({ ...O, marqueActive: false })[`resultat:${u(103)}`], 'la naissance ne dépend pas de la marque active').toEqual({ neeDe: 'C2' });
  });
  it('rien · un lot pas conclu · une naissance forgée (autre lot, autre marque) · aucune naissance ni lot', () => {
    const pasConclu = { ...C, etat: 'diffusion' as const };
    expect(carte(O, NAISSANCES, [pasConclu, A]), 'un geste sur un lot pas conclu').toEqual({ [`resultat:${u(103)}`]: { neeDe: 'C2' } });
    expect(carte(O, new Map([[X, { source: 'lot', lotId: A.id, gagnanteAdId: u(12) }]])), 'une gagnante d’un autre lot').not.toHaveProperty(`resultat:${u(103)}`);
    expect(carte(O, new Map([[X, { source: 'lot', lotId: C.id, gagnanteAdId: u(999) }]])), 'une gagnante hors de la marque').not.toHaveProperty(`resultat:${u(103)}`);
    expect(gagnantesDeLaLignee(R, { naissances: new Map(), relue: () => undefined, lots: [], o: O }), 'sans rien à dire, rien n’est ajouté').toEqual({});
  });
});
