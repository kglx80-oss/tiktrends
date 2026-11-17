'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RAISON_CLOTURE_MAX, RAISON_CLOTURE_MIN } from '@tiktrends/core';
import { cloreRapprochementAction, type ResultatRapprochement } from '../../../app/actions/tour-controle';
import { boutonAction, replacerFocus } from '../projet/action-serveur';

/**
 * « Clore le rapprochement » (C1) · le SEUL geste d'écriture de la table des
 * tâches, sur une tâche en rapprochement dont on sait qu'aucun livrable ne
 * viendra. Une raison écrite (au moins `RAISON_CLOTURE_MIN` signes) ouvre le
 * bouton ; l'action serveur (`porteAdminGeste`) pose la demande et son audit,
 * le worker clôt au tour suivant · puis la page est relue. Rien n'est simulé.
 * Un module client n'exporte que des composants ou des types (garde
 * `spatial-fondation`).
 */
export function CloreRapprochement(p: { id: string; permis: boolean; raison: string | null }) {
  const router = useRouter();
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const assez = texte.trim().length >= RAISON_CLOTURE_MIN;
  const ferme = !p.permis || !assez;
  const raisonFerme = !p.permis ? p.raison : assez ? null : `Écris pourquoi aucun livrable ne viendra · ${RAISON_CLOTURE_MIN} signes au moins.`;
  async function clore() {
    if (occupe) return;
    setOccupe(true); setRetour(null);
    try {
      const r: ResultatRapprochement = await cloreRapprochementAction({ jobId: p.id, raison: texte });
      setRetour({ ok: r.ok, texte: r.message });
      if (r.ok) { setTexte(''); router.refresh(); }
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.' });
    } finally {
      setOccupe(false);
      replacerFocus('si-perdu', `#cloture-${p.id}`, `[data-cloture="${p.id}"] summary`);
    }
  }
  return (
    <details data-cloture={p.id} style={{ display: 'inline-block' }}>
      <summary className="btn sm" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>Clore le rapprochement</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8, minWidth: 220 }}>
        {p.permis && (
          <label className="field">Pourquoi aucun livrable ne viendra
            <textarea className="ta" id={`cloture-${p.id}`} rows={2} maxLength={RAISON_CLOTURE_MAX} value={texte} onChange={(e) => setTexte(e.target.value)} />
          </label>
        )}
        <div className="kc" style={{ alignItems: 'center' }}>
          <button type="button" className="btn sm" data-geste="clore-rapprochement" {...boutonAction({
            presse: occupe, occupe, ferme, focalisable: 'tout', surClic: () => { void clore(); },
          })}>{occupe ? 'Clôture…' : 'Clore · échec, crédits rendus'}</button>
          {raisonFerme && <small className="faint" data-raison-cloture="">{raisonFerme}</small>}
        </div>
        {retour && <p role={retour.ok ? 'status' : 'alert'} className="faint" data-retour-cloture={p.id} style={{ fontSize: '12.5px', margin: 0 }}>{retour.texte}</p>}
      </div>
    </details>
  );
}
