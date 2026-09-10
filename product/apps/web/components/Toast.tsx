'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

/**
 * Le retour, dit là où on le cherche · en bas de l'écran, après le clic.
 *
 * ── Pourquoi ce composant existe ─────────────────────────────────────────────
 *
 * Beaucoup d'actions serveur réussissaient EN SILENCE · une synchro lancée, une
 * sauvegarde faite, un envoi parti, et rien à l'écran. Le rapport reçu est
 * toujours le même : « je ne sais pas si ça a marché ». Chaque composant qui
 * voulait répondre se bricolait un `setMsg` local, affiché ailleurs sur la page,
 * souvent hors du regard de qui vient de cliquer.
 *
 * Un seul canal, monté une fois au-dessus de l'app · `useToast()` rend `toast()`,
 * le retour apparaît au même endroit partout, et disparaît seul.
 *
 * ── L'accessibilité n'est pas en option ──────────────────────────────────────
 *
 * La pile est une région `aria-live="polite"` · un lecteur d'écran annonce le
 * message sans voler le focus. Un toast se ferme seul, au clic, ou à Échap.
 */

export type ToastKind = 'ok' | 'err' | 'info';
interface Toast { id: number; message: string; kind: ToastKind }

interface ToastApi {
  /** Pousse un retour. `kind` défaut « ok ». Renvoie l'id (pour un éventuel retrait). */
  toast: (message: string, kind?: ToastKind) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

// Durée de vie · une erreur reste plus longtemps, on a plus à lire et à corriger.
const VIE: Record<ToastKind, number> = { ok: 3800, info: 4200, err: 6500 };

const TON: Record<ToastKind, { bord: string; pastille: string; icone: string }> = {
  ok: { bord: 'rgba(24,204,140,.45)', pastille: 'var(--ok, #18cc8c)', icone: '✓' },
  err: { bord: 'rgba(255,77,109,.45)', pastille: 'var(--err, #ff4d6d)', icone: '!' },
  info: { bord: 'var(--line-2)', pastille: 'var(--accent-strong)', icone: 'ℹ' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const h = timers.current.get(id);
    if (h) { clearTimeout(h); timers.current.delete(id); }
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = seq.current++;
    setToasts((list) => [...list, { id, message, kind }]);
    const h = setTimeout(() => dismiss(id), VIE[kind]);
    timers.current.set(id, h);
    return id;
  }, [dismiss]);

  // Échap ferme le plus récent · un retour ne doit jamais rester coincé devant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToasts((list) => list.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Au démontage, on purge les minuteries · pas de setState sur un arbre parti.
  useEffect(() => () => { timers.current.forEach((h) => clearTimeout(h)); timers.current.clear(); }, []);

  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}
      <div
        role="status" aria-live="polite" aria-atomic="false"
        style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          zIndex: 2147483000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          width: 'min(92vw, 420px)', pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastLigne key={t.id} t={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function ToastLigne({ t, onClose }: { t: Toast; onClose: () => void }) {
  const ton = TON[t.kind];
  const style: CSSProperties = {
    pointerEvents: 'auto', width: '100%', display: 'flex', alignItems: 'center', gap: 11,
    padding: '11px 13px', borderRadius: 13, border: `1px solid ${ton.bord}`,
    background: 'var(--surface)', boxShadow: 'var(--sh-lift, 0 14px 34px -10px rgba(0,0,0,.6))',
    fontSize: 13.5, color: 'var(--ink)',
  };
  return (
    <div style={style}>
      <span aria-hidden style={{
        width: 20, height: 20, flexShrink: 0, borderRadius: 999, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
        color: '#0d070c', background: ton.pastille,
      }}>{ton.icone}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
      <button type="button" onClick={onClose} aria-label="Fermer" style={{
        flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--muted)',
        fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 2,
      }}>×</button>
    </div>
  );
}

/** Le canal de retour · à appeler dans tout composant client sous `ToastProvider`. */
export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast doit être utilisé sous <ToastProvider>.');
  return ctx;
}
