'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Jarvis récupérable · S01 du cahier des charges (V3-01, F48).
 *
 * ── Ce qu'il répare ──────────────────────────────────────────────────────────
 *
 * La page Jarvis a rendu une erreur brute, plein écran, sans issue · une
 * exception au chargement de la mémoire emportait toute la page. Le travail
 * paraissait perdu alors que les dossiers étaient intacts.
 *
 * ── Ce qu'il garantit ────────────────────────────────────────────────────────
 *
 * Un `error.tsx` de segment · Next capture l'exception ICI, sous l'enveloppe
 * `(app)` · la navigation, la marque et le reste de l'outil tiennent. On propose
 * trois issues (réessayer, revenir au travail, joindre le support) et la
 * référence technique reste copiable dans un détail. Rien n'est régénéré · une
 * panne ne déclenche jamais d'appel payant.
 */
export default function JarvisError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // La référence technique aide le diagnostic · on la laisse dans la console du
  // navigateur en plus du détail copiable, sans jamais l'afficher brute à la place
  // du contenu.
  useEffect(() => { console.error('Jarvis indisponible', error); }, [error]);

  const lien = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 40, padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: 13,
    textDecoration: 'none', border: '1px solid var(--line-2)', color: 'var(--ink-2)', background: 'transparent',
  } as const;

  return (
    <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Jarvis</h1>
      <div role="alert" style={{
        marginTop: 20, padding: '20px 22px', borderRadius: 16,
        border: '1px solid rgba(245,166,35,.45)', background: 'rgba(245,166,35,.08)',
      }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
          Jarvis est momentanément indisponible.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          Vos dossiers restent accessibles · rien n’est perdu, et rien n’a été facturé.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" onClick={reset} style={{
            ...lien, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, cursor: 'pointer',
          }}>Réessayer</button>
          <Link href="/adsmap" style={lien}>Revenir à l’Adsmap</Link>
          <Link href="/support" style={lien}>Contacter le support</Link>
        </div>
        {error.digest && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>Référence technique</summary>
            <code style={{ display: 'block', marginTop: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 11.5, color: 'var(--ink-2)', userSelect: 'all', wordBreak: 'break-all' }}>
              {error.digest}
            </code>
          </details>
        )}
      </div>
    </main>
  );
}
