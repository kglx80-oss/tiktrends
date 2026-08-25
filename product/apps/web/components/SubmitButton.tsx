'use client';

import { useFormStatus } from 'react-dom';
import type { CSSProperties } from 'react';

/** Bouton de soumission avec état « en cours » (feedback pendant les actions serveur lentes). */
export function SubmitButton({ label, pendingLabel, disabled, style }: {
  label: string; pendingLabel?: string; disabled?: boolean; style?: CSSProperties;
}) {
  const { pending } = useFormStatus();
  const off = disabled || pending;
  return (
    <button type="submit" disabled={off} style={{
      padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5,
      cursor: off ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: off ? .6 : 1, whiteSpace: 'nowrap',
      ...style,
    }}>
      {pending ? (pendingLabel ?? 'En cours…') : label}
    </button>
  );
}
