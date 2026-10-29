'use client';

import { useCallback, useEffect, useState } from 'react';
import { CREDIT_COSTS, costFor, forceReglement, lectureCouverture, niveauScore, PLAYBOOKS_REGLES } from '@tiktrends/core';
import { analysisCoverageAction, analyzeAssetsAction, type AnalysisCoverage } from '../../../app/actions/adsmap-analyze';
import { proposeJarvisRulesAction, saveJarvisLearningsAction, saveJarvisRulesAction, trainJarvisAction } from '../../../app/actions/jarvis';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';

/**
 * Les gestes de « Sources de Jarvis » (vague 3), branchés sur les actions
 * EXISTANTES · décrire les créas (`analyzeAssetsAction`, couverture et coût en
 * dollars dits AVANT le bouton), entraîner Jarvis (`trainJarvisAction`) et lui
 * proposer des règles (`proposeJarvisRulesAction`), coût en crédits sur le
 * bouton · chaque appel passe par la barrière de dépense. Un message de
 * réussite n'apparaît qu'au retour sans erreur de l'action.
 */

/** Décrire les créas · la couverture d'abord, puis le coût de la tranche, puis le bouton. */
export function DecrireCreas() {
  const { toast } = useSpatial();
  const [c, setC] = useState<AnalysisCoverage | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const charger = useCallback(async () => { const r = await analysisCoverageAction(); if (r.coverage) setC(r.coverage); }, []);
  useEffect(() => { void charger(); }, [charger]);

  async function decrire() {
    if (occupe) return;
    setOccupe(true); setMsg(null); setDetails([]);
    const r = await analyzeAssetsAction();
    setOccupe(false);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setMsg({ texte: r.summary ?? 'Terminé.', erreur: false });
    setDetails([...new Set((r.skipped ?? []).map((s) => s.reason))].slice(0, 5));
    toast('Description terminée');
    await charger();
  }

  const l = c ? lectureCouverture(c) : null;
  return (
    <div className="tile" id="decrire" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <div className="member"><strong>Décrire les créas</strong>
        <button type="button" className="btn sm pri" style={{ marginLeft: 'auto' }} onClick={() => void decrire()} disabled={occupe || !l || l.restant === 0}>
          <Ic n="spark" />{occupe ? 'Analyse…' : l ? l.bouton : 'Lecture de la couverture…'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: '12.5px' }}>La mémoire ne peut parler d’accroches, d’ouvertures et de talents que si chaque créa a été décrite. L’agent regarde le visuel et le texte, et note ce qu’il voit · il ne juge rien, le jugement reste au verdict.</p>
      {l && <small style={{ color: l.faible ? 'var(--warn)' : 'var(--fg3)' }}>{l.texte}</small>}
      {l?.tranche && <small className="faint">Cette tranche · {l.tranche.cout} · {l.tranche.detail}</small>}
      {msg && <p role={msg.erreur ? 'alert' : 'status'} style={{ fontSize: '12.5px', color: msg.erreur ? 'var(--bad)' : undefined }}>{msg.texte}</p>}
      {details.length > 0 && <ul className="faint" style={{ margin: 0, paddingLeft: 16, fontSize: '11.5px' }}>{details.map((d) => <li key={d}>{d}</li>)}</ul>}
      <small className="faint">{CREDIT_COSTS.asset_analysis} crédits par créa · par lots de 25, remboursés quand l’agent ne trouve rien à décrire.</small>
    </div>
  );
}

const COUT_ENTRAINEMENT = costFor('review_mining', 1);
const COUT_REGLES = costFor('brief', 1);

/** L'entraînement · Jarvis distille les pubs qui tiennent chez les concurrents (coût en crédits sur le bouton). */
export function EntrainementJarvis({ marque, initial, entraineLe }: { marque: string; initial: string; entraineLe: string | null }) {
  const { toast } = useSpatial();
  const [texte, setTexte] = useState(initial);
  const [le, setLe] = useState(entraineLe);
  const [occupe, setOccupe] = useState<'entraine' | 'enregistre' | null>(null);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);

  async function entrainer() {
    if (occupe) return;
    if (texte.trim() && !window.confirm(`Ré-entraîner Jarvis ? Cela remplace l’intelligence créative actuelle (${COUT_ENTRAINEMENT} crédits).`)) return;
    setOccupe('entraine'); setMsg(null);
    const r = await trainJarvisAction();
    setOccupe(null);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    if (r.learnings) {
      setTexte(r.learnings); setLe(new Date().toISOString());
      setMsg({ texte: `Jarvis entraîné sur ${r.adsAnalyzed ?? 0} pub(s) analysée(s)${r.cost ? ` (${r.cost} crédits)` : ''}. Injecté dès la prochaine génération.`, erreur: false });
    }
  }
  async function enregistrer() {
    if (occupe) return;
    setOccupe('enregistre'); setMsg(null);
    const r = await saveJarvisLearningsAction({ learnings: texte });
    setOccupe(null);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    toast('Intelligence créative enregistrée');
  }

  return (
    <div className="tile" id="entrainement" style={{ display: 'grid', gap: 10 }}>
      <div className="member"><strong>Entraînement · intelligence créative · {marque}</strong>
        <button type="button" className="btn sm pri" style={{ marginLeft: 'auto' }} onClick={() => void entrainer()} disabled={!!occupe}>
          <Ic n="spark" />{occupe === 'entraine' ? 'Jarvis apprend…' : `Entraîner Jarvis · ${COUT_ENTRAINEMENT} crédits`}
        </button>
      </div>
      <p className="muted" style={{ fontSize: '12.5px' }}>Jarvis analyse les pubs qui tiennent dans la durée chez tes concurrents et dans ta niche (un proxy public de traction, pas une preuve de résultat) et en distille des pistes récurrentes. Elles sont injectées dans chaque génération pour l’orienter · à toi de tester ce qui marche chez toi.</p>
      <textarea className="ta" value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} aria-label="Intelligence créative"
        placeholder="Aucune intelligence pour l’instant. Lance « Entraîner Jarvis » : il analysera les pubs qui tiennent encore chez tes concurrents et écrira ici les récurrences qu’il en tire." />
      <div className="member">
        <small className="faint">{le ? `Dernier entraînement : ${new Date(le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'Jamais entraîné'}</small>
        {texte.trim() && <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => void enregistrer()} disabled={!!occupe}>{occupe === 'enregistre' ? 'Enregistrement…' : 'Enregistrer'}</button>}
      </div>
      {msg && <p role={msg.erreur ? 'alert' : 'status'} style={{ fontSize: '12.5px', color: msg.erreur ? 'var(--bad)' : undefined }}>{msg.texte}</p>}
    </div>
  );
}

/** Les règles créatives · force du règlement (noyau), playbooks, proposition IA (coût sur le bouton), enregistrement. */
export function ReglesJarvis({ marque, initial }: { marque: string; initial: string }) {
  const { toast } = useSpatial();
  const [regles, setRegles] = useState(initial);
  const [occupe, setOccupe] = useState<'propose' | 'enregistre' | null>(null);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const force = forceReglement(regles);
  const niveau = niveauScore(force.score);

  async function enregistrer() {
    if (occupe) return;
    setOccupe('enregistre'); setMsg(null);
    const r = await saveJarvisRulesAction({ creativeRules: regles });
    setOccupe(null);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    toast('Règles Jarvis enregistrées');
  }
  async function proposer() {
    if (occupe) return;
    if (regles.trim() && !window.confirm(`Remplacer le règlement actuel par la proposition de Jarvis (${COUT_REGLES} crédits) ?`)) return;
    setOccupe('propose'); setMsg(null);
    const r = await proposeJarvisRulesAction();
    setOccupe(null);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    if (r.rules) { setRegles(r.rules); setMsg({ texte: `Proposition générée par Jarvis${r.cost ? ` (${r.cost} crédits)` : ''}. Vérifie, ajuste, puis enregistre.`, erreur: false }); }
  }

  return (
    <div className="tile" id="regles" style={{ display: 'grid', gap: 10, marginTop: 14 }}>
      <div className="member"><strong>Règles créatives · {marque}</strong>
        <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => void proposer()} disabled={!!occupe}>
          <Ic n="spark" />{occupe === 'propose' ? 'Jarvis réfléchit…' : `Proposer par IA · ${COUT_REGLES} crédits`}
        </button>
      </div>
      <p className="muted" style={{ fontSize: '12.5px' }}>Tes consignes maison, en langage naturel. Jarvis les impose à chaque génération (image et vidéo), en priorité sur tout le reste : style, ton, obligations, interdits, mentions.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`pill ${niveau === 'fort' ? 'g' : niveau === 'correct' ? 'c' : 'w'}`} style={{ marginLeft: 0 }} data-force={force.score}>Force du règlement · {force.score}</span>
        {force.dimensions.map((d) => <span key={d.libelle} className={`pill ${d.couverte ? 'g' : ''}`} style={{ marginLeft: 0, fontSize: 10.5 }}>{d.libelle}</span>)}
        <small className="faint" style={{ marginLeft: 'auto' }}>{force.mots} mots</small>
      </div>
      <textarea className="ta" value={regles} onChange={(e) => setRegles(e.target.value)} rows={9} aria-label="Règles créatives"
        placeholder="Style visuel · Ton · Toujours · Jamais · Mentions obligatoires · Edge concurrentiel" />
      <div className="cats" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <small className="faint">Playbooks :</small>
        {PLAYBOOKS_REGLES.map((pb) => (
          <button key={pb.cle} type="button" className="chip" disabled={!!occupe}
            onClick={() => { if (!regles.trim() || window.confirm(`Charger le playbook « ${pb.libelle} » ? Cela remplace le texte actuel.`)) setRegles(pb.regles); }}>{pb.libelle}</button>
        ))}
        <button type="button" className="btn sm pri" style={{ marginLeft: 'auto' }} onClick={() => void enregistrer()} disabled={!!occupe}>{occupe === 'enregistre' ? 'Enregistrement…' : 'Enregistrer les règles'}</button>
      </div>
      {msg && <p role={msg.erreur ? 'alert' : 'status'} style={{ fontSize: '12.5px', color: msg.erreur ? 'var(--bad)' : undefined }}>{msg.texte}</p>}
    </div>
  );
}
