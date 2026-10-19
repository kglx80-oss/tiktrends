'use client';

import { useState, type CSSProperties } from 'react';
import {
  changementAngleManuel, changementHypotheseRetenue, demandeAnglesDepuisBrief,
  OBJECTIF_MAX, teinte,
  type BriefCanonique, type HypotheseTest,
} from '@tiktrends/core';
import { proposerHypotheses } from '../../../app/actions/studios/sources';
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
const titreEtape: CSSProperties = { margin: '2px 0 0', fontSize: 19, fontWeight: 500, color: 'var(--ink)' };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: 0 };
const champ: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 16, lineHeight: 1.5, resize: 'vertical' };

function ChaineNoeud({ cle, valeur }: { cle: string; valeur: string | null | undefined }) {
  const rempli = typeof valeur === 'string' && valeur.trim().length > 0;
  return (
    <div data-noeud={cle} data-rempli={rempli ? 'oui' : 'non'} style={{ ...{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: rempli ? teinte('accent', .1) : 'var(--bg)', minWidth: 120, display: 'grid', gap: 2 } }}>
      <small style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{cle}</small>
      <strong style={{ fontSize: 13.5, fontWeight: 600, color: rempli ? 'var(--ink)' : 'var(--muted)', overflowWrap: 'anywhere' }}>{rempli ? valeur!.trim() : 'à définir'}</strong>
    </div>
  );
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
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 2 sur 5 · La stratégie</p>
        <h2 style={titreEtape}>La stratégie</h2>
        <p style={note}>Jarvis propose, tu tranches. Rien n’est écrit dans le brief sans ton geste · chaque proposition est relue avant d’être adoptée.</p>
      </div>

      <section aria-label="Chaîne stratégique" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Chaîne stratégique · d’après le brief</span>
        <div data-champ="chaine" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <ChaineNoeud cle="Persona" valeur={brief.personaRef?.label} />
          <ChaineNoeud cle="Angle" valeur={brief.angle} />
          <ChaineNoeud cle="Concept" valeur={brief.concept} />
          <ChaineNoeud cle="Hypothèse" valeur={brief.hypothesisId ? brief.testedVariable || brief.hypothesisId : ''} />
        </div>
      </section>

      <section aria-label="Écrire mon angle" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Écrire mon angle</span>
        <textarea data-champ="angle-libre" value={angle} maxLength={OBJECTIF_MAX} rows={2}
          onChange={(e) => setAngle(e.target.value)} placeholder="L’idée qui porte la publicité" style={champ} />
        <div>
          <button type="button" data-bouton="ecrire-angle" disabled={!peutProposer || !angle.trim() || cycle.occupe === 'manuel'}
            onClick={() => cycle.ecrireManuel(changementAngleManuel(brief, angle), 'Angle écrit à la main · stratégie')}
            style={{ ...btnActionGhost, opacity: (!peutProposer || !angle.trim() || cycle.occupe === 'manuel') ? 0.55 : 1 }}>
            {cycle.occupe === 'manuel' ? 'Enregistrement…' : 'Enregistrer mon angle'}
          </button>
        </div>
      </section>

      <section aria-label="Angles proposés" style={{ display: 'grid', gap: 8 }}>
        <span style={sectionLbl}>Angles proposés · Jarvis</span>
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
        <span style={sectionLbl}>Hypothèse à tester · depuis la Veille</span>
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
        <span style={sectionLbl}>À trancher</span>
        <BlocPropositions cycle={cycle} onApplied={onApplied} />
      </section>
    </div>
  );
}
