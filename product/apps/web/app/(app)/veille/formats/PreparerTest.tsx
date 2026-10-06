'use client';

import { useRef, useState } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { trackSavedAdAction } from '../../../actions/adsmap-bridge';
import { Icon } from '../../../../components/Icon';

/**
 * « Préparer un test » · le parcours EXISTANT Sauvegardes → Adsmap
 * (`trackSavedAdAction`) · l'annonce devient un concept « imitation » en
 * brouillon. Rien n'est lancé, rien n'est généré, aucune dépense · le libellé et
 * le retour le disent. Affiché seulement quand Adsmap est ouvert à l'espace et
 * qu'une marque est active (même condition que Sauvegardes).
 */
export function PreparerTest({ platform, externalId }: { platform: string; externalId: string }) {
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok' | string>('repos');
  const verrou = useRef(false);
  const lancer = async () => {
    if (verrou.current || etat === 'ok') return;
    verrou.current = true;
    setEtat('envoi');
    try {
      const r = await trackSavedAdAction({ platform, externalId });
      setEtat(r.error ? r.error : 'ok');
    } catch {
      setEtat('Échec · vérifie ta connexion puis réessaie.');
    } finally {
      verrou.current = false;
    }
  };
  const fait = etat === 'ok';
  const erreur = etat !== 'repos' && etat !== 'envoi' && etat !== 'ok' ? etat : null;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <button type="button" onClick={() => { void lancer(); }} aria-disabled={fait || etat === 'envoi'} title="Crée un concept « imitation » en brouillon dans Adsmap · rien n’est lancé"
        style={{
          width: '100%', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 10px', borderRadius: 9,
          border: '1px solid ' + (fait ? 'transparent' : 'var(--line-2)'), background: fait ? 'var(--accent-soft)' : 'var(--paper)',
          color: fait ? 'var(--accent-strong)' : 'var(--ink-2)', cursor: fait || etat === 'envoi' ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 600,
        }}>
        <span style={{ display: 'inline-flex' }} aria-hidden><Icon name="map" size={15} /></span>
        <span>{fait ? 'Brouillon de test créé dans Adsmap' : etat === 'envoi' ? 'Préparation…' : 'Préparer un test · Adsmap'}</span>
      </button>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: erreur ? 'var(--danger, #e5484d)' : 'var(--muted)' }}>
        {erreur ?? (fait ? <><a href="/adsmap" style={{ color: 'var(--accent-strong)', fontWeight: 700 }}>Ouvrir Adsmap</a> · hypothèse et variable à compléter avant le test.</> : '')}
      </p>
    </div>
  );
}
