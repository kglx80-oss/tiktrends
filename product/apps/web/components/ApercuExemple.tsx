'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { partDeMax } from '@tiktrends/core';
import { BarreValeur } from './BarreValeur';

export interface ExempleRow {
  platform: string;
  title: string;
  fingerprint: string;
  spend: number;
  impressions: number;
  ctr: number;
  roas: number;
  grade: string;
  bucket: string;
}

const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, ' ');
const gcol: Record<string, string> = { A: '#18cc8c', B: '#7aa2ff', C: '#f5a623', D: '#ff4d6d' };

/**
 * L'aperçu des créas · un EXEMPLE, replié par défaut.
 *
 * Ces cartes viennent d'un jeu de démonstration du pipeline (normalisation →
 * dédup → agrégation → Radar), pas de la donnée de la marque. On le dit AVANT
 * d'ouvrir (le libellé du repli) ET dans le contenu · et on ne laisse pas
 * croire que brancher un compte rendrait CES cartes réelles · le code lit un
 * échantillon fixe, brancher un compte ne le remplace pas ici. La vraie mesure
 * vit dans Adsmap et Analytics, pas dans cet exemple.
 */
export function ApercuExemple({ rows }: { rows: ExempleRow[] }) {
  const [ouvert, setOuvert] = useState(false);
  const panneauId = useId();
  const maxDepense = Math.max(0, ...rows.map((r) => r.spend));

  return (
    <section aria-label="Explorer un exemple" style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-controls={ouvert ? panneauId : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '10px 4px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Explorer un exemple</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '2px 9px' }}>Données de démonstration</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{ouvert ? 'Replier' : 'Déplier ›'}</span>
      </button>

      <div id={panneauId} hidden={!ouvert}>
        <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 640 }}>
          Un jeu de <b style={{ color: 'var(--ink-2)' }}>démonstration</b> du pipeline (normalisation → dédup créas → agrégation → Radar), pas ta donnée.
          Ta mesure réelle vit dans <b style={{ color: 'var(--ink-2)' }}>Adsmap</b> (tes tests) et <b style={{ color: 'var(--ink-2)' }}>Analytics</b> (KPI agrégés).
        </p>
        {/* Une porte HONNÊTE · brancher un compte se fait à /connections (foyer
            unique). On ne dit pas que ça transforme CET exemple · ces cartes
            restent une démonstration. */}
        <Link href="/connections" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, marginBottom: 16, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>
          Brancher un compte publicitaire <span aria-hidden>›</span>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--muted)' }}>· pour suivre tes vraies campagnes</span>
        </Link>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
          {rows.map((r) => (
            <div key={r.platform + r.fingerprint} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 16, boxShadow: 'var(--sh-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{r.platform}</span>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: gcol[r.grade], color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{r.grade}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, margin: '8px 0 10px', color: 'var(--ink)' }}>{r.title}</div>
              <Row k="Dépense" v={eur(r.spend)} />
              <div style={{ margin: '2px 0 8px' }}>
                <BarreValeur part={partDeMax(r.spend, maxDepense)} couleur={gcol[r.grade] ?? 'var(--grad-accent)'} hauteur={5} />
              </div>
              <Row k="Impressions" v={r.impressions.toLocaleString('fr-FR')} />
              <Row k="CTR" v={(r.ctr * 100).toFixed(2) + '%'} />
              <Row k="ROAS" v={r.roas.toFixed(2) + '×'} />
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{r.bucket}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: 'var(--ink-2)' }}>
      <span>{k}</span><b style={{ fontFamily: 'var(--font-mono)' }}>{v}</b>
    </div>
  );
}
