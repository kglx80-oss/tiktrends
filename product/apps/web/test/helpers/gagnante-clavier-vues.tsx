import {
  dispositionVide, groupesLignee, ligneeVersCanvas, projeterLignee,
  type DonneesVariantes, type FaitsAdSpatial, type LectureConclusion, type TestLu, type VarianteLue, type VerdictLu, type VerdictValue,
} from '@tiktrends/core';
import type { PropsLot } from '../../spatial/vues/resultats/Lot';
import type { CanevasLibre, LigneeLibre } from '../../spatial/vues/projet/types';

/**
 * Itérer depuis la gagnante au clavier et sur la carte de lignée · une fiche
 * de lot CONCLU (confirmé, deux gagnantes arbitrées, une perdante) et une
 * lignée (un lot de test, une gagnante, une itération née d'elle), FIGÉES ·
 * les mêmes faits servent à la capture faite sur main avant le changement
 * (`fixtures/gagnante-clavier-avant.html`) et à la comparaison · seuls les
 * éléments ajoutés (et la touche T, déclarée) peuvent différer.
 */

export const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

const ad = (i: number, variante: string, v: VerdictValue): FaitsAdSpatial => ({
  id: uuid(i), variante, statut: 'done', hypothese: `Si on change l’accroche ${variante}, alors le coût par achat baisse, parce que la question retient.`, variable: 'hook', plateforme: 'meta',
  texte: `Accroche ${variante}`, image: null, manques: [],
  verdict: { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 120, impressions: 18000, achats: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40 },
});

const CONFIRMEE: LectureConclusion = {
  conclusion: 'confirmee', motif: 'lecture', titre: 'Hypothèse confirmée', phrase: 'Hypothèse confirmée · la phrase du lot.',
  lot: { k: 2, n: 3, intervalle: { lo: 0.6, hi: 0.95 } }, reference: { k: 6, n: 12, intervalle: { lo: 0.3, hi: 0.7 } },
};

/** Le lot conclu · V1 et V2 gagnantes arbitrées, V3 perdante · la gagnante du verdict du lot est V2. */
export const LOT_CONCLU = {
  id: uuid(911), numero: 61, etat: 'conclu' as const, conclusion: CONFIRMEE,
  ads: [ad(11, 'V1', 'winner'), ad(12, 'V2', 'winner'), ad(13, 'V3', 'loser')],
  gagnante: uuid(12),
};

/** Les props de la fiche du lot conclu (sans les actions ni les gestes · ajoutés par l'appelant). */
export function propsFicheConclue(): PropsLot {
  const l = LOT_CONCLU;
  return {
    sous: `Lot #${l.numero} · Meta · 14 jours`, titre: `Lot #${l.numero}`,
    verdict: { gagnant: true, titre: 'V2 gagne', phrase: 'Deux variantes sous la cible.', niveau: 3 },
    variantes: l.ads.map((a) => ({ id: a.id, texte: a.texte ?? ' ', image: null, gagnante: a.id === l.gagnante, barre: { libelle: a.variante === 'V3' ? '40 €' : '10 €', part: 50 }, tag: `${a.variante} · ${a.variante === 'V3' ? 'perdante' : 'gagnante'}` })),
    controles: [{ icone: 'cal', titre: '14 jours sur 14', detail: 'd' }],
    coach: { avant: 'Le moteur retient :', fort: 'V2', apres: '.' },
    conclusion: l.conclusion,
    fiches: l.ads.map((a) => ({ href: `/adsmap/tests/${a.id}`, libelle: `${a.variante} · Crème`, detail: `Terminé · ${a.variante === 'V3' ? 'Perdante' : 'Gagnante'}` })),
  };
}

/* ───────────────────────── la lignée ───────────────────────── */

const verdictLu = (validated: VerdictLu['validated']): VerdictLu => ({ computed: validated, validated, comparable: true, failedStage: null, killFlag: null, computedAt: '2026-10-10' });
const test = (o: Partial<TestLu> & Pick<TestLu, 'linkId' | 'adsmapAdId'>): TestLu => ({
  adStatus: 'live', hypothese: 'h', variable: 'hook', valeurVariable: null, objectif: null, protocole: null, periode: null, metrique: null, isolation: null, verdict: null, lot: null, ...o,
});
const variante = (o: Partial<VarianteLue> & Pick<VarianteLue, 'id' | 'versionId' | 'jobId' | 'lot' | 'position'>): VarianteLue => ({
  assetId: `a_${o.id}`, parentVariantId: null, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
  hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-05', test: null, lecture: null, relecture: null, ...o,
});

/** Les ads de test de la lignée · `AD_GAGNANTE` (V1 du lot conclu), `AD_PERDANTE` (V3), `AD_NEE` (l'itération née de V1, hors lot). */
export const AD_GAGNANTE = uuid(11);
export const AD_PERDANTE = uuid(13);
export const AD_NEE = uuid(21);

const donnees: DonneesVariantes = {
  projet: { id: 'p1', titre: 'Sérum', versionCouranteId: 'v1' },
  versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' }],
  lots: [{ jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-02', attendues: 3, sorties: [] }],
  variantes: [
    variante({ id: 'va1', versionId: 'v1', jobId: 'j1', lot: 1, position: 1, test: test({ linkId: 'tl1', adsmapAdId: AD_GAGNANTE, verdict: verdictLu('winner'), lot: { id: LOT_CONCLU.id, numero: 61, statut: 'analyzed' } }) }),
    variante({ id: 'va2', versionId: 'v1', jobId: 'j1', lot: 1, position: 2, test: test({ linkId: 'tl2', adsmapAdId: AD_PERDANTE, verdict: verdictLu('loser'), lot: { id: LOT_CONCLU.id, numero: 61, statut: 'analyzed' } }) }),
    variante({ id: 'va3', versionId: 'v1', jobId: 'j1', lot: 1, position: 3, test: test({ linkId: 'tl3', adsmapAdId: AD_NEE }) }),
  ],
  adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
  droits: { proposer: true },
  relecture: { disponible: false, raison: null, coutMaxUsd: null },
};

export const MODELE_LIGNEE = projeterLignee({
  projet: { id: 'p1', titre: 'Sérum', marque: 'Neva' }, sources: [],
  briefs: { v1: { objectif: 'Faire connaître', hypothese: 'Une question retient', hypotheseId: 'h1', variable: 'hook', direction: null } },
  donnees,
});

/** Le canvas libre de la lignée figée · `noeud` · le nœud choisi à l'ouverture (son détail est rendu). */
export function canevasLignee(noeud: string, plus: Partial<LigneeLibre> = {}): CanevasLibre {
  return {
    projectId: 'p1', version: { id: 'v1', n: 1, courante: true }, modele: ligneeVersCanvas(MODELE_LIGNEE), apercus: {}, disposition: dispositionVide(), rev: 1,
    lignee: { modele: MODELE_LIGNEE, groupes: groupesLignee(MODELE_LIGNEE, { resultatsOuverts: true }), apercus: {}, destinations: {}, notes: null, ...plus },
    grapheInitial: 'lignee', noeudInitial: noeud,
  };
}
