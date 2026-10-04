'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { messageEchecEnregistrement } from '@tiktrends/core';
import { saveWorkspaceNameAction } from '../app/actions/admin';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { input, lbl } from './ui';

/**
 * Réglages rapides en pop-up : nom de l'espace + langue · sans quitter la page.
 *
 * Lot 16 · le résultat de l'action est lu à son retour (`await`), plus par
 * `useActionState` · celui-ci n'arrivait qu'avec la transition du routeur qui
 * cale (fenêtre figée « Enregistrement… », mesuré) et restait `ok` ensuite, ce
 * qui refermait la fenêtre à chaque réouverture. Le nom enregistré remonte à
 * la coquille (`onSaved`), qui l'affiche sans attendre le rendu serveur ·
 * l'action revalide déjà le gabarit, aucun `router.refresh()` de plus.
 */
export function QuickSettingsModal({ open, onClose, onSaved, workspaceName, showAdvanced }: {
  open: boolean; onClose: () => void; onSaved?: (name: string) => void; workspaceName: string; showAdvanced: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    setPending(true); setErreur(null);
    try {
      const r = await saveWorkspaceNameAction(null, fd);
      if (r?.ok) { onSaved?.(String(fd.get('name') ?? '').trim()); onClose(); }
      else setErreur(messageEchecEnregistrement(r?.error));
    } catch {
      setErreur(messageEchecEnregistrement(null));
    } finally {
      setPending(false);
    }
  }

  const fermer = () => { setErreur(null); onClose(); };

  return (
    <Modal open={open} onClose={fermer} icon={<Icon name="gear" size={18} />} title="Réglages rapides" subtitle="Nom de l'espace et préférences d'affichage.">
      <form onSubmit={enregistrer} style={{ display: 'grid', gap: 16 }}>
        <div>
          <label htmlFor="reglages-nom-espace" style={lbl}>Nom de l'espace</label>
          <input id="reglages-nom-espace" name="name" defaultValue={workspaceName} required autoFocus placeholder="Nom de ton espace / agence" aria-invalid={!!erreur} aria-describedby={erreur ? 'reglages-erreur' : undefined} style={input} />
          {erreur && <div id="reglages-erreur" role="alert" style={{ fontSize: 12, color: '#ff9db0', marginTop: 6 }}>{erreur}</div>}
        </div>
        <div>
          <label style={lbl}>Langue de l'interface</label>
          <select disabled style={{ ...input, opacity: .7 }}><option>Français</option></select>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>D'autres langues arrivent prochainement.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {showAdvanced
            ? <Link href="/settings" onClick={fermer} style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>Réglages avancés ›</Link>
            : <span />}
          <button type="submit" disabled={pending} aria-busy={pending || undefined} style={{ padding: '11px 22px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: pending ? 'default' : 'pointer', background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: pending ? .6 : 1 }}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
