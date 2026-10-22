'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../Icon';
import styles from './FenetreAssistant.module.css';

/** Native dialog supplies focus trapping, Escape and inert background. */
export function FenetreAssistant({ children, onFermer, titre = 'Que voulez-vous créer ?' }: { children: ReactNode; onFermer: () => void; titre?: string }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!monte) return;
    const el = dialog.current;
    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    el?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, [monte]);
  if (!monte) return null;
  return createPortal(
    <dialog ref={dialog} className={styles.dialog} aria-label="Nouveau projet" onCancel={(e) => { e.preventDefault(); onFermer(); }}>
      <header className={styles.head}><h2>Nouveau projet · {titre}</h2><button type="button" aria-label="Fermer" className={styles.close} onClick={onFermer}><Icon name="x" size={18} /></button></header>
      <div className={styles.body}>{children}</div>
    </dialog>, document.body,
  );
}
