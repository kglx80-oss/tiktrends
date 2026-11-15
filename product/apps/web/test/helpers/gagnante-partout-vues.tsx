import { cartesHypotheses, type FaitsAdSpatial, type FaitsHypotheseAd, type LectureConclusion, type VerdictValue } from '@tiktrends/core';
import type { PropsLot } from '../../spatial/vues/resultats/Lot';

/**
 * « Itérer depuis la gagnante » partout · les fiches de lot et les cartes
 * d'hypothèse SANS gagnante confirmée, telles que la capture de main les a
 * rendues (`fixtures/gagnante-partout-avant.html`) · les mêmes faits servent à
 * la capture et à la comparaison, la règle du noyau décide ensuite qu'aucun
 * geste ne s'y ajoute.
 */

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

const ad = (i: number, variante: string, v: VerdictValue | null, statut = 'done'): FaitsAdSpatial => ({
  id: uuid(i), variante, statut, hypothese: `Si on change l’accroche ${variante}, alors le coût par achat baisse, parce que la question retient.`, variable: 'hook', plateforme: 'meta',
  texte: `Accroche ${variante}`, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 120, impressions: 18000, achats: 3, cpa: 40 } : null,
});

const conclusion = (c: LectureConclusion['conclusion'], titre: string): LectureConclusion => ({
  conclusion: c, motif: c === 'en_attente' ? 'pas_pret' : 'lecture', titre, phrase: `${titre} · la phrase du lot.`,
  lot: c === 'en_attente' ? null : { k: 0, n: 4, intervalle: { lo: 0, hi: 0.4 } },
  reference: c === 'en_attente' ? null : { k: 6, n: 12, intervalle: { lo: 0.3, hi: 0.7 } },
});

/** Les lots · un en diffusion (rien de conclu), un conclu INFIRMÉ sans aucune gagnante, un conclu SANS CONCLUSION sans gagnante. */
export const LOTS_SANS_GAGNANTE = [
  { id: uuid(901), numero: 51, etat: 'diffusion' as const, conclusion: conclusion('en_attente', 'Pas encore de conclusion'), ads: [ad(1, 'D1', null, 'live'), ad(2, 'D2', null, 'live')] },
  { id: uuid(902), numero: 52, etat: 'conclu' as const, conclusion: conclusion('infirmee', 'Hypothèse infirmée'), ads: [ad(3, 'I1', 'loser'), ad(4, 'I2', 'loser'), ad(5, 'I3', 'loser')] },
  { id: uuid(903), numero: 53, etat: 'conclu' as const, conclusion: conclusion('non_concluante', 'Non concluante'), ads: [ad(6, 'S1', 'loser'), ad(7, 'S2', 'loser')] },
];

export type LotSansGagnante = (typeof LOTS_SANS_GAGNANTE)[number];

/** Les props de la fiche d'un lot · la liste « Les variantes du lot » et la conclusion, comme la page les pose. */
export function propsFicheLot(l: LotSansGagnante): PropsLot {
  return {
    sous: `Lot #${l.numero} · Meta · 14 jours`, titre: `Lot #${l.numero}`,
    verdict: { gagnant: false, titre: 'Aucune gagnante', phrase: 'Aucune variante sous la cible.', niveau: 2 },
    variantes: l.ads.map((a) => ({ id: a.id, texte: a.texte ?? ' ', image: null, gagnante: false, barre: { libelle: '40 €', part: 50 }, tag: `${a.variante} · perdante` })),
    controles: [{ icone: 'cal', titre: '14 jours sur 14', detail: 'd' }],
    coach: { avant: 'Le moteur retient :', fort: 'aucune gagnante', apres: '.' },
    conclusion: l.conclusion,
    fiches: l.ads.map((a) => ({ href: `/adsmap/tests/${a.id}`, libelle: `${a.variante} · Crème`, detail: `Terminé · ${a.verdict ? 'Perdante' : 'pas de verdict'}` })),
  };
}

/** Les faits des cartes · les ads des lots, leur lot (conclusion du lot entier) · aucune n'est confirmée. */
export function faitsCartesSansGagnante(): FaitsHypotheseAd[] {
  return LOTS_SANS_GAGNANTE.flatMap((l) => l.ads.map((a): FaitsHypotheseAd => ({
    ad: a, concept: 'Crème', bande: 'med', lot: { id: l.id, numero: l.numero, etat: l.etat, jour: l.etat === 'diffusion' ? 4 : null, conclusion: l.conclusion },
  })));
}

export const cartesSansGagnante = () => cartesHypotheses(faitsCartesSansGagnante(), [], { marqueId: uuid(999) });
