import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/**
 * La page de garde d'une section.
 *
 * ── Ce qu'une page de garde ratée fait ───────────────────────────────────────
 *
 * Le Studio ouvrait sur un formulaire. Devant lui, la question n'était pas
 * « lequel choisir » mais « pourquoi ce champ me demande un produit alors que
 * je voulais juste voir ce que l'outil sait faire ». Une racine de section qui
 * commence à travailler avant d'avoir orienté fait payer le premier écran à
 * quelqu'un qui ne sait pas encore ce qu'il cherche.
 *
 * ── Ce qu'elle doit faire à la place ─────────────────────────────────────────
 *
 * Trois choses, et rien d'autre :
 *
 * 1. **Ce que chaque outil produit**, en objets, pas en verbes · « une pub
 *    complète avec accroche et CTA » se comprend, « génère des créatives » ne
 *    dit rien qui distingue un outil du voisin.
 * 2. **Quand s'en servir** · c'est la seule information qui manque vraiment
 *    quand quatre portes se ressemblent.
 * 3. **Où l'on en est** · combien on en a déjà fait, et si l'outil est prêt.
 *
 * ── Le prochain geste n'est pas toujours de générer ──────────────────────────
 *
 * Une page de garde honnête sait dire « tu as quarante créas et aucun verdict ·
 * la quarante-et-unième n'apprendra rien de plus ». C'est le seul endroit où
 * cette phrase peut être dite avant qu'on ait cliqué.
 */

export type HubState =
  /** Prêt à l'emploi. */
  | { kind: 'ready' }
  /** Il manque une clé serveur ou un réglage · on dit lequel. */
  | { kind: 'setup'; why: string }
  /** Le forfait ou le rôle ferme la porte · on dit laquelle, pas « accès refusé ». */
  | { kind: 'locked'; why: string };

export interface HubCard {
  href: string;
  icon: string;
  title: string;
  /** Ce qui sort · en objets concrets. */
  makes: string;
  /** La question à laquelle cet outil répond. */
  when: string;
  state: HubState;
  /** Ce qui existe déjà · `null` quand on n'a pas pu compter. */
  count?: { n: number; label: string } | null;
  /** Badge court · moteur, nouveauté. */
  tag?: string;
}

/** Le geste conseillé maintenant · calculé, jamais décoratif. */
export interface HubNext {
  title: string;
  why: string;
  href: string;
  cta: string;
}

export function Hub({ intro, next, cards, children }: {
  intro: string;
  next?: HubNext | null;
  cards: HubCard[];
  children?: ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 720 }}>{intro}</p>

      {next && (
        <Link href={next.href} style={{
          display: 'flex', alignItems: 'center', gap: 15, padding: '17px 20px', textDecoration: 'none',
          border: '1px solid var(--accent-strong)', borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(230,0,126,.10), var(--surface))',
        }}>
          <span style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--grad-accent)',
            color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 19,
          }}>→</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{next.title}</b>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>{next.why}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-strong)', whiteSpace: 'nowrap' }}>{next.cta} ›</span>
        </Link>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {cards.map((c) => <Carte key={c.href} {...c} />)}
      </div>

      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Carte({ href, icon, title, makes, when, state, count, tag }: HubCard) {
  const ouvert = state.kind === 'ready';
  return (
    <Link href={href} style={{
      display: 'block', padding: '18px 19px', textDecoration: 'none',
      border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)',
      opacity: state.kind === 'locked' ? 0.72 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: 'var(--grad-accent)',
          color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{icon}</span>
        <b style={{ flex: 1, minWidth: 0, fontSize: 15.5, color: 'var(--ink)' }}>{title}</b>
        {tag && (
          <span style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 7px', borderRadius: 999,
            color: 'var(--muted)', border: '1px solid var(--line-2)', whiteSpace: 'nowrap',
          }}>{tag}</span>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{makes}</p>

      {/* La question à laquelle l'outil répond · c'est elle qui fait choisir
          entre quatre portes qui se ressemblent. */}
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>Quand ?</b> {when}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 13, flexWrap: 'wrap' }}>
        <Etat state={state} />
        {count && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {count.n === 0 ? `Aucune ${count.label} pour l’instant` : `${count.n} ${count.label}${count.n > 1 ? 's' : ''}`}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: ouvert ? 'var(--accent-strong)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
          Ouvrir ›
        </span>
      </div>
    </Link>
  );
}

const puce: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
  padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
};

/**
 * L'état, en une puce qui nomme ce qui manque.
 *
 * « Indisponible » laisse chercher · « il manque la clé Fal » se règle.
 */
function Etat({ state }: { state: HubState }) {
  if (state.kind === 'ready') {
    return <span style={{ ...puce, color: '#9fe6b3', background: 'rgba(120,220,150,.12)' }}>● Prêt</span>;
  }
  if (state.kind === 'setup') {
    return <span style={{ ...puce, color: '#f5b043', background: 'rgba(245,166,35,.12)' }}>◐ {state.why}</span>;
  }
  return <span style={{ ...puce, color: 'var(--muted)', background: 'rgba(255,255,255,.05)' }}>🔒 {state.why}</span>;
}
