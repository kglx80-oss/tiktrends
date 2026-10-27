'use client';

import { useState } from 'react';
import {
  LIBELLE_VERDICT, MODES_ITERATION, PORTEES_APPRENTISSAGE, VARIABLES_ITERATION, controleArbitrage, lienFicheTest,
  type PorteeApprentissage, type TestedVariable, type VerdictValue,
} from '@tiktrends/core';
import { createIterationAction, validateVerdictAction } from '../../../app/actions/adsmap-verdict';
import { Ic, Lien } from '../../communs';
import { useGeste, Retour } from './geste';

/**
 * Les gestes RÉELS de la fiche d'un test · chacun appelle l'action serveur
 * existante, qui garde (rôle, marque, invariants) et écrit.
 *
 *  · arbitrer · `validateVerdictAction` · le verdict retenu (le calcul par
 *    défaut), le MOTIF exigé dès qu'on s'en écarte, l'apprentissage, sa portée
 *    et sa confiance (invariant §2.4, vérifié aussi par l'action) ;
 *  · itérer une gagnante · `createIterationAction` (mode, une variable, sa
 *    nouvelle valeur, l'hypothèse) · l'enfant naît en brouillon ;
 *  · reprendre ailleurs · un projet Studios prérempli (lien, rien n'est généré) ;
 *  · partager · le partage client, quand la créa gagne et que la personne peut partager.
 */

export interface PropsActionsFiche {
  adId: string;
  /** Un verdict calculé pas encore arbitré · `null` sinon (rien à arbitrer, ou déjà arbitré). */
  arbitrage: { calcule: VerdictValue } | null;
  suite:
    | { type: 'attente'; texte: string }
    | { type: 'perdante'; texte: string; lien: string }
    | { type: 'gagnante'; studio: string | null; etapeCiblee: string | null };
  /** Gagnante validée ET personne qui peut partager (admin) · sinon aucune invite. */
  partage: boolean;
}

export function ActionsFiche(p: PropsActionsFiche) {
  return (
    <>
      {p.arbitrage && <Arbitrage adId={p.adId} calcule={p.arbitrage.calcule} />}
      <Suite {...p} />
    </>
  );
}

function Arbitrage({ adId, calcule }: { adId: string; calcule: VerdictValue }) {
  const { occupe, message, setMessage, geste } = useGeste();
  const [retenu, setRetenu] = useState<VerdictValue>(calcule);
  const [motif, setMotif] = useState('');
  const [enonce, setEnonce] = useState('');
  const [portee, setPortee] = useState<PorteeApprentissage>('ad');
  const [confiance, setConfiance] = useState(3);
  const ecart = retenu !== calcule;
  return (
    <section className="tile sec" aria-label="Arbitrer ce test">
      <h2>Arbitrer ce test</h2>
      <p className="muted" style={{ fontSize: '12.5px', marginTop: 4 }}>Un verdict ne se valide qu’avec ce qu’il t’apprend · c’est cette phrase que Jarvis relira avant d’écrire la prochaine créa, pas le verdict.</p>
      <form className="blform" style={{ marginTop: 12 }} onSubmit={(e) => {
        e.preventDefault();
        const refus = controleArbitrage({ calcule, retenu, motif, enonce });
        if (refus) { setMessage({ texte: refus, erreur: true }); return; }
        void geste('valider', () => validateVerdictAction({ adId, value: retenu, overrideReason: ecart ? motif : undefined, learning: { statement: enonce, scope: portee, confidence: confiance } }), () => 'Verdict validé · apprentissage enregistré');
      }}>
        <div className="fields">
          <label className="field">Verdict retenu
            <select value={retenu} onChange={(e) => setRetenu(e.target.value as VerdictValue)}>
              {(Object.keys(LIBELLE_VERDICT) as VerdictValue[]).map((v) => <option key={v} value={v}>{LIBELLE_VERDICT[v].court}{v === calcule ? ' · calculé' : ''}</option>)}
            </select>
          </label>
          <label className="field">Confiance · {confiance}/5
            <input type="range" min={1} max={5} value={confiance} onChange={(e) => setConfiance(Number(e.target.value))} style={{ accentColor: 'var(--acc)' }} />
          </label>
        </div>
        {ecart && <textarea value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={600} placeholder="Ce que tu as vu et que le chiffre ignore (ex : la vidéo a été coupée par la modération au bout de deux jours)" aria-label="Motif de l’écart au calcul" />}
        <textarea value={enonce} onChange={(e) => setEnonce(e.target.value)} maxLength={600} placeholder="Ce que ce test t’apprend (ex : sur cet avatar, une accroche chiffrée tient l’attention là où une question la perd)" aria-label="Ce que ce test t’apprend" />
        <div className="kc">
          <span className="faint" style={{ fontSize: '11.5px' }}>Ça vaut pour</span>
          {PORTEES_APPRENTISSAGE.map(([cle, libelle]) => (
            <button type="button" className="chip" key={cle} aria-pressed={portee === cle} onClick={() => setPortee(cle)}>{libelle}</button>
          ))}
          <button className="btn sm pri" type="submit" disabled={!!occupe} style={{ marginLeft: 'auto' }}>{occupe ? 'Enregistrement…' : 'Valider le verdict'}</button>
        </div>
      </form>
      <Retour message={message} />
    </section>
  );
}

function Suite(p: PropsActionsFiche) {
  const { occupe, message, geste } = useGeste();
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<'more' | 'better' | 'new'>('better');
  const [variable, setVariable] = useState<TestedVariable>('hook');
  const [valeur, setValeur] = useState('');
  const [hypothese, setHypothese] = useState('');
  const [enfant, setEnfant] = useState<string | null>(null);
  const s = p.suite;
  return (
    <section className="tile sec" aria-label="La suite">
      <h2>La suite</h2>
      {s.type === 'attente' && <p className="muted" style={{ fontSize: '13px', marginTop: 4 }}>{s.texte}</p>}
      {s.type === 'perdante' && (
        <>
          <p className="muted" style={{ fontSize: '13px', marginTop: 4 }}>{s.texte}</p>
          <div className="foot2" style={{ marginTop: 12 }}><Lien className="btn sm pri" href={s.lien}><Ic n="spark" />Reprendre l’angle dans un projet</Lien></div>
        </>
      )}
      {s.type === 'gagnante' && !ouvert && (
        <div className="foot2" style={{ marginTop: 12 }}>
          {s.studio && <Lien className="btn sm" href={s.studio}><Ic n="spark" />Préparer l’itération dans un projet</Lien>}
          <button type="button" className="btn sm pri" onClick={() => setOuvert(true)}><Ic n="loop" />Créer l’itération</button>
          <small>{enfant ? 'Itération créée en brouillon · elle attend ce qui change.' : 'L’itération naît en brouillon, avec l’offre et la page héritées · il ne restera que ce qui change à produire.'}</small>
        </div>
      )}
      {s.type === 'gagnante' && ouvert && (
        <form className="blform" style={{ marginTop: 12 }} onSubmit={(e) => {
          e.preventDefault();
          void geste('iterer', () => createIterationAction({ parentAdId: p.adId, mode, changedVariable: variable, variableValue: valeur, hypothesis: hypothese, stageTargeted: s.etapeCiblee }), (r) => {
            setEnfant(r.adId ?? null); setOuvert(false); setValeur(''); setHypothese('');
            return 'Itération créée · elle naît en brouillon';
          });
        }}>
          <div className="kc">
            {MODES_ITERATION.map(([cle, titre, aide]) => (
              <button type="button" className="chip" key={cle} aria-pressed={mode === cle} title={aide} onClick={() => setMode(cle)}>{titre}</button>
            ))}
          </div>
          <span className="faint" style={{ fontSize: '11.5px' }}>{MODES_ITERATION.find(([c]) => c === mode)![2]}</span>
          <div className="fields">
            <label className="field">Variable changée · une seule
              <select value={variable} onChange={(e) => setVariable(e.target.value as TestedVariable)}>
                {VARIABLES_ITERATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">Nouvelle valeur
              <input value={valeur} onChange={(e) => setValeur(e.target.value)} maxLength={300} placeholder="Ex : accroche chiffrée « 3 erreurs qui… »" />
            </label>
          </div>
          <textarea value={hypothese} onChange={(e) => setHypothese(e.target.value)} maxLength={600} placeholder="Hypothèse (ex : une accroche chiffrée fera passer le taux d’accroche de 24 % à 30 %)" aria-label="Hypothèse de l’itération" />
          <div className="kc">
            <button type="button" className="btn sm" onClick={() => setOuvert(false)}>Annuler</button>
            <button className="btn sm pri" type="submit" disabled={!!occupe} style={{ marginLeft: 'auto' }}>{occupe ? 'Création…' : 'Créer'}</button>
          </div>
        </form>
      )}
      {enfant && <Lien className="btn sm" href={lienFicheTest(enfant)} style={{ marginTop: 10 }}>Ouvrir l’itération</Lien>}
      <Retour message={message} />
      {p.partage && s.type === 'gagnante' && (
        <div className="tile" style={{ marginTop: 14, borderColor: '#7ef0b040' }}>
          <p style={{ fontSize: '13px' }}>Cette créa gagne · montre le résultat au client. La page partagée n’expose que ce qui a été testé et ce qui a gagné, en marque blanche · jamais l’outil.</p>
          <Lien className="btn sm pri" href="/adsmap/partage" style={{ marginTop: 10, justifySelf: 'start' }}><Ic n="users" />Partager au client</Lien>
        </div>
      )}
    </section>
  );
}
