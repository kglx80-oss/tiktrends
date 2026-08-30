import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../../../lib/auth';
import { roleAtLeast } from '../../../../../../lib/rbac';
import { analyzeCompetitorAction, getCompetitorReport, type CompetitorReport } from '../../../../../actions/competitor';
import { Msg } from '../../../../../../components/ui';

export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'creatives' | 'hooks' | 'adcopy' | 'headlines' | 'angles' | 'usps' | 'desires' | 'emotions' | 'themes' | 'personas';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Aperçu' }, { key: 'creatives', label: 'Créatives' }, { key: 'hooks', label: 'Hooks' },
  { key: 'adcopy', label: 'Ad copy' }, { key: 'headlines', label: 'Headlines' }, { key: 'angles', label: 'Angles' },
  { key: 'usps', label: 'USP' }, { key: 'desires', label: 'Désirs' }, { key: 'emotions', label: 'Émotions' },
  { key: 'themes', label: 'Thèmes' }, { key: 'personas', label: 'Personas' },
];
const ERR: Record<string, string> = {
  nolibrary: "La bibliothèque publicitaire n'est pas configurée sur le serveur.",
  fetch: 'Échec de la récupération des créas, réessaie.',
  noresult: "Aucune créa trouvée pour ce concurrent dans la bibliothèque.",
};

const addBtn = { padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' } as const;
const card = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: 16, marginBottom: 12 } as const;
const sectionH = { margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' } as const;

export default async function CompetitorPage({ params, searchParams }: {
  params: Promise<{ id: string; name: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; e?: string }>;
}) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { id, name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const { tab: tabRaw, e } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.key === tabRaw) ? tabRaw : 'overview') as Tab;

  if (!db) notFound();
  const [b] = await db.select({ id: schema.brands.id, name: schema.brands.name, competitors: schema.brands.competitors })
    .from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (!b) notFound();

  const report = await getCompetitorReport(id, name);
  const ins = report?.insights;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 980, margin: '0 auto' }}>
      <Link href={`/brands/${id}?tab=competitors`} style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ {b.name} · Concurrents</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '10px 0 4px', flexWrap: 'wrap' }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, background: '#1b1420', border: '1px solid var(--line-2)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{initials}</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{name}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {report ? <>Concurrent analysé · {report.aggregates.adCount} créas · maj {new Date(report.analyzedAt).toLocaleDateString('fr-FR')}</> : 'Concurrent non encore analysé'}
          </div>
        </div>
        <form action={analyzeCompetitorAction}>
          <input type="hidden" name="brandId" value={id} />
          <input type="hidden" name="name" value={name} />
          <button style={addBtn}>✦ {report ? 'Rafraîchir l’analyse' : 'Analyser ce concurrent'}</button>
        </form>
      </div>

      {e && ERR[e] && <div style={{ marginTop: 14 }}><Msg kind="err">{ERR[e]}</Msg></div>}
      {report?.note && <div style={{ marginTop: 14 }}><Msg kind="ok">{report.note}</Msg></div>}

      {!report ? (
        <div style={{ marginTop: 20, borderRadius: 16, textAlign: 'center' }}>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '0 0 6px' }}>Lance l'analyse pour récupérer les créas de <b>{name}</b> depuis la bibliothèque publicitaire et en extraire les patterns (hooks, angles, USP, désirs, émotions, thèmes).</p>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 16px' }}>L'analyse consomme des crédits ; le résultat est mis en cache (pas de recalcul à chaque visite).</p>
          <form action={analyzeCompetitorAction}>
            <input type="hidden" name="brandId" value={id} />
            <input type="hidden" name="name" value={name} />
            <button style={addBtn}>✦ Analyser ce concurrent</button>
          </form>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', margin: '18px 0 20px', flexWrap: 'wrap' }}>
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Link key={t.key} href={`/brands/${id}/competitors/${encodeURIComponent(name)}?tab=${t.key}`} style={{
                  padding: '9px 12px', fontSize: 13, fontWeight: active ? 800 : 600, textDecoration: 'none',
                  color: active ? 'var(--accent-strong)' : 'var(--muted)',
                  borderBottom: `2px solid ${active ? 'var(--accent-strong)' : 'transparent'}`, marginBottom: -1,
                }}>{t.label}</Link>
              );
            })}
          </div>

          {tab === 'overview' && <Overview report={report} />}
          {tab === 'creatives' && <Creatives report={report} />}
          {tab === 'hooks' && <InsightList title="Hooks récurrents" items={ins?.hooks} empty="Analyse IA requise." />}
          {tab === 'adcopy' && <InsightList title="Angles de copy" items={ins?.adCopyAngles} empty="Analyse IA requise." />}
          {tab === 'headlines' && <InsightList title="Headlines" items={ins?.headlines} empty="Analyse IA requise." />}
          {tab === 'angles' && <InsightList title="Angles marketing" items={ins?.adAngles} empty="Analyse IA requise." />}
          {tab === 'usps' && <InsightList title="Propositions de valeur" items={ins?.usps} empty="Analyse IA requise." />}
          {tab === 'desires' && <InsightList title="Désirs adressés" items={ins?.desires} empty="Analyse IA requise." />}
          {tab === 'emotions' && <InsightList title="Émotions activées" items={ins?.emotions} chips empty="Analyse IA requise." />}
          {tab === 'themes' && <InsightList title="Thèmes / univers" items={ins?.themes} chips empty="Analyse IA requise." />}
          {tab === 'personas' && <InsightList title="Personas déduits" items={ins?.personas} empty="Analyse IA requise." />}
        </>
      )}
    </main>
  );
}

function Overview({ report }: { report: CompetitorReport }) {
  const a = report.aggregates;
  const mediaTotal = Object.values(a.byMedia).reduce((n, x) => n + x, 0) || 1;
  return (
    <div>
      {report.insights?.summary && (
        <div style={{ ...card, borderColor: 'var(--line-2)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', color: 'var(--accent-strong)', marginBottom: 6 }}>SYNTHÈSE</div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>{report.insights.summary}</p>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Stat n={a.adCount} label="Créas analysées" />
        <Stat n={a.avgDaysRunning} label="Jours actifs (moy.)" />
        <Stat n={a.longestRunning} label="Plus longue (jours)" />
        <Stat n={Object.keys(a.byPlatform).length} label="Plateformes" />
      </div>

      <h2 style={sectionH}>Media mix</h2>
      <div style={{ ...card }}>
        {Object.entries(a.byMedia).map(([m, n]) => (
          <div key={m} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}><span style={{ textTransform: 'capitalize' }}>{m}</span><span>{Math.round((n / mediaTotal) * 100)}%</span></div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><div style={{ width: `${(n / mediaTotal) * 100}%`, height: '100%', background: 'var(--grad-accent)' }} /></div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>CTA les plus utilisés</h3>
          {a.topCtas.length === 0 ? <p style={muted}>Non renseigné.</p> : a.topCtas.map((c) => <Bar key={c.label} label={c.label} n={c.n} max={a.topCtas[0]?.n ?? c.n} />)}
        </div>
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Landing pages</h3>
          {a.landingDomains.length === 0 ? <p style={muted}>Non renseigné.</p> : a.landingDomains.map((c) => <Bar key={c.label} label={c.label} n={c.n} max={a.landingDomains[0]?.n ?? c.n} />)}
        </div>
      </div>
    </div>
  );
}

function Creatives({ report }: { report: CompetitorReport }) {
  return (
    <div>
      <h2 style={sectionH}>Créatives <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{report.ads.length}</span></h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        {report.ads.map((ad) => (
          <div key={ad.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ aspectRatio: '4 / 5', background: '#140f18', position: 'relative' }}>
              {ad.thumbnailUrl
                 
                ? <img src={ad.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 12 }}>Aperçu indisponible</div>}
              {ad.daysRunning ? <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,.6)', color: '#fff' }}>{ad.daysRunning} j</span> : null}
            </div>
            <div style={{ padding: '10px 12px' }}>
              {ad.body && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ad.body}</p>}
              {ad.callToAction && <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)' }}>{ad.callToAction}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightList({ title, items, chips, empty }: { title: string; items?: string[]; chips?: boolean; empty: string }) {
  if (!items || items.length === 0) return <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: 20, color: 'var(--muted)', fontSize: 13 }}>{empty}</div>;
  return (
    <div>
      <h2 style={sectionH}>{title} <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>{items.length}</span></h2>
      {chips ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.map((it, i) => <span key={i} style={{ fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>{it}</span>)}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '12px 14px' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)', minWidth: 20 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{it}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Bar({ label, n, max }: { label: string; n: number; max: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', marginBottom: 3 }}><span style={{ maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><span>{n}</span></div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><div style={{ width: `${Math.max(6, (n / max) * 100)}%`, height: '100%', background: 'var(--grad-accent)' }} /></div>
    </div>
  );
}

const muted = { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as const;
