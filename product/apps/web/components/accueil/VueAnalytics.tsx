/**
 * La vue Analytics de l'Accueil · lot 19A.
 *
 * C'est le corps INCHANGÉ de l'ancienne page `/analytics` · mêmes requêtes
 * (marque active, synchro Méta, générations, assets scopés marque-ou-commun),
 * mêmes calculs (`buildAnalysis`, `analysisTotals`, buckets, diversité), mêmes
 * composants (`MetaKeyMetrics`, `CreativeIntel`, `SectionAttribution`). Il a
 * seulement quitté la page pour être monté par l'Accueil
 * (`/dashboard?vue=analytics`) · `/analytics` redirige désormais ici
 * (`redirectionAnalytics`, noyau). Aucune copie · une seule source de calcul.
 *
 * Le cadre (`<main>`, `cadrePage`) appartient à la page qui monte la vue.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { MetaAdsInsights } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { effectiveAccess } from '../../lib/access';
import { FEATURES, canAccess, denyReason } from '../../lib/rbac';
import { getActiveBrand } from '../../lib/brands';
import { buildAnalysis, analysisTotals, BUCKETS, bucketDef } from '../../lib/analysis';
import { CIBLE_TACTILE_MIN, etatConnecteur, encartMetaAnalytics, phrasesApercuAnalytics, refusVueAnalytics, type PhaseConnecteur } from '@tiktrends/core';
import { PageInfo } from '../PageInfo';
import { MetaKeyMetrics } from '../../app/(app)/analytics/MetaKeyMetrics';
import { BrandTile } from '../BrandIcons';
import { CreativeIntel, type CreativeStats } from '../../app/(app)/analytics/CreativeIntel';
import { SectionAttribution } from '../../app/(app)/jarvis/sections/SectionAttribution';
// Le titre d'écran suit le jeton partagé (lot 19 · réconciliation des titres).
import { cadreSignal, h1, surface } from '../ui';
import { Icon } from '../Icon';

const TPL_LABEL: Record<string, string> = { problem_solution: 'Problème/solution', before_after: 'Avant/après', testimonial: 'Témoignage', benefits: 'Bénéfices', ugc: 'UGC', stat: 'Stat', offer: 'Offre' };

const eur = (n: number) => '€' + Math.round(n).toLocaleString('fr-FR');
const pct = (n: number) => (n * 100).toFixed(2).replace('.', ',') + ' %';
const num = (n: number) => n.toLocaleString('fr-FR');

/** La feature Analytics de la matrice existante (`lib/rbac` · rôle d'espace, offre, matrice d'équipe). */
const ANALYTICS = FEATURES.find((f) => f.key === 'analytics')!;

export async function VueAnalytics({ vues }: { vues?: ReactNode } = {}) {
  const s = await getSession();
  if (!s) redirect('/login');

  // Message 55 · le droit DÉJÀ défini est appliqué au serveur, AVANT toute
  // lecture · ni marque active, ni KPI Meta, ni générations, ni assets, ni
  // bilan. Masquer l'onglet ne protégeait rien · un rôle dont la matrice ferme
  // Analytics lisait les KPI de l'espace par l'URL.
  const acces = effectiveAccess(s);
  if (!canAccess(acces, ANALYTICS)) {
    return (
      <div data-vue="analytics-refusee">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={h1}>Analytics</h1>
          {vues}
        </div>
        <div role="status" style={{ ...surface, background: 'var(--surface)', padding: 28, marginTop: 20, textAlign: 'center' }}>
          <div aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={30} /></div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.55, maxWidth: 460, margin: '10px auto 0' }}>{refusVueAnalytics(denyReason(acces, ANALYTICS))}</p>
        </div>
      </div>
    );
  }

  // Données Meta réelles (si la marque active a connecté + synchronisé).
  let metaInsights: MetaAdsInsights | null = null;
  let syncedAt: string | null = null;
  // La phase RÉELLE du connecteur · la même règle que l'écran Connexions
  // (`etatConnecteur`) · l'encart n'invite plus à connecter un compte connecté.
  let phaseMeta: PhaseConnecteur = 'a_brancher';
  const brand = await getActiveBrand(s.workspaceId);
  if (db && brand) {
    // La date de synchro MÉTA · pas la valeur partagée qu'une synchro Shopify
    // écrasait, faisant passer des KPI Meta anciens pour « à l'instant » (N09).
    const [b] = await db.select({ ads: schema.brands.adsInsights, syncedAt: schema.brands.metaSyncedAt, token: schema.brands.metaToken, compte: schema.brands.metaAdAccountId, comptes: schema.brands.metaAdAccounts }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    if (b?.ads && (b.ads as MetaAdsInsights).window) metaInsights = b.ads as MetaAdsInsights;
    syncedAt = b?.syncedAt ? b.syncedAt.toISOString() : null;
    const nbComptes = Array.isArray(b?.comptes) ? (b!.comptes as unknown[]).length : 0;
    phaseMeta = etatConnecteur({ connecte: !!b?.token, compteRequisManquant: !!b?.token && nbComptes > 1 && !b?.compte, donnees: !!metaInsights });
  }

  // Intelligence créative maison : diversité + top tags, à partir de NOS générations et assets.
  let creative: CreativeStats | null = null;
  if (db && brand) {
    const gens = await db.select({ input: schema.generations.input })
      .from(schema.generations)
      .where(and(eq(schema.generations.brandId, brand.id), inArray(schema.generations.kind, ['ad', 'image'])))
      .orderBy(desc(schema.generations.createdAt)).limit(200);
    const tplCount = new Map<string, number>();
    const headlines = new Set<string>();
    for (const g of gens) {
      const rec = (g.input ?? {}) as { template?: string; headline?: string };
      if (rec.template) tplCount.set(rec.template, (tplCount.get(rec.template) ?? 0) + 1);
      if (rec.headline) headlines.add(rec.headline.toLowerCase().trim());
    }
    const total = gens.length;
    const distinctTpl = tplCount.size;
    const templates = [...tplCount.entries()].map(([k, n]) => ({ key: k, label: TPL_LABEL[k] ?? k, n })).sort((a, b) => b.n - a.n);
    // Diversité : moitié = variété de gabarits (sur 7), moitié = unicité des accroches.
    const tplScore = Math.min(1, distinctTpl / 7);
    const headScore = total ? Math.min(1, headlines.size / total) : 0;
    const score = Math.round((tplScore * 0.5 + headScore * 0.5) * 100);

    // Scopé à la marque active OU aux assets communs de l'espace · même règle
    // que `listAssets`. Sans le filtre marque, le nuage de tags agrégeait les
    // assets brand-spécifiques de toutes les marques, à côté de générations
    // pourtant brand-scopées (bug de scope, cf. #514).
    const assetRows = await db.select({ tags: schema.assets.tags }).from(schema.assets)
      .where(and(eq(schema.assets.workspaceId, s.workspaceId), or(eq(schema.assets.brandId, brand.id), isNull(schema.assets.brandId))))
      .limit(400);
    const tagCount = new Map<string, number>();
    for (const a of assetRows) for (const t of (a.tags ?? [])) { const k = t.trim().toLowerCase(); if (k) tagCount.set(k, (tagCount.get(k) ?? 0) + 1); }
    const tags = [...tagCount.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 14);

    if (total > 0 || tags.length > 0) creative = { score, total, templates, tags };
  }

  const rows = buildAnalysis();
  const t = analysisTotals(rows);
  const topRoas = [...rows].filter((r) => r.eligible).sort((a, b) => b.convEff - a.convEff).slice(0, 6);
  const byPlatform = (['tiktok', 'meta'] as const).map((p) => {
    const rs = rows.filter((r) => r.platform === p);
    return { p, spend: rs.reduce((x, r) => x + r.spend, 0), count: rs.length };
  });
  const maxBucket = Math.max(1, ...BUCKETS.map((b) => rows.filter((r) => r.bucket === b.key).length));

  const kpis: Array<[string, string, string]> = [
    ['Dépense', eur(t.spend), 'total sur la période'],
    ['Impressions', num(t.impressions), `${t.count} créas`],
    ['CTR moyen', pct(t.avgCtr), 'pondéré par impressions'],
    ['ROAS moyen', t.avgRoas.toFixed(2) + '×', `${t.eligible} créas éligibles`],
  ];

  const encart = encartMetaAnalytics(phaseMeta);
  const phrases = phrasesApercuAnalytics(phaseMeta);

  return (
    <div data-vue="analytics">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Analytics</h1>
        <span style={{ fontSize: 12, color: metaInsights ? '#7ee8bf' : 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{metaInsights ? 'Meta Ads · live' : 'aperçu démo'}</span>
        {/* Le sélecteur de vue (lot 19A) · même place que sur l'Accueil, dans la rangée du titre. */}
        {vues}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Vue agrégée de tes créas : dépense, portée, efficacité, et répartition Radar. {phrases.intro}
      </p>

      <PageInfo title="lire tes KPI">
        Cette page agrège tes créas : <b>dépense</b> et <b>impressions</b> totales, <b>CTR</b> pondéré par le volume,
        et <b>ROAS moyen</b> des créas éligibles. La <b>répartition Radar</b> montre combien de créas sont à scaler
        ou à couper, et le tableau liste tes <b>meilleures créas par ROAS</b> avec leur recommandation.
      </PageInfo>

      {/* ===== Données Meta réelles (Key Metrics façon Atria) ===== */}
      {metaInsights ? (
        <MetaKeyMetrics insights={metaInsights} syncedAt={syncedAt} />
      ) : encart && (
        <div style={{ ...cadreSignal('var(--accent-strong)'), background: 'linear-gradient(180deg, rgba(254,44,85,.07), var(--surface))', padding: '18px 20px', marginBottom: 26, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <BrandTile name="Meta Ads" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{encart.titre}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{encart.texte}</div>
          </div>
          <Link href="/connections" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>{encart.cta.libelle}</Link>
        </div>
      )}

      {/* Intelligence créative maison (diversité + top tags) */}
      {creative && <CreativeIntel stats={creative} />}

      {/* Aperçu de démonstration : masqué dès que de vraies données Meta sont connectées. */}
      {!metaInsights && (<>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Aperçu créas</h2>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: '#f5b043', background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.3)', borderRadius: 999, padding: '2px 8px' }}>DÉMO</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {phrases.noteDemo}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 26 }}>
        {kpis.map(([label, value, sub]) => (
          <div key={label} style={card}>
            <div style={cardLabel}>{label}</div>
            <div style={{ fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
        {/* Répartition Radar */}
        <section style={card}>
          <h2 style={h2}>Répartition Radar</h2>
          <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
            {BUCKETS.map((b) => {
              const n = rows.filter((r) => r.bucket === b.key).length;
              return (
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 108 }}>{b.label}</span>
                  <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${(n / maxBucket) * 100}%`, height: '100%', background: b.color, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', width: 24, textAlign: 'right' }}>{n}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Par plateforme */}
        <section style={card}>
          <h2 style={h2}>Dépense par plateforme</h2>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {byPlatform.map(({ p, spend, count }) => (
              <div key={p}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600, textTransform: 'capitalize' }}>{p}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{eur(spend)} · {count} créas</span>
                </div>
                <div style={{ height: 10, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${t.spend ? (spend / t.spend) * 100 : 0}%`, height: '100%', background: 'var(--grad-accent)', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top ROAS */}
      <h2 style={{ ...h2, fontSize: 19, marginTop: 28, marginBottom: 12 }}>Top créas par ROAS</h2>
      <div style={{ ...surface, overflowX: 'auto' }}>
        <div style={{ ...trow, background: 'var(--surface)', color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
          <span>Créa</span><span>Plateforme</span><span style={{ textAlign: 'right' }}>Dépense</span><span style={{ textAlign: 'right' }}>CTR</span><span style={{ textAlign: 'right' }}>ROAS</span><span style={{ textAlign: 'center' }}>Reco</span>
        </div>
        {topRoas.map((r) => {
          const b = bucketDef(r.bucket);
          return (
            <div key={r.platform + r.fingerprint} style={{ ...trow, borderTop: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
              <span style={{ color: 'var(--ink-2)', fontSize: 13, textTransform: 'capitalize' }}>{r.platform}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink-2)', fontSize: 13 }}>{eur(r.spend)}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink-2)', fontSize: 13 }}>{pct(r.ctr)}</span>
              <span style={{ textAlign: 'right', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>{r.convEff.toFixed(2)}×</span>
              <span style={{ textAlign: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: '#fff', background: b.color }}>{b.action}</span></span>
            </div>
          );
        })}
      </div>
      </>)}

      {/* Le bilan avancé de Jarvis · attribution et tendance, à leur destination.
          Self-porté (offre Plus, marque active) · rend null sinon, il ne s'impose
          jamais à un compte qui n'y avait pas droit. */}
      <SectionAttribution />
    </div>
  );
}

const h2 = { margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--ink)' } as const;
const card = { padding: '16px 18px', ...surface, background: 'var(--surface)' } as const;
const cardLabel = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 } as const;
// minWidth · en dessous, les six colonnes se tassent et débordent · le tableau
// défile alors à l'horizontale dans son cadre (overflowX) au lieu d'écraser.
const trow = { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', minWidth: 560, padding: '11px 16px', alignItems: 'center', gap: 8 } as const;
