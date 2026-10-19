'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  CATEGORIES_JARVIS, amorcesCategorie, encartKpiJarvis, AUTOMATISATIONS_JARVIS, AUTOMATISATION_A_VENIR,
  CIBLE_TACTILE_MIN, VALEUR_ABSENTE, type CategorieJarvis, type SourceDepenseJarvis,
} from '@tiktrends/core';
import { Icon } from '../../../components/Icon';

/**
 * UX V5 · le panneau d'accueil de Jarvis (sous le composeur), FIDÈLE à la
 * maquette, HONNÊTE sur les données.
 *
 *  · pastilles de catégories · changent réellement les trois cartes de prompts
 *    (règle `amorcesCategorie`, noyau) · cliquer une carte lance la VRAIE
 *    conversation avec son prompt ;
 *  · automatisations · trois lignes rendues mais DÉSACTIVÉES · aucun
 *    planificateur, aucun connecteur Slack n'existe (décision Kevin · pas de
 *    faux succès) ;
 *  · « Chiffres clés » · la présentation des 4 cartes, de la légende et de la
 *    plateforme, mais en ÉTAT VIDE honnête · aucun connecteur publicitaire
 *    n'agrège la dépense · AUCUN nombre fabriqué, AUCUNE courbe inventée.
 *
 * La carte de complétude de la fiche vit désormais dans la COLONNE (maquette),
 * pas ici.
 */

const titreZone: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' };
const carte: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
  borderRadius: 'var(--r-card)', border: '1px solid var(--line)', background: 'var(--surface)', boxShadow: 'var(--sh-card)',
};
const pastille: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
  border: '1px solid var(--line-2)', background: 'var(--accent-soft)', color: 'var(--accent-strong)',
};

export function JarvisAccueilV5({ measuredAds, categorie, onCategorie, onAmorce, kpiSource, enCours }: {
  measuredAds: number;
  categorie: CategorieJarvis;
  onCategorie: (c: CategorieJarvis) => void;
  onAmorce: (prompt: string) => void;
  kpiSource: SourceDepenseJarvis | null;
  enCours: boolean;
}) {
  const amorces = amorcesCategorie(categorie, { measuredAds });
  const metaCat = CATEGORIES_JARVIS.find((c) => c.cle === categorie)!;
  const kpi = encartKpiJarvis(kpiSource);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24, marginTop: 22 }}>
      {/* ── Pastilles de catégories · filtrent les VRAIES amorces. */}
      <div data-zone="categories" role="tablist" aria-label="Catégories de prompts" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CATEGORIES_JARVIS.map((c) => {
          const actif = c.cle === categorie;
          return (
            <button
              key={c.cle} type="button" role="tab" aria-selected={actif}
              onClick={() => onCategorie(c.cle)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 15px',
                borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: `1px solid ${actif ? 'var(--ink)' : 'var(--line-2)'}`,
                background: actif ? 'var(--ink)' : 'var(--surface)',
                color: actif ? 'var(--paper)' : 'var(--ink-2)',
              }}
            >
              <Icon name={c.icone} size={15} /> {c.libelle}
            </button>
          );
        })}
      </div>

      {/* ── « Prompts <Catégorie> » · trois VRAIES amorces, lancent le fil. */}
      <section data-zone="prompts" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={titreZone}>Prompts {metaCat.libelle}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {amorces.map((a) => (
            <button
              key={a.titre} type="button" onClick={() => onAmorce(a.prompt)} disabled={enCours}
              style={{
                ...carte, alignItems: 'flex-start', flexDirection: 'column', gap: 8, padding: 16,
                minHeight: 92, textAlign: 'left', cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1,
              }}
            >
              <span style={pastille}><Icon name={metaCat.icone} size={16} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{a.titre}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{a.sous}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Automatisations · trois lignes, DÉSACTIVÉES (service absent, Slack non branché). */}
      <section data-zone="automatisations" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {AUTOMATISATIONS_JARVIS.map((a) => (
          <div key={a.cle} style={{ ...carte, padding: '14px 16px' }}>
            <span style={a.cle === 'rapport' ? { ...pastille, background: 'var(--hover)', color: 'var(--muted)' } : pastille}>
              <Icon name={a.icone} size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{a.titre}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{a.sous}</div>
            </div>
            <button
              type="button" disabled aria-disabled="true" title={AUTOMATISATION_A_VENIR}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 36, padding: '0 16px', flexShrink: 0, borderRadius: 999,
                border: '1px solid var(--line-2)', background: 'transparent',
                color: 'var(--muted)', fontSize: 12.5, fontWeight: 700, cursor: 'not-allowed',
              }}
            >
              {a.action}
            </button>
          </div>
        ))}
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="info" size={13} /></span>
          {AUTOMATISATION_A_VENIR}
        </p>
      </section>

      {/* ── Chiffres clés · présentation des 4 cartes + légende, état VIDE honnête. */}
      {kpi.etat === 'vide' && (
        <section data-zone="kpi" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={titreZone}>{kpi.titre}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--accent-strong)' }} /> Période</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--line-strong)' }} /> Période précédente</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="target" size={13} /></span>
            {kpi.plateforme} · {kpi.periode}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {kpi.cartes.map((k) => (
              <div key={k.cle} style={{ ...carte, flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{k.libelle}</div>
                {/* Valeur VIDE · un trait, jamais un nombre fabriqué. */}
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--line-strong)' }} aria-label="valeur non disponible">{VALEUR_ABSENTE}</div>
                {/* Un gabarit de courbe neutre (pas de données) · aucune tendance inventée. */}
                <div aria-hidden style={{ width: '100%', height: 30, borderRadius: 6, background: 'repeating-linear-gradient(90deg, var(--hover), var(--hover) 6px, transparent 6px, transparent 12px)' }} />
              </div>
            ))}
          </div>
          <div style={{ ...carte, alignItems: 'flex-start', flexDirection: 'column', gap: 10, padding: '14px 16px', boxShadow: 'none', background: 'var(--hover)' }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{kpi.raison}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.5 }}>
              <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}><Icon name="info" size={13} /></span>
              {kpi.mention}
            </p>
            <Link
              href={kpi.lien}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: CIBLE_TACTILE_MIN,
                padding: '0 16px', borderRadius: 999, textDecoration: 'none',
                border: '1px solid var(--accent-strong)', color: 'var(--accent-strong)', fontSize: 12.5, fontWeight: 700,
              }}
            >
              <Icon name="plug" size={14} /> {kpi.lienLibelle}
            </Link>
          </div>
        </section>
      )}

      {/* Si (et seulement si) une vraie source agrégée est un jour lue · les KPI
          réels s'affichent, l'état vide disparaît. Aucun chiffre n'est fabriqué
          ici · tout vient de `kpiSource`. */}
      {kpi.etat === 'source' && (
        <section data-zone="kpi" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={titreZone}>{kpi.titre}</h3>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{kpi.plateforme} · {kpi.periode}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {kpi.kpis.map((k) => (
              <div key={k.cle} style={{ ...carte, flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '14px 16px' }}>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{k.libelle}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{k.valeur}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
