'use client';

import { useState } from 'react';
import { createInviteAction } from '../app/actions/invites';
import { Modal } from './Modal';
import { SubmitButton } from './SubmitButton';
import { input } from './ui';

/** Ouvre l'invitation d'un membre en pop-up (au lieu d'un panneau permanent sur la page). */
export function InviteMemberButton() {
  const [open, setOpen] = useState(false);
  const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{
        padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13,
        cursor: 'pointer', background: 'var(--grad-accent)', color: '#0d070c',
      }}>＋ Inviter un membre</button>

      <Modal open={open} onClose={() => setOpen(false)} icon="👥" title="Inviter un membre"
        subtitle="L'invité reçoit un lien pour définir son mot de passe et rejoindre l'espace avec le rôle choisi.">
        <form action={createInviteAction} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={lbl}>E-mail</label>
            <input name="email" type="email" required autoFocus placeholder="collegue@exemple.com" style={input} />
          </div>
          <div>
            <label style={lbl}>Rôle</label>
            <select name="role" defaultValue="member" style={{ ...input, width: '100%' }}>
              <option value="admin">Admin · marques, connexions, équipe</option>
              <option value="member">Membre · analyse, tagging, studio</option>
              <option value="client_viewer">Client (lecture) · dashboard de sa marque</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <SubmitButton label="Créer l'invitation" pendingLabel="Création…" />
          </div>
        </form>
      </Modal>
    </>
  );
}
