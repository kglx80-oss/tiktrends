'use client';

import { useState, type CSSProperties } from 'react';
import {
  changementAngleManuel, changementHypotheseRetenue, demandeAnglesDepuisBrief,
  OBJECTIF_MAX,
  type BriefCanonique, type HypotheseTest,
} from '@tiktrends/core';
import { proposerHypotheses } from '../../../app/actions/studios/sources';
import css from './AssistantProjet.module.css';
import { Icon } from '../../Icon';
import { BlocPropositions, btnAction, btnActionGhost } from './BlocPropositions';
import type { CyclePropositionsBrief } from './usePropositionsBrief';

/**
 * Étape STRATÉGIE de l'assistant V5, branchée sur les VRAIES actions.
 *
 *  · la chaîne stratégique montre les valeurs RÉELLES du brief (persona, angle,
 *    concept, hypothèse) · ce qui manque est « à définir », jamais inventé ;
 *  · « Écrire mon angle » crée une proposition MANUELLE (gratuite) sur
 *    `/brief/angle` · relue, adoptée par un geste ;
 *  · « Proposer d'autres angles » appelle Jarvis (`proposerBrief`, payant et
 *    annoncé) · une proposition relue, jamais appliquée seule ;
 *  · les suggestions d'hypothèses (`proposerHypotheses`) s'appuient sur des
 *    sources de la Veille · sans source, l'affordance est honnêtement inactive
 *    (jamais un bouton mort qui ne produirait rien). Retenir une hypothèse
 *    écrit ses faits (sourceIds préservés) via une proposition relue.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
function ChaineNoeud({ cle, valeur }: { cle: string; valeur: string | null | undefined }) {
  const rempli = typeof valeur === 'string' && valeur.trim().length > 0;
  return <div data-noeud={cle} data-rempli={rempli ? 'oui' : 'non'} className={`${css.wznode} ${rempli ? css.on : ''} ${cle === 'Angle' ? css.cur : ''}`}>
    <small>{cle === 'Persona' ? 'Avatar' : cle}</small><strong>{rempli ? valeur!.trim() : 'À définir'}</strong>
  </div>;
}

export function EtapeStrategie({ brief, cycle, onApplied, sources, marqueId }: {
  brief: BriefCanonique;
  cycle: CyclePropositionsBrief;
  onApplied: () => void;
  /** Références de sources du projet · vide = pas de suggestions d'hypothèses (honnête). */
  sources: unknown[];
  marqueId: string;
}) {
  const [angle, setAngle] = useState(brief.angle ?? '');
  const [hypotheses, setHypotheses] = useState<HypotheseTest[] | null>(null);
  const [hErreur, setHErreur] = useState<string | null>(null);
  const [hEncours, setHEncours] = useState(false);
  const jarvis = cycle.liste?.ok ? cycle.liste.jarvis : null;
  const peutProposer = cycle.liste?.ok ? cycle.liste.peutProposer : false;
  const peutHypotheses = sources.length > 0;

  async function demanderHypotheses() {
    setHEncours(true);
    setHErreur(null);
    try {
      const r = await proposerHypotheses({ sources, brandId: marqueId, objectif: brief.objective });
      if (!r.ok) { setHErreur(r.message ?? 'Suggestions indisponibles.'); setHypotheses([]); return; }
      setHypotheses(r.hypotheses as HypotheseTest[]);
    } catch {
      setHErreur('Hors ligne · aucune suggestion. Réessaie.');
    } finally {
      setHEncours(false);
    }
  }

  return (
    <div data-zone="assistant-strategie" style={{ display: 'grid', gap: 16 }}>
      <section aria-label="Chaîne stratégique" style={{ display: 'grid', gap: 8 }}>

        <div data-champ="chaine" className={css.wzchain}>
          <ChaineNoeud cle="Persona" valeur={brief.personaRef?.label || brief.audience} />
          <span className={css.wzlink} aria-hidden /><ChaineNoeud cle="Désir" valeur={null} /><span className={css.wzlink} aria-hidden />
          <ChaineNoeud cle="Angle" valeur={brief.angle} />
          <span className={css.wzlink} aria-hidden /><ChaineNoeud cle="Concept" valeur={brief.concept} />
          <span className={css.wzlink} aria-hidden /><ChaineNoeud cle="Pub" valeur={null} /><span className={css.wzlink} aria-hidden /><ChaineNoeud cle="Résultat" valeur={null} />
        </div>
      </section>

      <section aria-label="Écrire mon angle" className={css.wangle}>
        <div className={`${css.wanglevis} ${css.own}`}><Icon name="plus" size={24} /></div>
        <div className={css.wanglebody}>
        <span className={css.wzlabel}>Écrire mon angle</span>
        <textarea data-champ="angle-libre" value={angle} maxLength={OBJECTIF_MAX} rows={2}
          onChange={(e) => setAngle(e.target.value)} placeholder="L’idée qui porte la publicité" className={css.editor} />
        <div>
          <button type="button" data-bouton="ecrire-angle" disabled={!peutProposer || !angle.trim() || cycle.occupe === 'manuel'}
            onClick={() => cycle.ecrireManuel(changementAngleManuel(brief, angle), 'Angle écrit à la main · stratégie')}
            style={{ ...btnActionGhost, opacity: (!peutProposer || !angle.trim() || cycle.occupe === 'manuel') ? 0.55 : 1 }}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer mon angle'}
          </button>
        </div>
        </div>
      </section>

      <section aria-label="Angles proposés" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Angles proposés · Jarvis</span>
        <p style={note}>{jarvis?.disponible ? jarvis.mentionCout : (jarvis?.raison || 'Jarvis indisponible ici · utilise « Écrire mon angle ».')}</p>
        <div>
          <button type="button" data-bouton="proposer-angles" disabled={!peutProposer || !jarvis?.disponible || cycle.occupe === 'demande'}
            onClick={() => cycle.demanderJarvis(demandeAnglesDepuisBrief(brief))}
            style={{ ...btnAction, opacity: (!peutProposer || !jarvis?.disponible || cycle.occupe === 'demande') ? 0.55 : 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="spark" size={14} />{cycle.occupe === 'demande' ? 'Jarvis réfléchit…' : 'Proposer d’autres angles'}</span>
          </button>
        </div>
      </section>

      <section aria-label="Suggestions d’hypothèses" data-champ="hypotheses" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>Hypothèse à tester · depuis la Veille</span>
        {!peutHypotheses ? (
          <p data-etat="sans-source" style={note}>Les suggestions d’hypothèses de Jarvis s’appuient sur des sources de la Veille. Pour en obtenir, démarre un projet depuis une annonce sauvegardée · ici, écris ton angle ou demande d’autres angles.</p>
        ) : (
          <>
            <div>
              <button type="button" data-bouton="proposer-hypotheses" disabled={!peutProposer || hEncours}
                onClick={demanderHypotheses} style={{ ...btnAction, opacity: (!peutProposer || hEncours) ? 0.55 : 1 }}>
                {hEncours ? 'Jarvis réfléchit…' : 'Proposer des hypothèses'}
              </button>
            </div>
            {hErreur && <p role="alert" style={{ ...note, color: 'var(--err-text)' }}>{hErreur}</p>}
            {hypotheses?.map((h) => (
              <article key={h.id} data-hypothese={h.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, display: 'grid', gap: 6 }}>
                <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{h.statement}</strong>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Variable testée · {h.variable}</span>
                <div>
                  <button type="button" data-bouton="retenir-hypothese" disabled={!peutProposer || cycle.occupe === 'manuel'}
                    onClick={() => cycle.ecrireManuel(changementHypotheseRetenue(brief, h), `Hypothèse retenue · ${h.id}`)}
                    style={{ ...btnActionGhost, opacity: (!peutProposer || cycle.occupe === 'manuel') ? 0.55 : 1 }}>Retenir cette hypothèse</button>
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section aria-label="Propositions à trancher" style={{ display: 'grid', gap: 8 }}>
        <span className={css.wzlabel}>À trancher</span>
        <BlocPropositions cycle={cycle} onApplied={onApplied} />
      </section>
    </div>
  );
}
