'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import css from './AssistantProjet.module.css';

export function PanneauAssistant({ titre, children, onFermer }: { titre: string; children: ReactNode; onFermer: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (avant?.isConnected) avant.focus(); };
  }, []);
  return <><div className={css.wzscrim} aria-hidden /><section ref={ref} role="dialog" aria-modal="true" aria-label={titre} className={css.wzpanel} onKeyDown={(e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFermer(); }
    if (e.key !== 'Tab') return;
    const controles = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') ?? [])].filter(el => el.getClientRects().length > 0);
    const premier = controles[0], dernier = controles.at(-1);
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus(); }
  }}><header className={css.wzpanelhead}><h3>{titre}</h3><button type="button" onClick={onFermer} aria-label="Fermer le panneau">×</button></header><div className={css.wzpanelbody}>{children}</div><footer><button type="button" onClick={onFermer}>Fermer</button></footer></section></>;
}
