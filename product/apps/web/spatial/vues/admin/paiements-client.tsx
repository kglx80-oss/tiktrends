'use client';

import { useState } from 'react';
import { Ic } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { runStripeDiagnosticAction, type StripeDiagnostic } from '../../../app/actions/stripe-diagnostic';

/**
 * « Vérifier » · lance le diagnostic RÉEL de la chaîne Stripe (clé, prix,
 * webhook, portail · action existante, sans paiement) et dit son résultat.
 * Aucun « synchronisé » n'est affiché sans que la vérification ait tourné.
 */
export function VerifierStripe() {
  const { toast } = useSpatial();
  const [enCours, setEnCours] = useState(false);
  const lancer = async () => {
    setEnCours(true);
    try {
      const r = await runStripeDiagnosticAction();
      if (r.error) toast(r.error);
      else {
        const bloquants = r.checks.filter((c) => c.level === 'fail').length;
        const alertes = r.checks.filter((c) => c.level === 'warn').length;
        toast(bloquants ? `Stripe · ${bloquants} point${bloquants > 1 ? 's' : ''} bloquant${bloquants > 1 ? 's' : ''}` : `Stripe · chaîne opérationnelle (mode ${r.mode})${alertes ? ` · ${alertes} avertissement${alertes > 1 ? 's' : ''}` : ''}`);
      }
    } catch {
      toast('Vérification impossible · réessaie dans un instant');
    } finally {
      setEnCours(false);
    }
  };
  return <button className="btn sm" type="button" disabled={enCours} onClick={lancer}><Ic n="loop" />{enCours ? 'Vérification…' : 'Vérifier'}</button>;
}

const PASTILLE: Record<string, { c: string; mot: string }> = { ok: { c: 'g', mot: 'Conforme' }, warn: { c: 'w', mot: 'À surveiller' }, fail: { c: 'r', mot: 'Bloquant' } };

/**
 * Le diagnostic COMPLET de la chaîne Stripe (ancien `/admin/paiement`) · chaque
 * contrôle de l'action existante (clé et mode, prix, webhook, portail), écrit
 * avec son verdict en mot · la couleur ne porte rien seule. Sans paiement.
 */
export function DiagnosticStripe() {
  const [res, setRes] = useState<StripeDiagnostic | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [panne, setPanne] = useState(false);
  const lancer = async () => {
    setEnCours(true); setPanne(false);
    try { setRes(await runStripeDiagnosticAction()); } catch { setPanne(true); } finally { setEnCours(false); }
  };
  const bloquants = res?.checks.filter((c) => c.level === 'fail').length ?? 0;
  return (
    <div style={{ display: 'grid', gap: 12 }} data-diagnostic={res ? (res.error ? 'erreur' : bloquants ? 'bloquant' : 'ok') : 'attente'}>
      <div className="kc"><button className="btn sm pri" type="button" disabled={enCours} onClick={lancer}><Ic n="loop" />{enCours ? 'Vérification…' : res ? 'Relancer la vérification' : 'Lancer la vérification'}</button></div>
      {panne && <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Vérification impossible · le serveur n’a pas répondu, réessaie dans un instant.</p>}
      {res?.error && <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>{res.error}</p>}
      {res && !res.error && (
        <>
          <div className="kc" style={{ alignItems: 'center' }}>
            <span className={`pill ${res.mode === 'live' ? 'g' : 'c'}`}>Mode {res.mode === 'live' ? 'réel' : 'test'}</span>
            <b style={{ fontSize: 13 }}>{bloquants ? `${bloquants} point${bloquants > 1 ? 's' : ''} bloquant${bloquants > 1 ? 's' : ''}` : 'Chaîne de paiement opérationnelle'}</b>
            {res.mode === 'test' && <small className="faint">aucun paiement réel n’est encaissé dans ce mode</small>}
          </div>
          <div className="atable">
            {res.checks.map((c, i) => (
              <div className="atr" key={i} data-controle={c.level} style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span><span className={`pill ${PASTILLE[c.level]?.c ?? ''}`}>{PASTILLE[c.level]?.mot ?? c.level}</span></span>
                <span style={{ whiteSpace: 'normal' }}><b>{c.label}</b><small className="faint" style={{ display: 'block' }}>{c.detail}</small></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
