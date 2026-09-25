'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * Le détail de Jarvis · replié par défaut, la conversation au premier plan.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * La page portait le nom « Jarvis » mais restait un TABLEAU DE BORD · huit blocs
 * de mesures empilés (état des couches, essais, notes, relectures, attribution,
 * mémoire, accroches, dépense, réglages) sous une conversation reléguée en
 * bandeau. Chaque bloc répond bien à SA question, à condition de savoir laquelle
 * poser · c'est l'inverse de ce qu'on rencontre en premier.
 *
 * La direction validée tranche : Jarvis est un espace de conversation ; sa
 * configuration, ses connaissances et ses diagnostics restent DISPONIBLES, mais
 * au moment où ils deviennent utiles, pas déroulés d'emblée. On ne supprime
 * rien · on replie. Rien perdu · pas une fonction, pas un chiffre, pas un droit,
 * le contenu ci-dessous est exactement celui d'avant, gardes et gâchettes
 * comprises.
 *
 * ── Pourquoi replié par défaut, et pas caché derrière un onglet lointain ─────
 *
 * Le détail reste à un clic, sous la conversation · qui le veut le déroule sans
 * changer d'écran, qui ne le veut pas garde une page qui tient à la question.
 */
export function DetailJarvis({ brandName, children }: { brandName: string; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();

  return (
    <section style={{ marginTop: 22 }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={id}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
          border: '1px solid var(--line-2)', background: 'var(--surface)', textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            {ouvert ? 'Replier le détail' : `Le détail · ce que Jarvis sait sur ${brandName}`}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>
            {ouvert
              ? 'Mesures, essais, attribution, accroches, réglages · tout ce que Jarvis exploite.'
              : 'Chiffres mesurés, essais, attribution, accroches et réglages · repliés pour laisser la conversation au premier plan.'}
          </span>
        </span>
      </button>

      {/* La région existe toujours (aria-controls la vise) · elle porte le détail
          quand on l'ouvre, une phrase d'attente sinon · le détail n'est pas dans
          le DOM tant qu'on ne l'a pas demandé. */}
      <div id={id} role="region" aria-label={`Détail de ce que Jarvis sait sur ${brandName}`} style={{ marginTop: ouvert ? 6 : 0 }}>
        {ouvert && children}
      </div>
    </section>
  );
}
