import type { KpiAccueil, TuileAccueil } from '@tiktrends/core';
import { Icon } from '../Icon';
import { surface } from '../ui';

/**
 * UX V5 · les tuiles d'action (G18 à G22) · seulement celles que les droits
 * ouvrent (`tuilesAccueil`, noyau). « Nouveau projet » en primaire, porte le
 * marqueur historique `data-nouveau-projet-accueil` (même geste que la tête
 * d'avant). La fiche marque dit le VRAI manque.
 */
export function TuilesAccueil({ tuiles }: { tuiles: readonly TuileAccueil[] }) {
  if (tuiles.length === 0) return null;
  return (
    <nav aria-label="Actions rapides" data-accueil-tuiles style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12, marginBottom: 14 }}>
      {tuiles.map((t) => (
        <a key={t.cle} href={t.href} data-tuile={t.cle} {...(t.cle === 'nouveau' ? { 'data-nouveau-projet-accueil': '' } : {})}
          style={{
            ...surface, display: 'grid', alignContent: 'start', gap: 14, minHeight: 112, padding: 16, textDecoration: 'none', minWidth: 0,
            background: t.primaire ? 'var(--grad-accent)' : 'var(--surface)',
            ...(t.primaire ? { borderColor: 'transparent' } : {}),
          }}>
          {/* V5 · la pastille d'icône est un lavis d'accent (`--accent-soft`), pas un placeholder neutre (`--paper`) · la maquette tinte chaque chip, primaire comme secondaire. */}
          <span aria-hidden style={{
            width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-soft)', color: 'var(--accent-strong)',
          }}><Icon name={t.icone} size={17} /></span>
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <b style={{ fontSize: 15, fontWeight: 600, color: t.primaire ? 'var(--on-accent)' : 'var(--ink)' }}>{t.titre}</b>
            <span style={{ fontSize: 12.5, lineHeight: 1.4, color: t.primaire ? 'var(--on-accent)' : 'var(--muted)', overflowWrap: 'anywhere' }}>{t.sous}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}

/**
 * UX V5 · les KPI (G23) · seulement ceux dont la source a été lue
 * (`kpiAccueil`), chacun avec sa période ; la source est posée en attribut.
 * Aucune source ⇒ rien.
 */
export function KpiAccueilBande({ kpi }: { kpi: readonly KpiAccueil[] }) {
  if (kpi.length === 0) return null;
  return (
    <dl aria-label="Indicateurs" data-accueil-kpi style={{
      // Les filets entre cellules sont des ombres d'un pixel vers le haut et la
      // gauche, rognées au bord du cadre · une rangée incomplète (3 KPI sur
      // deux colonnes) ne laisse pas de case vide colorée.
      ...surface, overflow: 'hidden', margin: '0 0 26px', display: 'grid', background: 'var(--surface)',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))',
    }}>
      {kpi.map((k) => (
        <div key={k.cle} data-kpi={k.cle} data-source={k.source} style={{ boxShadow: '-1px -1px 0 0 var(--line)', padding: '14px 16px', display: 'grid', gap: 4, minWidth: 0 }}>
          <dt style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{k.libelle}</dt>
          <dd style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1.15 }}>{k.valeur}</dd>
          <dd style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{k.detail} · {k.periode}</dd>
        </div>
      ))}
    </dl>
  );
}
