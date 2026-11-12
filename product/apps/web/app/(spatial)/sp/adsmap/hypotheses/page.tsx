import {
  bilanProvenances, cartesHypotheses, conclusionLot, entreesBilanProvenances, presentationLot, provenanceDuTest, referenceConclusion, sousNavResultats,
  NOTE_JARVIS_PROVENANCE, NOTE_OFFRE_PROVENANCE, NOTE_COMMENTAIRE_PROVENANCE, NOTE_NOTE_PROVENANCE, PROVENANCES_TEST, RESERVE_ESTIMATION, type FaitsHypotheseAd,
  REFUS_HYPOTHESE_NOTE, departHypotheseDepuisNote, lireGesteHypotheseNote,
} from '@tiktrends/core';
import { iterationPlanAction } from '../../../../actions/adsmap-iterate';
import { completerHypotheseAction, creerHypotheseAction } from '../../../../actions/adsmap-hypotheses';
import { Hypotheses } from '../../../../../spatial/vues/resultats/Hypotheses';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerLots, gardeResultats, type AdLue } from '../donnees';
import { lireNotePourHypothese } from '../../../../../lib/studios/commentaire-iterer';
import type { DepuisNoteHypothese } from '../../../../../spatial/vues/resultats/Hypotheses';

export const dynamic = 'force-dynamic';

/**
 * Hypothèses · nouvelle adresse · mêmes gardes que l'Adsmap V5.
 *
 * Boucler la preuve · la carte d'une hypothèse dont le lot est CONCLU dit son
 * résultat, calculé depuis la conclusion du lot (`conclusionLot`, lue contre
 * les autres lots déjà chargés ici · `resultatHypothese`, noyau), et rappelle
 * sa provenance · le bloc « D'où viennent les hypothèses qui gagnent » lit les
 * mêmes verdicts par provenance (`bilanProvenances`, noyau). Lecture seule ·
 * aucune lecture de plus que `chargerLots`.
 *
 * `?note=<uuid>&projet=<uuid>` (« Formuler une hypothèse » sous une note de la
 * lignée posée sur un nœud brief ou hypothèse, lot 11) · la note est RELUE dans
 * la portée (Résultats, garde des Studios, marque active, projet de l'adresse,
 * nœud brief / hypothèse · `lireNotePourHypothese`) · le formulaire EXISTANT
 * s'ouvre pré-rempli (`departHypotheseDepuisNote` · énoncé proposé, note citée) ·
 * rien n'est enregistré sans le clic · `creerHypotheseAction` relit la note
 * avant de poser la provenance « Note de la lignée ». Refusée · la même phrase,
 * rien de pré-rempli, rien ne dit si la note existe ailleurs.
 */
export default async function HypothesesSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Hypothèses" raison={g.raison} />;
  const demande = lireGesteHypotheseNote(await searchParams);
  let depuisNote: DepuisNoteHypothese | null = null;
  if (demande.etat === 'refus') depuisNote = { refus: REFUS_HYPOTHESE_NOTE };
  else if (demande.etat === 'ok') {
    const lue = await lireNotePourHypothese(g.s, g.marque.id, demande);
    depuisNote = lue
      ? { ...departHypotheseDepuisNote(lue.texte, { auteur: lue.auteur, noeud: lue.libelleNoeud }), source: { noteId: lue.noteId, projetId: lue.projetId } }
      : { refus: REFUS_HYPOTHESE_NOTE };
  }

  const [d, plan] = await Promise.all([chargerLots(g.s.workspaceId, g.marque.id), iterationPlanAction()]);
  const ads: FaitsHypotheseAd[] = [
    ...d.lots.flatMap((l) => {
      const p = presentationLot(l, d.ctx);
      const conclusion = conclusionLot(l, p.etat, referenceConclusion(d.lots, l.id));
      return l.ads.map((a) => ({ ad: a, concept: a.concept, bande: a.bande, origine: a.origine, estimation: a.estimation, lot: { id: l.id, numero: l.numero, etat: p.etat, jour: p.etat === 'diffusion' ? p.jour : null, conclusion } }));
    }),
    ...d.horsLot.map((a) => ({ ad: a, concept: a.concept, bande: a.bande, origine: a.origine, estimation: a.estimation, lot: null })),
  ];
  const suites = (plan.view?.rows ?? []).slice(0, 12).map((r) => ({
    adId: r.adId, libelle: r.label, variable: r.changedVariable, etape: r.stageLabel, raison: r.rationale, priorite: r.priority,
  }));
  const parAd = new Map<string, AdLue>(d.lots.flatMap((l) => l.ads.map((a) => [a.id, a] as const)));
  const bilan = bilanProvenances(entreesBilanProvenances(d.lots, (adId) => { const a = parAd.get(adId); return a ? provenanceDuTest({ origine: a.origine, typeAd: a.typeAd, jarvis: a.jarvis, commentaire: a.commentaire, note: a.note }) : null; }));

  return (
    <Hypotheses
      sousNav={sousNavResultats({ admin: g.admin })}
      cartes={cartesHypotheses(ads, suites, { marqueId: g.marque.id })}
      jarvis={g.jarvis}
      jarvisCartes
      note={`La priorité vient de ton estimation (impact, confiance, effort) quand tu l’as donnée, sinon du pré-score du concept, lu sur tes tests passés, ou du rang de la suite dans le plan d’itération · une ${RESERVE_ESTIMATION}, pas une mesure.`}
      creer={creerHypotheseAction}
      completer={completerHypotheseAction}
      bilan={{ ...bilan, provenances: PROVENANCES_TEST.map((p) => p.libelle), noteJarvis: NOTE_JARVIS_PROVENANCE, noteOffre: NOTE_OFFRE_PROVENANCE, noteCommentaire: NOTE_COMMENTAIRE_PROVENANCE, noteNote: NOTE_NOTE_PROVENANCE }}
      depuisNote={depuisNote}
    />
  );
}
