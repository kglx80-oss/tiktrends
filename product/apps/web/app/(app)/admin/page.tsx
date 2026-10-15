import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, ROLE_LABEL, PLAN_LABEL, PLAN_PRICE, type Plan } from '../../../lib/rbac';
import { isFounder } from '../../../lib/founder';
import { computePlatformMetrics } from '../../../lib/platform-metrics';
import { Icon } from '../../../components/Icon';
import { cadrePage, cadreSignal, surface } from '../../../components/ui';
import { OngletsAdministration } from '../../../components/OngletsReglages';
import { droitsAdministration } from '../../../lib/onglets-reglages';
import { groupesAdministration } from '@tiktrends/core';

export const dynamic = 'force-dynamic';

const PLAN_ORDER: Plan[] = ['starter', 'core', 'plus', 'business'];
const PLAN_COLOR: Record<Plan, string> = { starter: 'var(--cat-gris)', core: 'var(--cat-bleu)', plus: 'var(--cat-violet)', business: 'var(--cat-ambre)' };
const eur = (n: number) => n.toLocaleString('fr-FR') + ' €';
const num = (n: number) => n.toLocaleString('fr-FR');

/** L'icône de chaque outil (présentation seulement · la liste vient du noyau). */
const ICONE: Record<string, string> = {
  finance: 'chart', plans: 'card', paiement: 'gauge', credits: 'coin', depenses: 'coin',
  signups: 'users', equipe: 'lock', console: 'terminal', incidents: 'radar',
  'ia-studios': 'layers', interrupteurs: 'lock', connaissances: 'file', intelligence: 'search',
  jarvis: 'brain', billing: 'card', settings: 'gear',
};

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

  // Les sous-pages, par groupe, avec leur description réelle · seules celles
  // que la garde de chaque page ouvre (`groupesAdministration`, noyau).
  const groupes = groupesAdministration(droitsAdministration(s));
  const badges: Record<string, string> = { signups: `${m.new30} / 30j` };

  return (
    <main style={cadrePage}>
      <OngletsAdministration session={s} chemin="/admin" />
      {/* Héro */}
      <div style={{ position: 'relative', overflow: 'hidden', ...cadreSignal('color-mix(in srgb, var(--accent) 30%, transparent)'), background: 'linear-gradient(135deg in srgb, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 6%, transparent) 60%, var(--surface))', padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', flexShrink: 0 }}><Icon name="gauge" size={23} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Tableau de bord</h1>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ADMIN+</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
              La santé de TikTrends en un coup d'œil · {s.user.email}
            </p>
          </div>
          <Link href="/dashboard" style={{ padding: '9px 16px', borderRadius: 999, background: 'color-mix(in srgb, var(--line) 50%, transparent)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Vue SaaS (app)</Link>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 22 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...(k.strong ? cadreSignal('color-mix(in srgb, var(--accent) 35%, transparent)') : surface), background: k.strong ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'var(--surface)', padding: '15px 17px' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 25, fontWeight: 800, color: k.strong ? 'var(--accent-strong)' : 'var(--ink)', marginTop: 5, lineHeight: 1 }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Répartition par formule */}
      <div style={{ ...surface, background: 'var(--surface)', padding: '16px 18px', marginBottom: 22 }}>
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

      {/* Les sous-pages de l'Administration, par groupe */}
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Outils plateforme</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)' }}>Chaque outil garde sa page détaillée · seuls ceux que ton accès ouvre sont listés.</p>
      {groupes.map((g) => (
        <section key={g.groupe} data-groupe-admin={g.groupe} aria-labelledby={`groupe-${g.groupe}`} style={{ marginBottom: 18 }}>
          <h3 id={`groupe-${g.groupe}`} style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>{g.groupe}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
            {g.pages.map((t) => (
              <Link key={t.cle} href={t.href} data-outil={t.cle} style={{ display: 'block', ...surface, background: 'var(--surface)', padding: '15px 17px', textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)', flexShrink: 0 }}><Icon name={ICONE[t.cle] ?? 'grid'} size={18} /></span>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{t.titre}</span>
                  {badges[t.cle] && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-strong)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', padding: '2px 8px', borderRadius: 999 }}>{badges[t.cle]}</span>}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{t.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
        Connecté · <b style={{ color: 'var(--ink-2)' }}>{s.user.email}</b> · {ROLE_LABEL[s.role]} · vue réservée au fondateur.
      </div>
    </main>
  );
}
