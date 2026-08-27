'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { saveWorkspaceNameAction } from '../app/actions/admin';
import { Modal } from './Modal';
import { input, lbl } from './ui';

const ERR: Record<string, string> = { forbidden: 'Réservé aux administrateurs.', name: "Indique un nom d'espace.", session: 'Session expirée.' };

/** Réglages rapides en pop-up : nom de l'espace + langue · sans quitter la page. */
export function QuickSettingsModal({ open, onClose, workspaceName, showAdvanced }: {
  open: boolean; onClose: () => void; workspaceName: string; showAdvanced: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveWorkspaceNameAction, null);

  useEffect(() => { if (state?.ok) { router.refresh(); onClose(); } }, [state, router, onClose]);

  return (
    <Modal open={open} onClose={onClose} icon="⚙️" title="Réglages rapides" subtitle="Nom de l'espace et préférences d'affichage.">
      <form action={formAction} style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={lbl}>Nom de l'espace</label>
          <input name="name" defaultValue={workspaceName} required autoFocus placeholder="Nom de ton espace / agence" style={input} />
          {state?.error && <div style={{ fontSize: 12, color: '#ff9db0', marginTop: 6 }}>{ERR[state.error] ?? 'Erreur.'}</div>}
        </div>
        <div>
          <label style={lbl}>Langue de l'interface</label>
          <select disabled style={{ ...input, opacity: .7 }}><option>Français</option></select>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>D'autres langues arrivent prochainement.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {showAdvanced
            ? <Link href="/settings" onClick={onClose} style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>Réglages avancés ›</Link>
            : <span />}
          <button type="submit" disabled={pending} style={{ padding: '11px 22px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: pending ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: pending ? .6 : 1 }}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
