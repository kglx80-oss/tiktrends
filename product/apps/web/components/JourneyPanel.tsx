'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, cheminOuvert, type Journey, type JourneyStep, type Relance, type RegleChemin } from '@tiktrends/core';
import { Icon } from './Icon';

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

/**
 * `regles` (lot 11) · ce que le rôle ouvre. Une étape cochée qui mène à un
 * écran fermé au rôle (« Créer ta marque » pour un membre) reste affichée,
 * sans lien · elle renvoyait sinon à l'accueil. Absent = tout ouvert.
 */
export function JourneyPanel({ j, relance = null, regles = [] }: { j: Journey; relance?: Relance | null; regles?: RegleChemin[] }) {
  // `ouvert` ne pilote QUE le reste du parcours (la liste des étapes) · l'action
  // dominante, elle, reste TOUJOURS visible. Replié par défaut · la liste des
  // étapes ne doit pas repousser le reste de l'écran hors de vue.
  const [ouvert, setOuvert] = useState(false);
  const listeId = useId();
  useEffect(() => {
    try { setOuvert(localStorage.getItem(OUVERT) === '1'); } catch { /* stockage indispo */ }
  }, []);

  const basculer = () => setOuvert((o) => {
    const n = !o;
    try { localStorage.setItem(OUVERT, n ? '1' : '0'); } catch { /* ignore */ }
    return n;
  });

  // Le circuit complet n'a plus rien à guider · on rend la place.
  if (j.complete) return null;

  const pct = j.totalRequired ? Math.round((j.doneCount / j.totalRequired) * 100) : 0;
  const requises = j.steps.filter((s) => !s.optional && s.key !== j.next?.key);
  const optionnelles = j.steps.filter((s) => s.optional && s.status !== 'done');

  return (
    <section aria-label="Ta prochaine étape" style={{ border: '1px solid var(--line-2)', borderRadius: 18, marginBottom: 22, background: 'var(--surface)', padding: '18px 20px' }}>
      {/* En-tête · titre + progression compacte, toujours. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
        <Anneau pct={pct} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Ta prochaine étape</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {j.doneCount}/{j.totalRequired} · {j.next?.label ?? 'en attente d’un accès'}
          </p>
        </div>
      </div>

      {/* Relance douce · quand une étape de valeur traîne. */}
      {relance && (
        <div style={{ marginTop: 14, padding: '13px 15px', borderRadius: 14, border: '1px solid rgba(254,44,85,.35)', background: 'var(--paper)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="sparkles" size={15} /></span>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{relance.titre}</div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.55 }}>{relance.corps}</div>
        </div>
      )}

      {/* L'ACTION dominante · TOUJOURS visible. Quand aucune action n'est
          autorisée (`next` nul · ex. étapes réservées à un admin pour un
          membre), on énonce un état FACTUEL · on ne propose pas une action
          interdite, et « en attente » ne veut pas dire « terminé ». */}
      {j.next ? (
        <Link href={j.next.href} style={{ display: 'block', marginTop: 14, padding: '15px 17px', borderRadius: 14, border: '1px solid rgba(254,44,85,.35)', background: 'var(--paper)', textDecoration: 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>Prochaine étape</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{j.next.label} ›</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.55 }}>{j.next.why}</div>
        </Link>
      ) : (
        <div style={{ marginTop: 14, padding: '13px 15px', borderRadius: 14, border: '1px solid var(--line-2)', background: 'var(--paper)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>En attente</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginTop: 4, lineHeight: 1.5 }}>
            Rien à faire de ton côté pour l’instant · la mise en route de l’espace revient à un administrateur.
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{j.doneCount}/{j.totalRequired} étapes · le reste du parcours ci-dessous.</div>
        </div>
      )}

      {/* Le reste du parcours · derrière une révélation, replié par défaut · il
          ne repousse pas Analyser & décider hors de l'écran. */}
      <button type="button" onClick={basculer} aria-expanded={ouvert} aria-controls={listeId}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, marginTop: 12, padding: '0 4px', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        {ouvert ? 'Masquer le parcours' : 'Voir le parcours'} <span aria-hidden>{ouvert ? '▴' : '▾'}</span>
      </button>

      <div id={listeId} hidden={!ouvert} style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          {requises.map((s) => <Ligne key={s.key} s={s} lien={cheminOuvert(s.href, regles)} />)}
        </div>
        {optionnelles.length > 0 && (
          <>
            <p style={{ margin: '15px 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Quand tu veux · ça améliore les résultats sans bloquer la suite
            </p>
            <div style={{ display: 'grid', gap: 4 }}>
              {optionnelles.map((s) => <Ligne key={s.key} s={s} lien={cheminOuvert(s.href, regles)} />)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Ligne({ s, lien }: { s: JourneyStep; lien: boolean }) {
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
            exactement la question qu'on voulait éviter. Le verrou de rôle a sa
            propre raison · un membre ne « fait pas d'abord » l'étape admin, il
            ne la fait pas du tout. */}
        {s.status === 'blocked' && s.lockedByRole && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}> · réservé à un admin de l’espace</span>
        )}
        {s.status === 'blocked' && !s.lockedByRole && s.blockedBy && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}> · après « {s.blockedBy} »</span>
        )}
      </span>
    </>
  );

  const style: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, minHeight: CIBLE_TACTILE_MIN, padding: '6px 8px',
    borderRadius: 9, textDecoration: 'none',
  };

  // On ne lie pas une étape bloquée · y envoyer quelqu'un le ferait arriver
  // devant un écran qu'il ne peut pas encore remplir. Ni une étape dont
  // l'écran est fermé au rôle (lot 11).
  return s.status === 'blocked' || !lien
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
