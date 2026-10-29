'use client';

import { useState } from 'react';
import { Ic } from '../../communs';
import { verifierOffreV2Action, type ResultatOffreV2 } from '../../../app/actions/stripe-diagnostic';

const STATUT: Record<string, { c: string; mot: string }> = { ok: { c: 'g', mot: 'OK' }, a_faire: { c: 'w', mot: 'À faire' }, erreur: { c: 'r', mot: 'Erreur' } };

/**
 * « Prêt pour l'offre V2 ? » · le bouton « Vérifier » lance la lecture RÉELLE
 * (lecture seule) de Stripe et de l'environnement, puis rend chaque contrôle
 * avec son statut en mot (OK · À faire · Erreur) et son geste correctif · la
 * couleur ne porte rien seule. Rien n'est lu à l'affichage.
 */
export function PretOffreV2() {
  const [res, setRes] = useState<ResultatOffreV2 | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [panne, setPanne] = useState(false);
  const lancer = async () => {
    setEnCours(true); setPanne(false);
    try { setRes(await verifierOffreV2Action()); } catch { setPanne(true); } finally { setEnCours(false); }
  };
  const d = res?.ok ? res.diagnostic : null;
  const etat = panne || (res && !res.ok) ? 'erreur' : d ? (d.pret ? 'pret' : 'incomplet') : 'attente';
  return (
    <div style={{ display: 'grid', gap: 12 }} data-offre-v2={etat}>
      <div className="kc"><button className="btn sm pri" type="button" disabled={enCours} onClick={lancer}><Ic n="loop" />{enCours ? 'Vérification…' : d ? 'Vérifier à nouveau' : 'Vérifier'}</button></div>
      {panne && <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Vérification impossible · le serveur n’a pas répondu, réessaie dans un instant.</p>}
      {res && !res.ok && <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>{res.message}</p>}
      {d && (
        <>
          <div className="kc" style={{ alignItems: 'center' }} data-phrase>
            <span className={`pill ${d.pret ? 'g' : 'w'}`}>{d.pret ? <><Ic n="check" />Prêt</> : 'Pas encore prêt'}</span>
            <b style={{ fontSize: 13, whiteSpace: 'normal' }}>{d.phrase}</b>
          </div>
          <div className="atable">
            {d.lignes.map((l) => (
              <div className="atr" key={l.cle} data-controle-v2={l.statut} data-cle={l.cle} style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span><span className={`pill ${STATUT[l.statut]?.c ?? ''}`}>{STATUT[l.statut]?.mot ?? l.statut}</span></span>
                <span style={{ whiteSpace: 'normal' }}>
                  <b>{l.libelle}</b>
                  <small className="faint" style={{ display: 'block' }}>{l.detail}</small>
                  {l.geste && <small style={{ display: 'block' }}>Geste · {l.geste}</small>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
