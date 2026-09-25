'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { ChatContexte } from '../../actions/jarvis-chat';
import { Icon } from '../../../components/Icon';

/**
 * Le contexte de marque, à la demande · ce sur quoi Jarvis s'appuie.
 *
 * ── Pourquoi à la demande ────────────────────────────────────────────────────
 *
 * La conversation reste au premier plan · le contexte ne s'impose pas, il
 * s'ouvre quand on en a besoin, et se referme. On y montre ce que Jarvis a comme
 * appui — l'identité de la marque, ses consignes, ses sources — et surtout la
 * PORTÉE de chaque élément : ici tout est propre à la marque active, et c'est
 * dit. Une consigne sans portée laisse croire qu'elle vaut partout.
 *
 * ── Ce que ce panneau n'est pas ──────────────────────────────────────────────
 *
 * Il ne déclenche rien de payant · il montre et il renvoie vers l'écran qui
 * édite (la marque, ses données). Il n'expose rien de nouveau · c'est le contenu
 * de la marque du membre, en lecture, au même endroit que la conversation.
 */
export function JarvisContexte({ contexte, brandName, onClose }: {
  contexte: ChatContexte;
  brandName: string;
  onClose: () => void;
}) {
  // Échap referme · au clavier, on n'est jamais coincé dans le panneau.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', surTouche);
    ref.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => document.removeEventListener('keydown', surTouche);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Contexte de marque · ${brandName}`}
      style={{
        position: 'absolute', inset: 0, zIndex: 5, background: 'var(--paper)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
        borderBottom: '1px solid var(--line)', background: 'var(--surface)',
      }}>
        <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="brain" size={16} /></span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>Contexte de marque · {brandName}</span>
        <button type="button" onClick={onClose} aria-label="Fermer le contexte" style={{
          width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
          Ce sur quoi Jarvis s’appuie pour cette marque · la portée de chaque élément est indiquée.
          Il ne s’en sert pas comme d’une vérité mesurée · elle oriente, elle ne tranche pas.
        </p>

        <Bloc titre="La marque" portee="marque">
          {contexte.identity
            ? <p style={corps}>{contexte.identity}</p>
            : <p style={{ ...corps, color: 'var(--muted)' }}>Identité pas encore renseignée · description, promesse, audience.</p>}
          <Link href={`/brands/${contexte.brandId}`} style={lien}>Modifier la marque ›</Link>
        </Bloc>

        <Bloc titre="Consignes créatives" portee="marque">
          {contexte.rules
            ? <p style={{ ...corps, whiteSpace: 'pre-wrap' }}>{contexte.rules}</p>
            : <p style={{ ...corps, color: 'var(--muted)' }}>Aucune consigne maison · Jarvis suit alors ses règles générales.</p>}
        </Bloc>

        <Bloc titre="Sources de Jarvis" portee="marque">
          <p style={corps}>
            Mémoire mesurée, accroches et apprentissages de cette marque, avec leur provenance ·
            ils vivent dans les sources détaillées, sous la conversation.
          </p>
          <Link href="/jarvis#detail" style={lien}>Voir les sources et la mémoire ›</Link>
        </Bloc>
      </div>
    </div>
  );
}

/** Une section du contexte · un titre, sa portée, son contenu. */
function Bloc({ titre, portee, children }: { titre: string; portee: 'utilisateur' | 'espace' | 'marque'; children: React.ReactNode }) {
  const PORTEE_LABEL = { utilisateur: 'portée · utilisateur', espace: 'portée · espace', marque: 'portée · marque' } as const;
  return (
    <section style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>{titre}</h3>
        <span style={{
          fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em',
          color: 'var(--muted)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)', whiteSpace: 'nowrap',
        }}>
          {PORTEE_LABEL[portee]}
        </span>
      </div>
      {children}
    </section>
  );
}

const corps = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 } as const;
const lien = { display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' } as const;
