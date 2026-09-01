'use client';

import { useCallback, useEffect, useState, useTransition, type CSSProperties } from 'react';
import { VISUAL_UNIVERSES } from '@tiktrends/ai';
import {
  UNIVERSE_AUTO, UNIVERSE_FAMILIES, UNIVERSE_HINT, UNIVERSE_SWATCH,
  filterUniverses, type UniverseFamily,
} from '@tiktrends/core';
import { universeSamplesAction } from '../app/actions/ads';
import { universePreviewsAction, generateUniversePreviewsAction, type UniversePreviewsView } from '../app/actions/universe-previews';

/**
 * Choisir un univers visuel à l'œil.
 *
 * ── Ce qu'une liste de libellés demandait ────────────────────────────────────
 *
 * « Éditorial premium » et « Sombre cinématique » ne se départagent pas en
 * lisant deux lignes · on les reconnaît, ou on ne les choisit pas. Le seul moyen
 * de savoir ce qu'un univers donnait était de payer une génération pour voir.
 *
 * ── L'aperçu est une vraie créa de la marque ─────────────────────────────────
 *
 * Pas une image de démonstration. Une image de démo montrerait ce que l'univers
 * donne sur un produit qui n'est pas le vôtre, c'est-à-dire à peu près ce qu'on
 * devine déjà en lisant son nom.
 *
 * La marque a déjà payé des générations · la meilleure démonstration est la
 * sienne, et elle ne coûte rien. Tant qu'aucune n'existe pour un univers, on
 * montre son dégradé et sa phrase · jamais la créa d'un autre univers, qui
 * vendrait une ambiance pour une autre.
 *
 * ── Et quand la marque n'a encore rien ? ─────────────────────────────────────
 *
 * Une marque neuve voit huit dégradés · la promesse « choisis à l'œil » ne tient
 * alors qu'après plusieurs séries payées à l'aveugle. On propose donc de
 * fabriquer les huit aperçus, une fois, sur le produit de la marque, avec **le
 * prix écrit sur le bouton**.
 *
 * Rien ne part au chargement de la page. Un aperçu fabriqué n'est jamais refait.
 * Ces deux règles vivent dans le noyau, pas ici · un écran qui décide seul de ce
 * qu'il regénère finit par regénérer ce qu'il a déjà.
 *
 * ── Les filtres répondent à la question qui vient avant ──────────────────────
 *
 * Huit vignettes se parcourent, pas se comparent. La famille tranche d'abord la
 * direction — produit seul, quelqu'un qui s'en sert, une ambiance — et le style
 * se choisit ensuite, dans un choix réduit.
 *
 * « Varié (auto) » traverse tous les filtres : ce n'est pas un univers, c'est le
 * refus d'en choisir un.
 */

const OPTIONS = [{ key: UNIVERSE_AUTO, label: '✦ Varié (auto)' }, ...VISUAL_UNIVERSES];

const chip = (on: boolean): CSSProperties => ({
  padding: '6px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
  fontWeight: on ? 800 : 600,
  border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
  background: on ? 'var(--grad-accent)' : 'transparent',
  color: on ? '#0d070c' : 'var(--ink-2)',
});

export function UniversePicker({ value, onChange, disabled = false, compact = false }: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  /** Vignettes plus basses · pour la fenêtre de démarrage rapide, déjà chargée. */
  compact?: boolean;
}) {
  const [famille, setFamille] = useState<UniverseFamily | null>(null);
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [fabrique, setFabrique] = useState<UniversePreviewsView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, lancer] = useTransition();

  // Les aperçus sont un confort, jamais une condition d'affichage · une lecture
  // en échec laisse les dégradés en place et ne dit rien.
  const charger = useCallback(async () => {
    const [creas, faits] = await Promise.all([
      universeSamplesAction().catch(() => ({} as Record<string, string>)),
      universePreviewsAction().catch(() => null),
    ]);
    setApercus(creas);
    setFabrique(faits);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const fabriquer = () => lancer(async () => {
    setMsg(null);
    const r = await generateUniversePreviewsAction();
    if (r.error) { setMsg(r.error); return; }
    setMsg(r.failed
      ? `${r.made} aperçu(s) fabriqué(s) · ${r.failed} ont échoué et gardent leur dégradé. Tu n’es débité que de ce qui a abouti.`
      : `${r.made} aperçu(s) fabriqué(s).`);
    await charger();
  });

  const visibles = filterUniverses(OPTIONS, famille);
  const hauteur = compact ? 70 : 92;

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 11 }}>
        <button type="button" onClick={() => setFamille(null)} style={chip(famille === null)}>Tous</button>
        {UNIVERSE_FAMILIES.map((f) => (
          <button key={f.key} type="button" title={f.hint} onClick={() => setFamille(f.key)} style={chip(famille === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Le prix est SUR le bouton · un prix qu'on découvre après n'est pas un
          prix, c'est une facture. Rien ne part au chargement de la page. */}
      {fabrique?.ready && fabrique.plan.missing.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 11,
          padding: '9px 12px', borderRadius: 12, border: '1px dashed var(--line-2)', background: 'var(--paper)',
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, flex: '1 1 240px' }}>
            {fabrique.plan.summary} Fabriqués une fois sur ton produit · un aperçu déjà fait n’est jamais refait.
          </span>
          <button type="button" onClick={fabriquer} disabled={disabled || busy} style={{
            padding: '8px 15px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 800,
            cursor: disabled || busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c',
            opacity: disabled || busy ? .55 : 1, whiteSpace: 'nowrap',
          }}>
            {busy ? 'Fabrication…' : `Fabriquer · ${fabrique.plan.credits} cr.`}
          </button>
        </div>
      )}
      {msg && <p style={{ margin: '0 0 11px', fontSize: 11.5, color: '#9fe6b3', lineHeight: 1.5 }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 132 : 150}px, 1fr))`, gap: 10 }}>
        {visibles.map((u) => {
          const on = value === u.key;
          // La créa réelle prime sur l'aperçu fabriqué · elle porte le vrai
          // travail de la marque, pas une démonstration.
          const creaReelle = apercus[u.key];
          const apercu = creaReelle ?? fabrique?.previews[u.key];
          return (
            <button
              key={u.key} type="button" disabled={disabled} onClick={() => onChange(u.key)}
              title={UNIVERSE_HINT[u.key] ?? ''}
              style={{
                padding: 0, textAlign: 'left', borderRadius: 13, overflow: 'hidden', cursor: disabled ? 'default' : 'pointer',
                border: `1.5px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                background: on ? 'var(--accent-soft)' : 'var(--paper)',
                opacity: disabled ? 0.55 : 1,
              }}
            >
              <div style={{ position: 'relative', height: hauteur, background: UNIVERSE_SWATCH[u.key] ?? 'var(--grad-accent)' }}>
                {apercu && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={apercu} alt="" loading="lazy" decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
                {on && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6, width: 19, height: 19, borderRadius: '50%',
                    background: '#18cc8c', color: '#04140d', fontSize: 11, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>✓</span>
                )}
                {apercu && (
                  <span style={{
                    position: 'absolute', bottom: 5, left: 6, padding: '2px 7px', borderRadius: 999,
                    background: 'rgba(8,5,10,.66)', color: '#e8e6ee', fontSize: 9.5, fontWeight: 700,
                    backdropFilter: 'blur(3px)',
                  }}>{creaReelle ? 'ta créa' : 'aperçu'}</span>
                )}
              </div>
              <div style={{ padding: '8px 10px 10px' }}>
                <div style={{ fontSize: 12.5, fontWeight: on ? 800 : 700, color: on ? 'var(--ink)' : 'var(--ink-2)' }}>{u.label}</div>
                {!compact && UNIVERSE_HINT[u.key] && (
                  <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>{UNIVERSE_HINT[u.key]}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
