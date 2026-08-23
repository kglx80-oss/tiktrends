'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Starter { label: string; desc: string; href: string }
interface Category { key: string; label: string; icon: string; starters: Starter[] }

export interface AssistantHomeProps {
  firstName: string;
  credits: number;
  brandName: string | null;
  brandId: string | null;
}

function buildCategories(brandId: string | null): Category[] {
  const brand = (tab: string) => (brandId ? `/brands/${brandId}?tab=${tab}` : '/brands');
  return [
    { key: 'diag', label: 'Diagnostics', icon: '🩺', starters: [
      { label: 'Repérer les problèmes', desc: "Ce qui plombe la performance en ce moment", href: '/radar' },
      { label: 'Signaux de fatigue', desc: 'Quelles créas montrent des signes de fatigue', href: '/radar' },
      { label: 'Kill / scale / hold', desc: 'Quelles créas couper, scaler ou garder', href: '/radar' },
    ] },
    { key: 'patterns', label: 'Patterns', icon: '📊', starters: [
      { label: 'Ce qui marche', desc: 'Les KPI agrégés et les tendances', href: '/analytics' },
      { label: 'Angles gagnants', desc: 'Le tagging par axe créatif', href: '/tags' },
    ] },
    { key: 'audience', label: 'Audience', icon: '👥', starters: [
      { label: 'Personas & scénarios', desc: "À qui s'adressent tes créas", href: brand('audience') },
      { label: 'Compléter le profil', desc: 'Enrichir la marque (IA depuis le site)', href: brand('overview') },
    ] },
    { key: 'competitors', label: 'Concurrents', icon: '🔭', starters: [
      { label: 'Analyser un concurrent', desc: 'Hooks, angles, USP à partir de ses créas', href: brand('competitors') },
      { label: 'Suivre une marque', desc: 'Ajouter des concurrents à surveiller', href: brand('competitors') },
    ] },
    { key: 'creative', label: 'Créatif', icon: '🎬', starters: [
      { label: 'Générer des hooks', desc: 'Des accroches prêtes à tourner', href: '/studio' },
      { label: 'Écrire un script', desc: 'Un script vidéo seconde par seconde', href: '/studio' },
    ] },
    { key: 'inspo', label: 'Inspiration', icon: '💡', starters: [
      { label: 'Tendances du marché', desc: 'Les créas fraîches qui percent', href: '/inspo' },
      { label: 'Créas gagnantes', desc: 'Explorer les bibliothèques pub', href: '/inspo' },
    ] },
  ];
}

const ROUTINES: Array<{ icon: string; title: string; desc: string; hrefFor: (b: string | null) => string }> = [
  { icon: '📈', title: 'Analyse hebdo de performance', desc: 'Passe en revue les KPI de la semaine et les actions clés.', hrefFor: () => '/analytics' },
  { icon: '🔭', title: 'Veille concurrents', desc: 'Suis les mouvements, messages et offres des concurrents.', hrefFor: (b) => (b ? `/brands/${b}?tab=competitors` : '/brands') },
  { icon: '✨', title: 'Inspirations du marché', desc: 'Trouve des tendances et idées créatives fraîches.', hrefFor: () => '/inspo' },
];

export function AssistantHome({ firstName, credits, brandName, brandId }: AssistantHomeProps) {
  const cats = buildCategories(brandId);
  const [active, setActive] = useState(cats[0]!.key);
  const current = cats.find((c) => c.key === active) ?? cats[0]!;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Salutation + statut */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>Bonjour {firstName} 👋</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>
            {brandName ? <>Marque active : <b>{brandName}</b>. Par où on commence&nbsp;?</> : <>Sélectionne une marque et lance-toi.</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--accent-strong)', fontWeight: 800 }}>◈</span> {credits.toLocaleString('fr-FR')} crédits
          </span>
          <Link href="/studio" style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>Ouvrir le Studio IA</Link>
        </div>
      </div>

      {/* Routines */}
      <h2 style={sectionH}>Tes routines</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 26 }}>
        {ROUTINES.map((r) => (
          <Link key={r.title} href={r.hrefFor(brandId)} style={{ display: 'block', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{r.icon}</span>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{r.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.desc}</p>
            <span style={{ display: 'inline-block', marginTop: 12, fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)' }}>Lancer ›</span>
          </Link>
        ))}
      </div>

      {/* Explorateur */}
      <h2 style={sectionH}>Explore ce que TikTrends peut faire</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {cats.map((c) => {
          const on = c.key === active;
          return (
            <button key={c.key} type="button" onClick={() => setActive(c.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${on ? 'transparent' : 'var(--line)'}`, background: on ? 'var(--grad-accent)' : 'var(--surface)',
              color: on ? '#0d070c' : 'var(--ink-2)', fontWeight: on ? 800 : 600, fontSize: 13,
            }}><span>{c.icon}</span>{c.label}</button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {current.starters.map((st) => (
          <Link key={st.label} href={st.href} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '13px 16px', textDecoration: 'none' }}>
            <span style={{ color: 'var(--accent-strong)', fontSize: 15 }}>✦</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{st.label}</span>
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}> — {st.desc}</span>
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 16 }}>↗</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const sectionH = { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' } as const;
