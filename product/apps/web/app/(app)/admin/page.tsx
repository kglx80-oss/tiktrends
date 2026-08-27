import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, ROLE_LABEL, PLAN_LABEL, PLAN_PRICE, type Plan } from '../../../lib/rbac';
import { isFounder } from '../../../lib/founder';
import { computePlatformMetrics } from '../../../lib/platform-metrics';

export const dynamic = 'force-dynamic';

const PLAN_ORDER: Plan[] = ['starter', 'core', 'plus', 'business'];
const PLAN_COLOR: Record<Plan, string> = { starter: '#8a94a6', core: '#7aa2ff', plus: '#c07bff', business: '#f5a623' };
const eur = (n: number) => n.toLocaleString('fr-FR') + ' €';
const num = (n: number) => n.toLocaleString('fr-FR');

interface Tool { icon: string; title: string; desc: string; href: string; badge?: string }

export default async function AdminBackstage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/dashboard');

  const m = await computePlatformMetrics();
  const conversionPct = m.workspaces ? Math.round((m.paying / m.workspaces) * 100) : 0;
  const activePct = m.workspaces ? Math.round((m.active30 / m.workspaces) * 100) : 0;

  const kpis: Array<{ label: string; value: string; sub?: string; strong?: boolean }> = [
    { label: 'MRR', value: eur(m.mrr), sub: `ARR ${eur(m.arr)}`, strong: true },
    { label: 'Espaces payants', value: num(m.paying), sub: `${conversionPct}% de conversion` },
    { label: 'ARPA', value: eur(m.arpa), sub: 'revenu moyen / payant' },
    { label: 'Nouveaux (30 j)', value: num(m.new30), sub: `${num(m.workspaces)} espaces au total` },
    { label: 'Actifs (30 j)', value: `${num(m.active30)}`, sub: `${activePct}% · ${num(m.atRisk)} à risque` },
    { label: 'Crédits conso. (30 j)', value: num(m.creditsConsumed30), sub: `${num(m.creditsConsumedAll)} depuis le début` },
    { label: 'Créations IA', value: num(m.generationsTotal), sub: `${num(m.brandsTotal)} marques` },
    { label: 'Support', value: num(m.ticketsOpen), sub: `${num(m.ticketsTotal)} tickets au total` },
  ];

  const tools: Tool[] = [
    { icon: '📈', title: 'Finance · MRR & marges', desc: 'Revenu récurrent, bénéfice net réel, optimisation des marges par formule.', href: '/admin/finance' },
    { icon: '🧭', title: 'Inscriptions & onboarding', desc: 'Nouveaux comptes, profils déclarés, niveau IA et objectifs.', href: '/admin/signups', badge: `${m.new30} / 30j` },
    { icon: '◈', title: 'Crédits & marges', desc: 'Barème, coût réel API, règle × markup et marge par action.', href: '/credits' },
    { icon: '📟', title: 'Console', desc: 'État du système, intégrations, files de génération, diagnostics.', href: '/console' },
    { icon: '🧠', title: 'Jarvis', desc: 'Règles créatives maison imposées à chaque génération, par marque.', href: '/jarvis' },
    { icon: '🔭', title: 'Intelligence marché', desc: 'Concurrents (Atria, Foreplay, Higgsfield) et notre positionnement.', href: '/admin/intelligence' },
    { icon: '💳', title: 'Plans & Facturation', desc: 'Formules, prix, allocations et abonnements.', href: '/billing' },
    { icon: '⚙️', title: 'Réglages', desc: 'Paramètres de l’espace, modèles IA, clés et intégrations serveur.', href: '/settings' },
  ];

  return (
    <main style={{ padding: '26px 32px 60px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Héro */}
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid rgba(245,166,35,.3)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(245,166,35,.14), rgba(255,140,66,.06) 60%, var(--surface))', padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, flexShrink: 0 }}>🎛️</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Tableau de bord</h1>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ADMIN+</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
              La santé de TikTrends en un coup d'œil · {s.user.email}
            </p>
          </div>
          <Link href="/dashboard" style={{ padding: '9px 16px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Vue SaaS (app)</Link>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 22 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ border: `1px solid ${k.strong ? 'rgba(245,166,35,.35)' : 'var(--line)'}`, borderRadius: 16, background: k.strong ? 'rgba(245,166,35,.07)' : 'var(--surface)', padding: '15px 17px' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 25, fontWeight: 800, color: k.strong ? '#ffca6b' : 'var(--ink)', marginTop: 5, lineHeight: 1 }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Répartition par formule */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Répartition par formule</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{num(m.workspaces)} espaces</span>
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'var(--paper)', marginBottom: 12 }}>
          {PLAN_ORDER.map((p) => {
            const pct = m.workspaces ? (m.byPlan[p] / m.workspaces) * 100 : 0;
            return pct > 0 ? <div key={p} title={`${PLAN_LABEL[p]} · ${m.byPlan[p]}`} style={{ width: `${pct}%`, background: PLAN_COLOR[p] }} /> : null;
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {PLAN_ORDER.map((p) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: PLAN_COLOR[p] }} />
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>{m.byPlan[p]}</b> {PLAN_LABEL[p]}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{PLAN_PRICE[p] > 0 ? `${PLAN_PRICE[p]}€` : 'gratuit'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Accès rapide aux outils plateforme */}
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Outils plateforme</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {tools.map((t) => (
          <Link key={t.title} href={t.href} style={{ display: 'block', border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: '15px 17px', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.24)', flexShrink: 0 }}>{t.icon}</span>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{t.title}</span>
              {t.badge && <span style={{ fontSize: 11, fontWeight: 800, color: '#ffca6b', background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.3)', padding: '2px 8px', borderRadius: 999 }}>{t.badge}</span>}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{t.desc}</p>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
        Connecté · <b style={{ color: 'var(--ink-2)' }}>{s.user.email}</b> · {ROLE_LABEL[s.role]} · vue réservée au fondateur.
      </div>
    </main>
  );
}
