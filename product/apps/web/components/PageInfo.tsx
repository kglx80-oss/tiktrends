'use client';

import type { ReactNode } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { DepliableEchap } from './DepliableEchap';
import { useIsMobile } from './useIsMobile';

/**
 * Le mode d'emploi de la page · un « chip » repérable qui déplie une courte
 * explication (natif `<details>`, sans JS).
 *
 * Il existait déjà sur 26 pages, mais si discret (gris muet, minuscule) que le
 * propriétaire ne l'avait jamais vu. On le rend visible : une pastille bordée,
 * un « i » en accent, un libellé lisible · sans crier, mais on le trouve.
 *
 * Recette #106 · Échap le referme et rend le focus au chip (`DepliableEchap`) ;
 * au doigt (tactile ou écran étroit) le chip fait 44 px, à la souris il garde
 * sa taille compacte (31 px mesurés).
 */
export function PageInfo({ children, title = 'Mode d’emploi', minHeight, mb }: {
  children: ReactNode; title?: string;
  /** Hauteur minimale du chip · opt-in (ex. 44 pour la cible tactile) · absente
   *  ailleurs, les 26 autres usages gardent leur taille inchangée. */
  minHeight?: number;
  /** Marge basse · opt-in (ex. 0 pour poser le chip dans une rangée partagée) ·
   *  absente ailleurs, les 26 autres usages gardent leur marge de 14. */
  mb?: number;
}) {
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  const hauteur = minHeight ?? (tactile ? CIBLE_TACTILE_MIN : undefined);
  return (
    <DepliableEchap style={{ position: 'relative', display: 'inline-block', marginBottom: mb ?? 14 }}>
      <summary style={{
        listStyle: 'none', cursor: 'pointer', userSelect: 'none',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        ...(hauteur ? { minHeight: hauteur } : null),
        padding: '5px 12px 5px 7px', borderRadius: 999,
        border: '1px solid var(--line-2)', background: 'var(--surface)',
        fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)',
      }}>
        <span style={{
          display: 'inline-flex', width: 17, height: 17, borderRadius: '50%',
          background: 'var(--accent-soft)', color: 'var(--accent-strong)',
          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontStyle: 'italic', fontWeight: 800,
        }}>i</span>
        <span>{title}</span>
        <span aria-hidden style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </summary>
      <div style={{
        position: 'absolute', zIndex: 10, top: 'calc(100% + 6px)', left: 0, width: 360, maxWidth: '80vw',
        padding: '13px 15px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)',
        boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6,
      }}>
        {children}
      </div>
    </DepliableEchap>
  );
}
