'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  completudeFicheJarvis, encartKpiJarvis, AUTOMATISATIONS_JARVIS, AUTOMATISATION_A_VENIR,
  CIBLE_TACTILE_MIN, type FicheMarqueLue, type SourceDepenseJarvis,
} from '@tiktrends/core';
import { Icon } from '../../../components/Icon';
import { BarreValeur } from '../../../components/BarreValeur';

/**
 * UX V5 · le panneau d'accueil de Jarvis, FIDÈLE à la maquette, HONNÊTE sur les
 * données.
 *
 * La maquette pose sous le composeur quatre zones · des prompts en cartes, trois
 * lignes d'automatisation, un bloc « Chiffres clés », une carte de complétude de
 * la fiche. On reprend la PRÉSENTATION, jamais les chiffres fictifs :
 *
 *  · les amorces sont les VRAIES suggestions du fil (elles lancent la vraie
 *    conversation) ;
 *  · les trois automatisations sont rendues DÉSACTIVÉES · le service d'actions
 *    programmées n'existe pas encore (décision Kevin · aucun faux succès) ;
 *  · « Chiffres clés » est en ÉTAT VIDE honnête · nous n'agrégeons pas la
 *    dépense pub · un lien vers les connexions, jamais un chiffre inventé ;
 *  · la carte de complétude affiche le VRAI pourcentage (`completudeFicheJarvis`,
 *    12 items réels) et renvoie chaque manque vers l'endroit qui le remplit.
 *
 * Tout ce qui, dans la maquette, repose sur un service absent (conversations
 * multiples, liste Projets, planificateur) est hors de ce panneau · on ne le
 * simule pas.
 */

const titreZone: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' };
const carte: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
  borderRadius: 16, border: '1px solid var(--line)', background: 'var(--surface)',
  boxShadow: 'var(--sh-card)',
};
const pastille: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
  border: '1px solid var(--line-2)', background: 'var(--accent-soft)', color: 'var(--accent-strong)',
};

export function JarvisAccueilV5({ fiche, brandId, kpiSource, amorces, onAmorce, enCours }: {
  /** `null` quand la fiche n'a pas pu être lue · la carte de complétude est alors absente (pas de 0 % inventé). */
  fiche: FicheMarqueLue | null;
  brandId: string;
  kpiSource: SourceDepenseJarvis | null;
  amorces: string[];
  onAmorce: (q: string) => void;
  enCours: boolean;
}) {
  const completude = fiche ? completudeFicheJarvis(fiche, brandId) : null;
  const kpi = encartKpiJarvis(kpiSource);

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '28px auto 0', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* ── 1 · Amorces · les VRAIES suggestions, en cartes · lancent le fil. */}
      {amorces.length > 0 && (
        <section data-zone="amorces" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={titreZone}>Pour démarrer</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {amorces.map((q) => (
              <button
                key={q} type="button" onClick={() => onAmorce(q)} disabled={enCours}
                style={{
                  ...carte, alignItems: 'flex-start', padding: '16px', minHeight: CIBLE_TACTILE_MIN, textAlign: 'left',
                  cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1,
                }}
              >
                <span style={pastille}><Icon name="spark" size={16} /></span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>{q}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 2 · Automatisations · présentées, mais DÉSACTIVÉES (service absent). */}
      <section data-zone="automatisations" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={titreZone}>Automatisations</h3>
        {/* Un SEUL cadre, lignes séparées par un filet · comme la maquette. Les
            lignes sont fidèles (pastille douce, titre net) · l'honnêteté tient au
            bouton DÉSACTIVÉ et à la note sous le cadre, pas à un grisage global. */}
        <div style={{ ...carte, flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
          {AUTOMATISATIONS_JARVIS.map((a, i) => (
            <div
              key={a.cle}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              }}
            >
              <span style={pastille}><Icon name={a.icone} size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{a.titre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{a.sous}</div>
              </div>
              <button
                type="button" disabled aria-disabled="true"
                title={AUTOMATISATION_A_VENIR}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 34, padding: '0 16px', flexShrink: 0,
                  borderRadius: 'var(--r-md)', border: '1px solid var(--line-2)', background: 'transparent',
                  color: 'var(--muted)', fontSize: 12.5, fontWeight: 700, cursor: 'not-allowed',
                }}
              >
                {a.action}
              </button>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="info" size={13} /></span>
          {AUTOMATISATION_A_VENIR}
        </p>
      </section>

      {/* ── 3 · Chiffres clés · état VIDE honnête (dépense non agrégée). */}
      <section data-zone="kpi" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={titreZone}>{kpi.titre}</h3>
        {kpi.etat === 'vide' ? (
          <div style={{ ...carte, alignItems: 'flex-start', flexDirection: 'column', gap: 10, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...pastille, background: 'var(--hover)', color: 'var(--muted)' }}><Icon name="chart" size={16} /></span>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{kpi.raison}</p>
            </div>
            <Link
              href={kpi.lien}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: CIBLE_TACTILE_MIN,
                padding: '0 16px', borderRadius: 999, textDecoration: 'none',
                border: '1px solid var(--accent-strong)', color: 'var(--accent-strong)',
                fontSize: 12.5, fontWeight: 700,
              }}
            >
              <Icon name="plug" size={14} /> {kpi.lienLibelle}
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>{kpi.plateforme} · {kpi.periode}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {kpi.kpis.map((k) => (
                <div key={k.cle} style={{ ...carte, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k.libelle}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{k.valeur}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 4 · Complétude de la fiche · le VRAI pourcentage, manques cliquables. */}
      {completude && (
      <section data-zone="completude" style={{ ...carte, flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={pastille}><Icon name="tag" size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              Fiche marque <span data-completude-score style={{ color: 'var(--accent-strong)' }}>{completude.score} %</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Jarvis répond mieux avec une fiche complète · {completude.faits} éléments sur {completude.total}.</div>
          </div>
          <Link
            href={completude.ficheHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN,
              padding: '0 14px', flexShrink: 0, borderRadius: 999, textDecoration: 'none',
              border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700,
            }}
          >
            Compléter <Icon name="trend" size={13} />
          </Link>
        </div>
        <BarreValeur part={completude.score / 100} hauteur={8} />
        {completude.manques.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {completude.manques.map((m) => (
              <Link
                key={m.cle} href={m.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 32,
                  padding: '0 11px', borderRadius: 999, textDecoration: 'none',
                  border: '1px dashed var(--line-2)', color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 600,
                }}
              >
                <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="plus" size={12} /></span>
                {m.libelle}
              </Link>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
