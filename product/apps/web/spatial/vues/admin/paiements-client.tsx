'use client';

import { useState } from 'react';
import { Ic } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { runStripeDiagnosticAction } from '../../../app/actions/stripe-diagnostic';

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
