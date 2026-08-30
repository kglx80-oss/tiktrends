'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Journey, JourneyStep } from '@tiktrends/core';

/**
 * Le chemin, affiché.
 *
 * ── Ce qu'on montre en grand, et ce qu'on montre en petit ────────────────────
 *
 * **Une** prochaine action, en grand, avec ce qu'elle débloque. Le reste du
 * chemin en dessous, compact · il ne sert pas à être fait maintenant, il sert à
 * montrer où l'on va. Sans lui, la première étape ressemble à une corvée
 * administrative ; avec lui, elle ressemble à un début.
 *
 * ── Il se replie, il ne disparaît pas ────────────────────────────────────────
 *
 * L'ancien encart s'effaçait définitivement au premier « Masquer », et un
 * nouveau membre de l'équipe n'y avait plus jamais droit. Celui-ci se replie en
 * une ligne · il reste utile à l'étape six, quand on cherche pourquoi Meta ne
 * remonte rien.
 *
 * ── Une étape bloquée dit par quoi ───────────────────────────────────────────
 *
 * Griser sans expliquer produit exactement la question qu'on voulait éviter.
 */

const OUVERT = 'tt_journey_open_v1';

const TON: Record<JourneyStep['status'], { fg: string; bd: string }> = {
  done: { fg: '#7ee8bf', bd: 'rgba(126,232,191,.35)' },
  now: { fg: 'var(--accent-strong)', bd: 'rgba(254,44,85,.35)' },
  blocked: { fg: 'var(--muted)', bd: 'var(--line)' },
};

const puce: CSSProperties = {
  width: 18, height: 18, borderRadius: 999, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 10, fontWeight: 800,
};

export function JourneyPanel({ j, firstName }: { j: Journey; firstName: string }) {
  const [ouvert, setOuvert] = useState(true);
  useEffect(() => {
    try { setOuvert(localStorage.getItem(OUVERT) !== '0'); } catch { /* stockage indispo */ }
  }, []);

  const basculer = () => setOuvert((o) => {
    const n = !o;
    try { localStorage.setItem(OUVERT, n ? '1' : '0'); } catch { /* ignore */ }
    return n;
  });

  // Le circuit complet n'a plus rien à guider · on rend la place.
  if (j.complete) return null;

  const pct = j.totalRequired ? Math.round((j.doneCount / j.totalRequired) * 100) : 0;

  return (
    <div style={{
      border: '1px solid var(--line-2)', borderRadius: 18, marginBottom: 22,
      background: 'linear-gradient(135deg, rgba(255,60,120,.07), var(--surface) 60%)',
      padding: ouvert ? '20px 22px' : '13px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
        <Anneau pct={pct} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: ouvert ? 18 : 15, fontWeight: 800, color: 'var(--ink)' }}>
            {j.doneCount === 0 ? `Bien démarrer, ${firstName}` : 'Ton chemin'}
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {ouvert ? j.summary : `${j.doneCount}/${j.totalRequired} · ${j.next?.label ?? 'à jour'}`}
          </p>
        </div>
        <button
          type="button" onClick={basculer}
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {ouvert ? 'Replier' : 'Voir le chemin'}
        </button>
      </div>

      {ouvert && (
        <>
          {/* LA prochaine action · en grand, seule, avec ce qu'elle débloque. */}
          {j.next && (
            <Link
              href={j.next.href}
              style={{
                display: 'block', marginTop: 16, padding: '15px 17px', borderRadius: 14,
                border: '1px solid rgba(254,44,85,.35)', background: 'var(--surface)', textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>
                Prochaine étape
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{j.next.label} ›</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.55 }}>{j.next.why}</div>
            </Link>
          )}

          {/* Le reste du chemin · il dit où l'on va, il n'appelle pas au clic. */}
          <div style={{ display: 'grid', gap: 4, marginTop: 14 }}>
            {j.steps.filter((s) => !s.optional && s.key !== j.next?.key).map((s) => (
              <Ligne key={s.key} s={s} />
            ))}
          </div>

          {j.steps.some((s) => s.optional && s.status !== 'done') && (
            <>
              <p style={{ margin: '15px 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Quand tu veux · ça améliore les résultats sans bloquer la suite
              </p>
              <div style={{ display: 'grid', gap: 4 }}>
                {j.steps.filter((s) => s.optional && s.status !== 'done').map((s) => (
                  <Ligne key={s.key} s={s} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Ligne({ s }: { s: JourneyStep }) {
  const t = TON[s.status];
  const contenu = (
    <>
      <span style={{
        ...puce,
        border: `1px solid ${t.bd}`,
        background: s.status === 'done' ? 'rgba(126,232,191,.12)' : 'transparent',
        color: t.fg,
      }}>
        {s.status === 'done' ? '✓' : s.status === 'blocked' ? '·' : '→'}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 12.5, fontWeight: s.status === 'now' ? 700 : 600,
          color: s.status === 'blocked' ? 'var(--muted)' : 'var(--ink)',
          textDecoration: s.status === 'done' ? 'line-through' : 'none',
          textDecorationColor: 'var(--line-2)',
        }}>
          {s.label}
        </span>
        {/* Une étape bloquée dit PAR QUOI · griser sans expliquer produit
            exactement la question qu'on voulait éviter. */}
        {s.status === 'blocked' && s.blockedBy && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}> · après « {s.blockedBy} »</span>
        )}
      </span>
    </>
  );

  const style: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px',
    borderRadius: 9, textDecoration: 'none',
  };

  // On ne lie pas une étape bloquée · y envoyer quelqu'un le ferait arriver
  // devant un écran qu'il ne peut pas encore remplir.
  return s.status === 'blocked'
    ? <div style={style}>{contenu}</div>
    : <Link href={s.href} style={style}>{contenu}</Link>;
}

function Anneau({ pct }: { pct: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }} aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke="var(--accent-strong)" strokeWidth="4"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink)">{pct}%</text>
    </svg>
  );
}
