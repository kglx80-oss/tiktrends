import { describe, expect, it } from 'vitest';
import {
  conclusionLot, lectureIntervalles, referenceConclusion, issueVariante, ecartAuLot, structureVariante, butLotDuplique, wilsonInterval,
  NIVEAU_CONCLUSION_LOT, MIN_VARIANTES_CONCLUSION, MIN_REFERENCE_CONCLUSION, ERREUR_TOLEREE_CONCLUSION,
  etatApprentissage, actionApprentissage, tiroirApprentissage, regleDepuisApprentissage, refusVersRegles,
  dansFiltreEtatApprentissage, FILTRES_ETAT_APPRENTISSAGE, regleDejaPresente, lireReglesMarque, LONGUEUR_MAX_REGLES, lienIterationStudio,
  type FaitsAdSpatial, type FaitsLotSpatial, type FaitsVerdictSpatial, type VerdictValue, type FaitsApprentissage,
} from '../src';

const verdict = (calcule: VerdictValue | null, o: Partial<FaitsVerdictSpatial> = {}): FaitsVerdictSpatial => ({
  calcule, retenu: null, statut: 'computed', comparable: true, raison: 'r', depense: 100, impressions: 6000, achats: 3, cpa: 30, ...o,
});
let seq = 0;
const ad = (v: FaitsVerdictSpatial | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id: `a${++seq}`, variante: `v${seq}`, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: 't', image: null, manques: [], verdict: v, ...o,
});
/** Un lot de `k` gagnantes et `n - k` perdantes, toutes au protocole. */
const lotDe = (k: number, n: number, o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({
  id: `l${++seq}`, numero: seq, but: null, statut: 'analyzed', lanceLe: '2026-10-01T00:00:00Z', protocole: null,
  ads: Array.from({ length: n }, (_, i) => ad(verdict(i < k ? 'winner' : 'loser'))), ...o,
});
const ref = (k: number, n: number) => ({ k, n });

describe('conclusion d’un lot · confirmée, infirmée, non concluante, contre la référence de la marque', () => {
  it('4 gagnantes sur 4 contre 1 sur 10 · confirmée, et la phrase dit les deux comptes', () => {
    const c = conclusionLot(lotDe(4, 4), 'conclu', ref(1, 10));
    expect(c.conclusion).toBe('confirmee');
    expect(c.titre).toBe('Hypothèse confirmée');
    expect(c.phrase).toContain('4 gagnantes sur 4 variantes tranchées');
    expect(c.phrase).toContain('1 sur 10 dans ses autres lots');
    expect(c.lot!.intervalle.lo).toBeGreaterThan(c.reference!.intervalle.hi);
  });
  it('0 gagnante sur 6 contre 8 sur 10 · infirmée', () => {
    const c = conclusionLot(lotDe(0, 6), 'a_conclure', ref(8, 10));
    expect(c.conclusion).toBe('infirmee');
    expect(c.titre).toBe('Hypothèse infirmée');
    expect(c.phrase).toContain('nettement en dessous');
  });
  it('2 sur 4 contre 4 sur 10 · les intervalles se recoupent · non concluante (le silence est une conclusion)', () => {
    const c = conclusionLot(lotDe(2, 4), 'conclu', ref(4, 10));
    expect(c.conclusion).toBe('non_concluante');
    expect(c.motif).toBe('lecture');
    expect(c.phrase).toContain('reste dans le bruit');
  });
  it('jamais comparé à zéro · 4 sur 4 contre une référence de 4 sur 4 ne confirme rien', () => {
    expect(conclusionLot(lotDe(4, 4), 'conclu', ref(4, 4)).conclusion).toBe('non_concluante');
  });
});

describe('conclusion d’un lot · effectif minimum, aux bornes', () => {
  it(`${MIN_VARIANTES_CONCLUSION - 1} variantes tranchées · le lot n’a pas le droit de conclure, même 3 sur 3`, () => {
    const c = conclusionLot(lotDe(MIN_VARIANTES_CONCLUSION - 1, MIN_VARIANTES_CONCLUSION - 1), 'conclu', ref(0, 40));
    expect(c.conclusion).toBe('non_concluante');
    expect(c.motif).toBe('effectif');
    expect(c.phrase).toBe(`3 variantes tranchées au protocole · il en faut ${MIN_VARIANTES_CONCLUSION} pour qu’un lot ait le droit de conclure.`);
  });
  it(`${MIN_VARIANTES_CONCLUSION} variantes tranchées · le lot parle`, () => {
    expect(conclusionLot(lotDe(MIN_VARIANTES_CONCLUSION, MIN_VARIANTES_CONCLUSION), 'conclu', ref(0, 40)).conclusion).toBe('confirmee');
  });
  it(`référence de ${MIN_REFERENCE_CONCLUSION - 1} verdicts · la marque ne sert pas de référence · à ${MIN_REFERENCE_CONCLUSION}, elle sert`, () => {
    const c = conclusionLot(lotDe(6, 6), 'conclu', ref(0, MIN_REFERENCE_CONCLUSION - 1));
    expect(c.motif).toBe('reference');
    expect(c.phrase).toBe(`La marque n’a que 3 verdicts tranchés dans ses autres lots · il en faut ${MIN_REFERENCE_CONCLUSION} pour servir de référence.`);
    expect(conclusionLot(lotDe(6, 6), 'conclu', ref(0, MIN_REFERENCE_CONCLUSION)).conclusion).toBe('confirmee');
  });
  it('à la borne de l’intervalle · confirmée SI ET SEULEMENT SI le bas du lot dépasse STRICTEMENT le haut de la référence (balayage exhaustif)', () => {
    for (let n = MIN_VARIANTES_CONCLUSION; n <= 7; n++) for (let k = 0; k <= n; k++) for (let R = MIN_REFERENCE_CONCLUSION; R <= 12; R++) for (let kr = 0; kr <= R; kr++) {
      const il = wilsonInterval(k, n, NIVEAU_CONCLUSION_LOT), ir = wilsonInterval(kr, R, NIVEAU_CONCLUSION_LOT);
      const attendu = il.lo > ir.hi ? 'confirmee' : il.hi < ir.lo ? 'infirmee' : 'non_concluante';
      expect(conclusionLot(lotDe(k, n), 'conclu', ref(kr, R)).conclusion, `${k}/${n} contre ${kr}/${R}`).toBe(attendu);
    }
  });
  it('un témoin, un verdict hors protocole, un non concluant, une prometteuse relative ne comptent pas', () => {
    const l = lotDe(3, 3);
    l.ads.push(
      ad(verdict('winner'), { variable: 'none_control' }),
      ad(verdict('winner', { comparable: false })),
      ad(verdict('loser', { comparable: false })),
      ad(verdict('inconclusive')),
      ad(verdict('relative_winner')),
    );
    expect(l.ads.map(issueVariante)).toEqual(['gagne', 'gagne', 'gagne', null, null, null, null, null]);
    expect(conclusionLot(l, 'conclu', ref(0, 40)).motif).toBe('effectif');
  });
  it('le verdict ARBITRÉ fait foi sur le calculé', () => {
    const l = lotDe(0, 4);
    for (const a of l.ads) a.verdict = verdict('loser', { retenu: 'winner', statut: 'validated' });
    expect(conclusionLot(l, 'conclu', ref(0, 40)).conclusion).toBe('confirmee');
  });
});

describe('conclusion d’un lot · quand il n’y a rien à lire', () => {
  it('en préparation, en diffusion, mesures à importer · pas encore de conclusion, et elle dit quand', () => {
    for (const e of ['composition', 'pret', 'diffusion', 'a_importer'] as const) {
      const c = conclusionLot(lotDe(4, 4), e, ref(0, 40));
      expect(c.conclusion).toBe('en_attente');
      expect(c.phrase).toBe('Le lot conclut quand sa fenêtre est écoulée et que chaque variante a son verdict.');
    }
  });
  it('un historique importé ne confirme rien', () => {
    expect(conclusionLot(lotDe(4, 4), 'importe', ref(0, 40))).toMatchObject({ conclusion: 'non_concluante', motif: 'importe' });
  });
  it('la référence lit les AUTRES lots suivis · jamais le lot lui-même, jamais un historique importé', () => {
    const moi = lotDe(4, 4), autre = lotDe(1, 5), importe = lotDe(3, 3, { statut: 'analyzed', lanceLe: null });
    expect(referenceConclusion([moi, autre, importe], moi.id)).toEqual({ k: 1, n: 5 });
  });
});

/* ── Les seuils sont MESURÉS · la garde recalcule l'erreur exacte ─────────── */

const C = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const bin = (n: number, k: number, p: number) => C(n, k) * p ** k * (1 - p) ** (n - k);
/** Part de lots qui concluent à TORT quand le lot gagne au taux de la marque (p0), référence estimée sur R verdicts · exacte. */
function erreurSousH0(n: number, p0: number, R: number, planchers = true): number {
  let f = 0;
  for (let kr = 0; kr <= R; kr++) for (let k = 0; k <= n; k++) {
    const c = planchers ? conclusionLot(lotDe(k, n), 'conclu', ref(kr, R)).conclusion : lectureIntervalles({ k, n }, { k: kr, n: R }).lecture;
    if (c === 'confirmee' || c === 'infirmee') f += bin(R, kr, p0) * bin(n, k, p0);
  }
  return f;
}
const P0 = [0.1, 0.167, 0.3, 0.524, 0.7];
const RS = [6, 10, 20, 30, 50];

describe('conclusion d’un lot · les seuils tiennent l’erreur mesurée', () => {
  it(`de ${MIN_VARIANTES_CONCLUSION} à 10 variantes, la règle se trompe au plus ${ERREUR_TOLEREE_CONCLUSION * 100} % du temps sous l’hypothèse nulle`, () => {
    let pire = 0;
    for (let n = MIN_VARIANTES_CONCLUSION; n <= 10; n++) for (const p0 of P0) for (const R of [MIN_REFERENCE_CONCLUSION, ...RS]) pire = Math.max(pire, erreurSousH0(n, p0, R));
    expect(pire, 'la conclusion d’un lot se trompe trop souvent · un seuil (niveau, effectif) a été relâché').toBeLessThanOrEqual(ERREUR_TOLEREE_CONCLUSION);
  });
  it('à une variante de moins que le minimum, l’erreur dépasse la tolérance · c’est ce qui fixe le minimum', () => {
    const pire = Math.max(...P0.flatMap((p0) => RS.map((R) => erreurSousH0(MIN_VARIANTES_CONCLUSION - 1, p0, R, false))));
    expect(pire).toBeGreaterThan(ERREUR_TOLEREE_CONCLUSION);
  });
});

/* ── Écart d'une gagnante au reste de son lot (Accueil) ───────────────────── */

describe('écart au reste du lot · Accueil « Quoi itérer »', () => {
  const o = { numeroLot: 3, minImpressions: 5000 };
  it('accroche 27 % contre 21 % sur 20 000 impressions · +6 pts, en vert', () => {
    expect(ecartAuLot({ hookRate: 0.27, impressions: 20000 }, [{ hookRate: 0.2, impressions: 10000 }, { hookRate: 0.22, impressions: 10000 }], o))
      .toEqual({ texte: 'Accroche +6 pts vs le reste du lot #3', classe: 'g' });
  });
  it('plus bas que le reste · le vrai moins, en rouge', () => {
    expect(ecartAuLot({ hookRate: 0.18, impressions: 20000 }, [{ hookRate: 0.24, impressions: 20000 }], o)).toEqual({ texte: 'Accroche −6 pts vs le reste du lot #3', classe: 'r' });
  });
  it('dans le bruit · « non tranché », aucun chiffre', () => {
    expect(ecartAuLot({ hookRate: 0.215, impressions: 6000 }, [{ hookRate: 0.21, impressions: 6000 }], o)).toEqual({ texte: 'Accroche · écart avec le reste du lot #3 non tranché', classe: '' });
  });
  it('sous le volume minimum de la marque, d’un côté ou de l’autre · silence', () => {
    expect(ecartAuLot({ hookRate: 0.4, impressions: 4999 }, [{ hookRate: 0.1, impressions: 20000 }], o)).toBeNull();
    expect(ecartAuLot({ hookRate: 0.4, impressions: 20000 }, [{ hookRate: 0.1, impressions: 4999 }], o)).toBeNull();
  });
  it('sans accroche (statique) · le CTR · sans reste du lot · silence', () => {
    expect(ecartAuLot({ ctr: 0.02, impressions: 50000 }, [{ ctr: 0.01, impressions: 50000 }], o)!.texte).toBe('CTR +1 pt vs le reste du lot #3');
    expect(ecartAuLot({ hookRate: 0.3, impressions: 50000 }, [], o)).toBeNull();
  });
});

/* ── Duplication · la structure, jamais la mesure ─────────────────────────── */

describe('duplication d’un lot', () => {
  it('la variante copiée garde ce qui la décrit, perd ce qui la mesure, et repart en brouillon', () => {
    const src = {
      conceptId: 'c', creativeId: 'cr', variantCode: 'v2', format: 'static', adType: 'iteration', hypothesis: 'h', testedVariable: 'hook', variableValue: 'x',
      offerId: 'o', landingPageId: 'lp', briefUrl: null, assetUrl: 'https://a', platform: 'meta',
      id: 'ancienne', batchId: 'l', status: 'done', generatedName: 'NOM_REGIE', externalIds: { ad_id: '1' }, launchedAt: new Date(), sourceRef: { generationId: 'g' }, legacyFlags: ['x'],
    };
    const c = structureVariante(src);
    expect(c.status).toBe('draft');
    for (const k of ['id', 'batchId', 'generatedName', 'externalIds', 'launchedAt', 'sourceRef', 'legacyFlags']) expect(c, k).not.toHaveProperty(k);
    expect(c).toMatchObject({ conceptId: 'c', creativeId: 'cr', variantCode: 'v2', hypothesis: 'h', testedVariable: 'hook', offerId: 'o', landingPageId: 'lp' });
  });
  it('le but dit d’où vient le lot, borné à 300 caractères', () => {
    expect(butLotDuplique(4, 'Accroche question')).toBe('Reprise du lot #4 · Accroche question');
    expect(butLotDuplique(4, null)).toBe('Reprise du lot #4');
    expect(butLotDuplique(4, 'x'.repeat(400))).toHaveLength(300);
  });
});

/* ── Apprentissages · état calculé, suite, tiroir, règles ─────────────────── */

const appris = (o: Partial<FaitsApprentissage> = {}, v: FaitsVerdictSpatial | null = verdict('winner', { retenu: 'winner', statut: 'validated' })): FaitsApprentissage => ({
  id: 'p', enonce: 'Une question en accroche retient mieux que l’affirmation.', statut: 'validated', refute: false, source: 'arbitrage', creeLe: '2026-11-03T10:00:00Z',
  ad: { ...ad(v, { id: 'adx', variante: 'v2' }), lot: { id: 'lot1', numero: 3 } }, portee: 'concept', confiance: 4, versRegles: null, ...o,
});

describe('apprentissages · « À retester » se calcule ou se tait', () => {
  it('validé sur un verdict non concluant, sous-diffusé ou relatif · à retester · sur une gagnante · validé', () => {
    expect(etatApprentissage(appris({}, verdict('inconclusive', { retenu: 'inconclusive', statut: 'validated' })))).toBe('retester');
    expect(etatApprentissage(appris({}, verdict('insufficient_delivery', { retenu: 'insufficient_delivery', statut: 'validated' })))).toBe('retester');
    expect(etatApprentissage(appris({}, verdict('winner', { comparable: false })))).toBe('retester');
    expect(etatApprentissage(appris())).toBe('valide');
    expect(etatApprentissage(appris({}, verdict('loser', { retenu: 'loser', statut: 'validated' })))).toBe('valide');
  });
  it('sans verdict derrière · rien à retester (le niveau « À vérifier » le dit) · rejeté · à retester', () => {
    expect(etatApprentissage(appris({ ad: null }))).toBe('valide');
    expect(etatApprentissage(appris({ refute: true }))).toBe('retester');
    expect(etatApprentissage(appris({ statut: 'proposed' }))).toBe('valider');
  });
  it('les filtres de la maquette V5 et leur appartenance', () => {
    expect(FILTRES_ETAT_APPRENTISSAGE.map((f) => f.libelle)).toEqual(['Tous', 'À valider', 'Validés', 'À retester']);
    expect(dansFiltreEtatApprentissage('retester', 'retester')).toBe(true);
    expect(dansFiltreEtatApprentissage('valide', 'retester')).toBe(false);
    expect(dansFiltreEtatApprentissage('valide', 'tous')).toBe(true);
  });
});

describe('apprentissages · « Itérer » seulement depuis une gagnante au protocole', () => {
  it('gagnante comparable · la préparation du projet, brief d’itération de CETTE variante', () => {
    expect(actionApprentissage(appris())).toEqual({ libelle: 'Itérer', href: lienIterationStudio('adx'), boucle: true });
  });
  it('perdante validée · son lot, pas d’itération', () => {
    expect(actionApprentissage(appris({}, verdict('loser', { retenu: 'loser', statut: 'validated' })))).toEqual({ libelle: 'Voir le lot', href: '/adsmap/lots/lot1', boucle: false });
  });
  it('à retester · les hypothèses', () => {
    expect(actionApprentissage(appris({ refute: true })).href).toBe('/adsmap/hypotheses');
  });
});

describe('apprentissages · le tiroir « D’où ça vient · Limites · Vaut pour »', () => {
  it('chaque ligne est un fait · source, lot, variante, verdict, date, niveau, confiance, portée', () => {
    const t = tiroirApprentissage(appris());
    expect(t.origine).toEqual(['Arbitré dans l’outil, à la conclusion du lot', 'Lot #3 · variante v2 · verdict « Gagnante »', 'Écrit le 3 novembre 2026']);
    expect(t.limites).toEqual(['Mesuré sur un verdict comparable · vaut pour ce protocole et cette fenêtre d’évaluation.', 'Confiance déclarée · 4 sur 5.']);
    expect(t.vautPour).toBe('Le concept entier');
  });
  it('un arbitrage qui s’écarte du calcul le dit, un gagnant hors protocole aussi, la conclusion du lot s’ajoute', () => {
    expect(tiroirApprentissage(appris({}, verdict('loser', { retenu: 'baby_winner', statut: 'validated' }))).origine[1]).toBe('Lot #3 · variante v2 · verdict « Gagnante naissante » · le moteur avait calculé « Perdante »');
    expect(tiroirApprentissage(appris({}, verdict('winner', { comparable: false }))).origine[1]).toBe('Lot #3 · variante v2 · verdict « Prometteuse · relatif » · déclaré « Gagnante », hors protocole');
    const c = conclusionLot(lotDe(2, 4), 'conclu', ref(4, 10));
    expect(tiroirApprentissage(appris(), c).limites.at(-1)).toBe(`Conclusion du lot #3 · Non concluante · ${c.phrase}`);
  });
});

describe('apprentissages · vers les règles de la marque', () => {
  it('ajoute une Préférence à la fin, sans toucher au reste', () => {
    const r = regleDepuisApprentissage('Interdit : Montrer un enfant seul', 'Une question en accroche  retient mieux.');
    expect(r).toEqual({ ok: true, suivant: 'Interdit : Montrer un enfant seul\nPréférence : Une question en accroche retient mieux.' });
    expect(lireReglesMarque((r as { suivant: string }).suivant).map((x) => x.type)).toEqual(['ban', 'pref']);
  });
  it('refuse un doublon (mot pour mot, casse et espaces ignorés) et un texte trop long', () => {
    expect(regleDepuisApprentissage('Préférence : une QUESTION retient', 'Une question  retient')).toEqual({ ok: false, raison: 'Déjà dans les règles de la marque.' });
    expect(regleDepuisApprentissage('x'.repeat(LONGUEUR_MAX_REGLES - 5), 'Une phrase de plus')).toMatchObject({ ok: false });
  });
  it('seul un apprentissage validé, non rejeté, absent des règles, peut devenir une règle', () => {
    expect(refusVersRegles({ statut: 'validated', refute: false }, false)).toBeNull();
    expect(refusVersRegles({ statut: 'proposed', refute: false }, false)).toBe('À valider d’abord · il s’écrit en concluant le lot.');
    expect(refusVersRegles({ statut: 'validated', refute: true }, false)).toBe('Rejeté · un apprentissage rejeté ne devient pas une règle.');
    expect(refusVersRegles({ statut: 'validated', refute: false }, true)).toBe('Déjà dans les règles de la marque.');
    expect(regleDejaPresente('Interdit : x\nPréférence : Une  QUESTION retient', 'une question retient')).toBe(true);
    expect(regleDejaPresente('Préférence : autre chose', 'une question retient')).toBe(false);
  });
});
