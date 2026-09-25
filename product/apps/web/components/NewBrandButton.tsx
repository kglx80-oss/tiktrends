'use client';

import { useState } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Modal } from './Modal';
import { BrandWizard } from './BrandWizard';

/**
 * Création de marque en pop-up : le parcours complet (5 étapes) s'ouvre sans quitter
 * la page courante. Le lien vers la page dédiée reste valable (accès direct, partage).
 */
export function NewBrandButton({ aiReady, draftCost, label = '+ Nouvelle marque', variant = 'primary' }: {
  aiReady: boolean; draftCost: number; label?: string; variant?: 'primary' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, borderRadius: 999, cursor: 'pointer' } as const;
  const style = variant === 'primary'
    ? { ...base, padding: '9px 16px', border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13 }
    : { ...base, padding: '8px 14px', border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5 };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={style as React.CSSProperties}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Créer une marque" maxWidth={880}
        subtitle="Jarvis pré-remplit depuis ton site · tu vérifies et tu valides.">
        <BrandWizard aiReady={aiReady} draftCost={draftCost} embedded />
      </Modal>
    </>
  );
}
