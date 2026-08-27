import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { getActiveBrand } from '../../../lib/brands';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { buildAnalysis, buildLiveAnalysis, BUCKETS, bucketDef, type AnalysisRow } from '../../../lib/analysis';
import type { MetaAdsInsights } from '@tiktrends/integrations';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'radar')!;

const GRADE_COLOR: Record<string, string> = { A: '#18cc8c', B: '#7aa2ff', C: '#f5a623', D: '#ff4d6d' };
const eur = (n: number) => '€' + Math.round(n).toLocaleString('fr-FR');

function Grade({ label, g }: { label: string; g: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: GRADE_COLOR[g] || '#9a8a98' }}>{g}</div>
    </div>
  );
}

// Action du Studio selon le verdict : on transforme le diagnostic en geste concret.
const ACTION_CTA: Record<string, string> = {
  scaler: '✨ Décliner les gagnantes', pousser: '✨ Pousser au Studio', iterer: '✨ Itérer au Studio',
  rafraichir: '✨ Rafraîchir au Studio', couper: '✨ Remplacer au Studio',
};

function Row({ r }: { r: AnalysisRow }) {
  const b = bucketDef(r.bucket);
  const studioHref = `/studio/ads?inspo=${encodeURIComponent(r.title)}`;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {r.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumbUrl} alt="" loading="lazy" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
        )}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{r.title}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 7px' }}>{r.platform}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{eur(r.spend)} dépensé · {r.impressions.toLocaleString('fr-FR')} impr. · {r.daysActive} j</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Grade label="Hook" g={r.grades.hook} />
          <Grade label="Hold" g={r.grades.hold} />
          <Grade label="CTR" g={r.grades.ctr} />
          <Grade label="Conv" g={r.grades.conv} />
        </div>
        <div style={{ textAlign: 'center', minWidth: 64 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)' }}>Score</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{r.globalScore.toFixed(2)}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '6px 14px', borderRadius: 999, color: '#fff', background: b.color }}>{b.action}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-2)' }}>
        {r.diagnosis.map((d, i) => <span key={i} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 9px' }}>→ {d}</span>)}
        <a href={studioHref} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{ACTION_CTA[r.bucket] ?? '✨ Retravailler au Studio'} ›</a>
      </div>
    </div>
  );
}

export default async function RadarPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Radar</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 10 }}>{why === 'plan' ? 'Le Radar est inclus à partir du plan Core.' : 'Accès réservé.'}</p>
        </div>
      </main>
    );
  }

  // Données réelles si la marque active a synchronisé Meta Ads, sinon démonstration.
  let live: AnalysisRow[] = [];
  let syncedAt: Date | null = null;
  if (db) {
    const brand = await getActiveBrand(s.workspaceId);
    if (brand) {
      const [b] = await db.select({ ads: schema.brands.adsInsights, at: schema.brands.insightsSyncedAt })
        .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
      const ins = (b?.ads ?? null) as MetaAdsInsights | null;
      if (ins?.ads?.length) { live = buildLiveAnalysis(ins.ads); syncedAt = (b?.at as Date) ?? null; }
    }
  }
  const isLive = live.length > 0;
  const rows = isLive ? live : buildAnalysis();
  const byBucket = BUCKETS.map((b) => ({ b, items: rows.filter((r) => r.bucket === b.key) })).filter((g) => g.items.length > 0);

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Radar</h1>
        <span style={{ fontSize: 12, color: isLive ? '#7ee8bf' : 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {isLive ? `Meta Ads · live${syncedAt ? ' · maj ' + new Date(syncedAt).toLocaleDateString('fr-FR') : ''}` : 'scoring prescriptif · démo'}
        </span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20 }}>
        Chaque créa est notée <b>Hook / Hold / CTR / Conv</b> (A→D, en percentiles du compte) puis rangée en
        recommandation : <b>scaler, pousser, itérer, rafraîchir, couper</b>.{isLive
          ? <> Ces notes portent sur <b>tes vraies créas Meta Ads</b> des 30 derniers jours.</>
          : <> <a href="/connections" style={{ color: 'var(--accent-strong)', fontWeight: 700, textDecoration: 'none' }}>Branche un compte</a> pour des données live.</>}
      </p>

      {/* Bandeau démo · uniquement tant qu'aucune donnée réelle n'est synchronisée. */}
      {!isLive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid rgba(245,166,35,.3)', borderRadius: 14, background: 'rgba(245,166,35,.08)', padding: '12px 16px', margin: '0 0 20px' }}>
          <span style={{ fontSize: 18 }}>🧪</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Mode démonstration</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', marginLeft: 8 }}>Ces créas sont des exemples. Branche Meta Ads pour noter tes vraies créas.</span>
          </div>
          <a href="/connections" style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>Brancher un compte ›</a>
        </div>
      )}

      <PageInfo title="comment lire le Radar">
        Le Radar note chaque créa sur 4 axes : <b>Hook</b> (accroche 3 s), <b>Hold</b> (rétention),
        <b>CTR</b> (clics) et <b>Conv</b> (ROAS), en <b>A→D</b> comparés aux autres créas de ton compte.
        Le score global (pondéré 40&nbsp;% conv, 25&nbsp;% hook, 20&nbsp;% hold, 15&nbsp;% CTR) range la créa dans un
        bucket avec une action claire. Le <b>diagnostic</b> pointe la cause probable (hook lent, promesse non tenue,
        CTA tardif, offre/landing). Une créa a besoin d'assez de volume (dépense et impressions) pour être notée.
      </PageInfo>

      {/* Résumé buckets */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {BUCKETS.map((b) => {
          const n = rows.filter((r) => r.bucket === b.key).length;
          return (
            <div key={b.key} style={{ flex: '1 1 120px', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{b.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{n}</div>
            </div>
          );
        })}
      </div>

      {byBucket.map(({ b, items }) => (
        <section key={b.key} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: b.color }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{b.label}</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {b.action} ({items.length})</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((r) => <Row key={r.platform + r.fingerprint} r={r} />)}
          </div>
        </section>
      ))}
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1100, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
