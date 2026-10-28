'use client';

import { useEffect, useState } from 'react';
import {
  changementAngleManuel, changementHypotheseRetenue, demandeAnglesDepuisBrief, libelleCoutTexteEstime,
  NOTE_BORNE_TEXTE, OBJECTIF_MAX,
  type BriefCanonique, type HypotheseTest,
} from '@tiktrends/core';
import { preparerCreation, proposerHypotheses } from '../../../../app/actions/studios/sources';
import type { CyclePropositionsBrief } from '../../../../lib/studios/propositions/use-propositions-brief';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../../lib/studios/appel-payant';
import { Ic } from '../../../communs';
import { CartePropositionBrief, PropositionsBrief } from './PropositionsBrief';

/**
 * Étape STRATÉGIE de l'assistant (porté de la V5 `EtapeStrategie`), sur les
 * VRAIES actions :
 *  · la chaîne montre les valeurs RÉELLES du brief relu · ce qui manque est
 *    « À définir », jamais inventé ;
 *  · « Enregistrer mon angle » · proposition MANUELLE (gratuite), bornée à
 *    `/brief/angle`, relue puis appliquée par un geste ;
 *  · « Proposer d'autres angles » · Jarvis (`proposerBrief`), appel texte
 *    payant dont le coût est affiché AVANT le bouton ;
 *  · les hypothèses depuis la Veille (`proposerHypotheses`) · seulement avec
 *    des sources ; leur coût estimé est lu AVANT le clic (`preparerCreation`,
 *    lecture) · « Retenir » écrit les faits par une proposition relue.
 */

type DispoHypotheses = { disponible: boolean; raison: string | null; plafondUsd: number } | null;

export function Strategie({ projectId, brief, cycle, onApplied, sources, marqueId }: {
  projectId: string;
  brief: BriefCanonique;
  cycle: CyclePropositionsBrief;
  onApplied: () => void;
  /** Sources du projet (Veille) · vide = pas de suggestions d'hypothèses, dit honnêtement. */
  sources: unknown[];
  marqueId: string;
}) {
  const [angle, setAngle] = useState(brief.angle ?? '');
  const [hypotheses, setHypotheses] = useState<HypotheseTest[] | null>(null);
  const [hErreur, setHErreur] = useState<string | null>(null);
  const [hEncours, setHEncours] = useState(false);
  const [dispo, setDispo] = useState<DispoHypotheses>(null);
  const appelHypotheses = useAppelPayant(projectId, 'hypotheses-assistant');
  const jarvis = cycle.liste?.ok ? cycle.liste.jarvis : null;
  const peutProposer = cycle.liste?.ok ? cycle.liste.peutProposer : false;
  const avecSources = sources.length > 0;
  const cleSources = JSON.stringify(sources);

  // Coût des hypothèses · LECTURE (aucun appel modèle) pour l'annoncer avant le clic.
  useEffect(() => {
    if (!avecSources) { setDispo(null); return; }
    let actif = true;
    void preparerCreation({ sources: JSON.parse(cleSources) as unknown[], brandId: marqueId }).then((r) => {
      if (!actif) return;
      setDispo(r.ok ? { disponible: r.ia.disponible, raison: r.ia.raison, plafondUsd: r.ia.plafondUsd } : { disponible: false, raison: r.message, plafondUsd: 0 });
    }).catch(() => { if (actif) setDispo({ disponible: false, raison: 'Le coût des suggestions n’a pas pu être lu · rien n’est proposé sans lui.', plafondUsd: 0 }); });
    return () => { actif = false; };
  }, [avecSources, cleSources, marqueId]);

  const anglesProposes = cycle.liste?.ok ? cycle.liste.propositions.filter((p) =>
    p.cible === 'brief' && p.etat === 'proposed' && p.changements.some((c) => c.chemin === '/brief/angle' || c.chemin === '/brief/concept')) : [];

  async function demanderHypotheses() {
    if (!dispo?.disponible || hEncours) return;
    const tentative = appelHypotheses.commencer();
    if (!tentative) return;
    setHEncours(true); setHErreur(null);
    try {
      const r = await proposerHypotheses({ sources, brandId: marqueId, objectif: brief.objective });
      appelHypotheses.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { setHErreur(r.message ?? 'Suggestions indisponibles.'); setHypotheses([]); return; }
      setHypotheses(r.hypotheses as HypotheseTest[]);
    } catch {
      appelHypotheses.terminer(tentative, true);
      setHErreur(MESSAGE_APPEL_PAYANT);
    } finally { setHEncours(false); }
  }

  const chaine: ReadonlyArray<[string, string | null | undefined]> = [
    ['Avatar', brief.personaRef?.label || brief.audience], ['Désir', null], ['Angle', brief.angle], ['Concept', brief.concept], ['Pub', null], ['Résultat', null],
  ];
  const angleBloque = !peutProposer || !angle.trim() || cycle.occupe === 'manuel';
  const jarvisBloque = !peutProposer || !jarvis?.disponible || !!cycle.occupe;

  return (
    <div data-zone="assistant-strategie" className="wz" style={{ maxWidth: 'none' }}>
      <section className="tile" aria-label="Chaîne stratégique" data-champ="chaine" style={{ display: 'grid', gap: 10 }}>
        <div className="lbl">La chaîne de ce projet</div>
        <div className="kc" style={{ alignItems: 'center' }}>
          {chaine.map(([cle, valeur], i) => {
            const rempli = typeof valeur === 'string' && valeur.trim().length > 0;
            return (
              <span key={cle} style={{ display: 'contents' }}>
                {i > 0 && <Ic n="arrow" />}
                <span className={`pill ${rempli ? 'c' : ''}`} data-noeud={cle} data-rempli={rempli ? 'oui' : 'non'} style={{ whiteSpace: 'normal' }}>{cle} · {rempli ? valeur!.trim() : 'À définir'}</span>
              </span>
            );
          })}
        </div>
      </section>

      <section aria-label="Écrire mon angle">
        <h2 style={{ marginBottom: 10 }}>Écrire mon angle <span className="faint" style={{ fontSize: '12.5px', fontWeight: 500 }}>· sans appel IA, gratuit</span></h2>
        <textarea className="ta" data-champ="angle-libre" value={angle} maxLength={OBJECTIF_MAX} rows={2} onChange={(e) => setAngle(e.target.value)} placeholder="L’idée qui porte la publicité" aria-label="Mon angle" />
        <div className="kc" style={{ marginTop: 10 }}>
          <button className="btn sm" type="button" data-bouton="ecrire-angle" disabled={angleBloque}
            onClick={() => void cycle.ecrireManuel(changementAngleManuel(brief, angle), 'Angle écrit à la main · stratégie')}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer mon angle'}
          </button>
        </div>
      </section>

      <section aria-label="Angles proposés">
        <h2 style={{ marginBottom: 10 }}>Choisir mon angle</h2>
        {anglesProposes.length > 0 && (
          <div className="angles" style={{ marginTop: 0, marginBottom: 12 }}>
            {anglesProposes.map((p) => {
              const titre = p.changements.find((c) => c.chemin === '/brief/angle') ?? p.changements.find((c) => c.chemin === '/brief/concept')!;
              return <CartePropositionBrief key={p.id} p={p} cycle={cycle} onApplied={onApplied} titre={titre.apres} libelleAppliquer="Appliquer cet angle" />;
            })}
          </div>
        )}
        <p className="faint" style={{ fontSize: '11.5px' }} data-cout="angles">{jarvis?.disponible ? jarvis.mentionCout : (jarvis?.raison || 'Jarvis indisponible ici · utilise « Écrire mon angle ».')}</p>
        <div className="kc" style={{ marginTop: 8 }}>
          <button className="btn pri sm" type="button" data-bouton="proposer-angles" disabled={jarvisBloque}
            onClick={() => void cycle.demanderJarvis(demandeAnglesDepuisBrief(brief))}>
            <Ic n="spark" />{cycle.occupe === 'demande' ? 'Jarvis réfléchit…' : 'Proposer d’autres angles'}
          </button>
        </div>
      </section>

      <section aria-label="Suggestions d’hypothèses" data-champ="hypotheses">
        <h2 style={{ marginBottom: 10 }}>Hypothèse à tester · depuis la Veille</h2>
        {!avecSources ? (
          <p className="muted" data-etat="sans-source" style={{ fontSize: '12.5px' }}>Les suggestions d’hypothèses de Jarvis s’appuient sur des sources de la Veille. Pour en obtenir, ajoute une référence depuis la Veille au brief · ici, écris ton angle ou demande d’autres angles.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <p className="faint" style={{ fontSize: '11.5px' }} data-cout="hypotheses">
              {dispo === null ? 'Lecture du coût des suggestions…' : dispo.disponible ? `Appel texte payant · ${libelleCoutTexteEstime(dispo.plafondUsd)} · ${NOTE_BORNE_TEXTE}. Aucun crédit, rien d’appliqué sans ton accord.` : (dispo.raison ?? 'Suggestions indisponibles ici.')}
            </p>
            {appelHypotheses.bloque && <p className="faint" role="status" style={{ fontSize: '11.5px' }}>{MESSAGE_APPEL_PAYANT}</p>}
            <div className="kc">
              <button className="btn sm" type="button" data-bouton="proposer-hypotheses" disabled={!peutProposer || hEncours || !dispo?.disponible || appelHypotheses.bloque} onClick={() => void demanderHypotheses()}>
                <Ic n="spark" />{hEncours ? 'Jarvis réfléchit…' : 'Proposer des hypothèses'}
              </button>
            </div>
            {hErreur && <div className="banner" role="alert"><Ic n="x" /><span>{hErreur}</span></div>}
            {hypotheses?.map((h) => (
              <div key={h.id} className="tile" data-hypothese={h.id} style={{ display: 'grid', gap: 6 }}>
                <strong style={{ fontSize: 13 }}>{h.statement}</strong>
                <span className="muted" style={{ fontSize: '12.5px' }}>Variable testée · {h.variable}</span>
                <div className="kc">
                  <button className="btn sm" type="button" data-bouton="retenir-hypothese" disabled={!peutProposer || cycle.occupe === 'manuel'}
                    onClick={() => void cycle.ecrireManuel(changementHypotheseRetenue(brief, h), `Hypothèse retenue · ${h.id}`)}>Retenir cette hypothèse</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Propositions à trancher">
        <h2 style={{ marginBottom: 10 }}>À trancher</h2>
        <PropositionsBrief cycle={cycle} onApplied={onApplied} exclure={anglesProposes.map((p) => p.id)} />
      </section>
    </div>
  );
}
