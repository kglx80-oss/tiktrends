'use client';

import { useState, type CSSProperties } from 'react';
import { accrocheNouveauConcept, CIBLE_TACTILE_MIN, type EtatNouveauProjet } from '@tiktrends/core';
import { Icon } from '../../Icon';

const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

/**
 * L'écran de création conversationnelle · « Nouveau concept créatif ».
 *
 * PRÉSENTATIONNEL et INERTE · il n'écrit rien, n'appelle aucun modèle, ne crée ni
 * projet ni conversation. Il porte l'accroche (texte UI du noyau) et le
 * composeur. L'envoi est HONNÊTEMENT « à venir » (comme la pièce jointe de
 * Jarvis) · la création réelle démarrera au premier message, hors de ce
 * périmètre. On ne simule aucun envoi ni aucun succès.
 *
 * Les états viennent du noyau (`etatNouveauProjet`) · sans marque active, on
 * mène vers les marques ; en lecture seule, on le DIT.
 */
export function NouveauConcept({ etat }: { etat: EtatNouveauProjet }) {
  const [saisie, setSaisie] = useState('');

  if (etat.etat === 'lecture-seule') {
    return <p data-concept="lecture-seule" style={{ ...note, maxWidth: 420 }}>{etat.message}</p>;
  }
  if (etat.etat === 'sans-marque') {
    return (
      <p data-concept="sans-marque" style={{ ...note, maxWidth: 420 }}>
        {etat.message} <a href={etat.lien.href} style={{ color: 'var(--accent-strong)' }}>{etat.lien.libelle}</a>
      </p>
    );
  }

  return (
    <section data-concept="pret" style={{ maxWidth: 760, display: 'grid', gap: 16 }}>
      <p data-accroche style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35 }}>
        {accrocheNouveauConcept(etat.marque.nom)}
      </p>

      <div data-composeur data-cadre="controle" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 24, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          rows={2}
          placeholder={`Décris ce que tu veux créer pour ${etat.marque.nom}…`}
          aria-label="Décrire ton concept créatif"
          style={{ width: '100%', minHeight: 60, boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 16, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, outline: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...note, color: 'var(--muted)' }}>Gratuit · rien n’est généré ni facturé ici.</span>
          {/* Envoi · HONNÊTE · à venir (la création démarrera au premier message,
              hors de ce périmètre). On ne simule aucun envoi. */}
          <button
            type="button" disabled aria-disabled="true"
            data-envoi="a-venir" title="Bientôt · ton premier message créera le concept"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', cursor: 'not-allowed', fontSize: 14, fontWeight: 600 }}
          >
            <Icon name="spark" size={16} /> Envoyer
            <span aria-hidden style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line-2)' }}>Bientôt</span>
          </button>
        </div>
      </div>
    </section>
  );
}
