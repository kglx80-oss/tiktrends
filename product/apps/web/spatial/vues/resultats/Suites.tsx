'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COUT_BROUILLON_JARVIS, HYPOTHESE_MIN, MODE_LABEL, REGLE_ITERATION, ecrireFiltreSuites, lienFicheTest, lireFiltreSuites, resultatParentSuite, sensDuSuite, videSuites,
  type FiltreSuites,
} from '@tiktrends/core';
import { createIterationAction, type IterationPlanView, type IterationRow } from '../../../app/actions/adsmap-iterate';
import { draftConceptAction, type DraftView } from '../../../app/actions/adsmap-draft';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useGeste, Retour } from './geste';
import { Brouillon } from './Brouillon';
import type { SousNavResultats } from './communs';

/**
 * « Suites » · le plan d'itération de l'ancienne Adsmap (`/adsmap/suites`) ·
 * ce qu'on fait des tests une fois qu'ils ont parlé. Lu par `iterationPlanAction`
 * (verdicts ARBITRÉS seulement) · chaque suite se crée par `createIterationAction`
 * avec son hypothèse (une seule variable), ou se fait écrire par Jarvis
 * (`draftConceptAction`, coût annoncé AVANT le clic, sous le plafond de dépense).
 * Ce qu'il ne faut pas toucher (« À conserver ») passe avant tout · le réflexe,
 * quand une créa ne convertit pas, est de tout refaire.
 */

export interface PropsSuites {
  sousNav: SousNavResultats;
  sous: string;
  plan: IterationPlanView | null;
  erreur: string | null;
}

const MODES = ['more', 'better', 'new'] as const;
const PILL: Record<(typeof MODES)[number], string> = { more: 'g', better: 'w', new: 'c' };

export function Suites(p: PropsSuites) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<FiltreSuites>('all');
  const [creee, setCreee] = useState<{ adId: string; asIteration: boolean; label: string } | null>(null);
  // Le filtre vit dans l'adresse (remplacement) · le Retour le retrouve. Il ne recalcule rien.
  useEffect(() => { setFiltre(lireFiltreSuites(window.location.search)); }, []);
  const choisir = (f: FiltreSuites) => {
    setFiltre(f);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${ecrireFiltreSuites(window.location.search, f)}`);
  };
  const lignes = p.plan?.rows ?? [];
  const visibles = filtre === 'all' ? lignes : lignes.filter((r) => r.mode === filtre);
  const compte = (m: FiltreSuites) => (m === 'all' ? lignes.length : lignes.filter((r) => r.mode === m).length);
  const vide = p.plan && lignes.length === 0 ? videSuites(p.plan.examined) : null;

  return (
    <Vue>
      <EnTete titre="Suites" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap/boucle" />
      <div className="toolbar">
        <p style={{ flex: '1 1 260px', fontSize: '13px' }} className="muted">{lignes.length > 0 ? p.plan?.summary : 'Choisis le prochain test à partir de tes résultats · décliner ce qui a gagné, corriger ce qui a lâché, ou repartir.'}</p>
        <button type="button" className="btn sm" onClick={() => router.refresh()}><Ic n="loop" />Recalculer</button>
      </div>
      {lignes.length > 0 && (
        <div className="pcats">
          {(['all', ...MODES] as const).map((m) => (
            <button type="button" className="chip" key={m} aria-pressed={filtre === m} onClick={() => choisir(m)}>{m === 'all' ? 'Tous' : MODE_LABEL[m]} · {compte(m)}</button>
          ))}
        </div>
      )}
      {creee && (
        <section className="tile" role="status" style={{ marginBottom: 12, borderColor: '#7ef0b040' }}>
          <p style={{ fontSize: '13px' }}>Suite de « {creee.label} » créée {creee.asIteration ? 'en itération · la filiation est enregistrée' : 'en nouveau concept · le parent n’a pas de victoire prouvée'}. Elle attend son brief.</p>
          <Lien className="btn sm" href={lienFicheTest(creee.adId)} style={{ justifySelf: 'start', marginTop: 8 }}>Ouvrir sa fiche</Lien>
        </section>
      )}
      {p.erreur ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur}</p></section>
      ) : vide ? (
        <section className="tile"><strong>{vide.titre}</strong><p className="muted" style={{ fontSize: '13px' }}>{vide.pourquoi}</p></section>
      ) : visibles.length === 0 && lignes.length > 0 ? (
        <section className="tile">
          <p className="muted">Aucune suite en « {filtre !== 'all' ? MODE_LABEL[filtre] : ''} » · {lignes.length} suite{lignes.length > 1 ? 's' : ''} en tout, réparties sur les autres modes.</p>
          <button type="button" className="btn sm" style={{ marginTop: 10, justifySelf: 'start' }} onClick={() => choisir('all')}>Tout revoir</button>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visibles.map((r) => <CarteSuite key={`${r.adId}-${r.changedVariable}`} r={r} onCree={(c) => setCreee({ ...c, label: r.label })} />)}
        </div>
      )}
      <p className="faint" style={{ fontSize: '12px', marginTop: 14, maxWidth: 760 }}>Un tunnel est ordonné · une créa qui échoue à la conversion a été vue, regardée et cliquée, ces réponses sont déjà payées. C’est pourquoi chaque suite affiche d’abord ce qu’il ne faut pas toucher, et change exactement une variable. La règle d’itération : {REGLE_ITERATION}</p>
    </Vue>
  );
}

function CarteSuite({ r, onCree }: { r: IterationRow; onCree: (c: { adId: string; asIteration: boolean }) => void }) {
  const { occupe, message, geste } = useGeste();
  const [ouvert, setOuvert] = useState(false);
  const [hypo, setHypo] = useState('');
  const [brouillon, setBrouillon] = useState<DraftView | null>(null);
  const ecrire = () => geste('ecrire', () => draftConceptAction({ origin: 'suite', intent: r.rationale, freeze: r.freezeLabels, changedVariable: r.variableLabel }), (x) => {
    setBrouillon(x.view ?? null);
    return null;
  }, { rafraichir: false });
  const creer = () => geste('creer', () => createIterationAction({ parentAdId: r.adId, mode: r.mode, changedVariable: r.changedVariable, stageTargeted: r.stageTargeted, hypothesis: hypo }), (x) => {
    if (x.adId) onCree({ adId: x.adId, asIteration: !!x.asIteration });
    setHypo(''); setOuvert(false);
    return 'Suite créée · elle attend son brief';
  });
  return (
    <section className="tile">
      <div className="kc" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`pill ${PILL[r.mode]}`}>{r.modeLabel}</span>
        <strong>{r.label}</strong>
        {r.spend !== null && r.spend > 0 && <span className="faint" style={{ fontSize: '12px' }}>· {Math.round(r.spend).toLocaleString('fr-FR')} € engagés</span>}
      </div>
      <p className="muted" style={{ fontSize: '13px' }}>{resultatParentSuite({ verdict: r.parentVerdict, comparable: r.parentComparable, etapeLachee: r.parentEtapeLachee })}</p>
      <p style={{ fontSize: '13.5px' }}>Changer · <b>{r.variableLabel}</b></p>
      {r.freezeLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="faint" style={{ fontSize: '11.5px' }}>À conserver</span>
          {r.freezeLabels.map((f) => <span className="pill" key={f}>{f}</span>)}
        </div>
      )}
      {!r.edgeLegal && (
        <p style={{ fontSize: '12px', color: 'var(--warn)' }}>Le parent n’a pas de victoire PROUVÉE au protocole · ce sera enregistré comme nouveau concept, pas comme itération. Une descendance attribuerait une performance non démontrée.</p>
      )}
      <details>
        <summary className="faint" style={{ cursor: 'pointer', fontSize: '12.5px' }}>Pourquoi cette suite</summary>
        <p style={{ fontSize: '12.5px', marginTop: 6 }}>{sensDuSuite(r.mode, r.modeHint, r.edgeLegal)}</p>
        <p className="muted" style={{ fontSize: '12.5px', marginTop: 4 }}>{r.rationale}</p>
      </details>
      {brouillon && (
        <Brouillon vue={brouillon}>
          <button type="button" className="btn sm pri" style={{ justifySelf: 'start' }} onClick={() => { setHypo(brouillon.draft.hypothesis); setOuvert(true); }}>Créer la suite avec ce concept</button>
        </Brouillon>
      )}
      {!ouvert ? (
        <div className="foot2" style={{ marginTop: 6 }}>
          <button type="button" className="btn sm pri" onClick={() => setOuvert(true)}><Ic n="plus" />Créer la suite</button>
          {!brouillon && (
            <button type="button" className="btn sm" disabled={!!occupe} title={`Un appel modèle, sous le plafond de dépense de l’espace · ${COUT_BROUILLON_JARVIS}`} onClick={() => { void ecrire(); }}>
              <Ic n="spark" />{occupe === 'ecrire' ? 'Jarvis écrit…' : `Demander le concept à Jarvis · ${COUT_BROUILLON_JARVIS}`}
            </button>
          )}
        </div>
      ) : (
        <form className="blform" style={{ marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); void creer(); }} onKeyDown={(e) => { if (e.key === 'Escape') setOuvert(false); }}>
          <textarea value={hypo} onChange={(e) => setHypo(e.target.value)} maxLength={600} autoFocus placeholder={`En changeant ${r.variableLabel}, j’attends…`} aria-label="Ce que ce test parie · sans hypothèse écrite, son résultat n’apprendra rien" />
          <div className="kc">
            <button type="button" className="btn sm" onClick={() => setOuvert(false)}>Annuler</button>
            <button type="submit" className="btn sm pri" disabled={!!occupe || hypo.trim().length < HYPOTHESE_MIN} style={{ marginLeft: 'auto' }}>{occupe === 'creer' ? 'Création…' : 'Créer'}</button>
          </div>
        </form>
      )}
      <Retour message={message} />
    </section>
  );
}
