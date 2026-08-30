import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, PLAN_PRICE, PLAN_CREDITS, type Plan } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { analyzePlanNet, analyzePlanRisk, creditMarkup, corporateTaxRate, CREDIT_EUR } from '@tiktrends/core';

export const dynamic = 'force-dynamic';

const PAID: Plan[] = ['core', 'plus', 'business'];
const TARGET_GROSS = 0.65; // marge brute cible « saine »

const eur = (n: number) => {
  const d = Math.abs(n) < 1 ? 3 : Math.abs(n) >= 100 ? 0 : 2;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
};

export default async function FinancePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/admin');

  // Répartition des espaces par plan (plateforme entière).
  const counts: Record<Plan, number> = { starter: 0, core: 0, plus: 0, business: 0 };
  if (db) {
    const rows = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces);
    for (const r of rows) { const p = (r.plan as Plan) in counts ? (r.plan as Plan) : 'starter'; counts[p]++; }
  }

  const markup = creditMarkup();
  const taxRate = corporateTaxRate();

  const rows = PAID.map((p) => {
    const price = PLAN_PRICE[p];
    const credits = PLAN_CREDITS[p];
    const net = analyzePlanNet(PLAN_LABEL[p], price, credits, markup, taxRate);
    const risk = analyzePlanRisk(PLAN_LABEL[p], price, credits, Math.round(TARGET_GROSS * 100));
    const n = counts[p];
    // Optimisation : crédits max pour tenir la marge brute cible au prix actuel.
    const optimalCredits = Math.floor((price * (1 - TARGET_GROSS) * markup) / CREDIT_EUR);
    const overAllocated = credits > optimalCredits * 1.1;
    return { plan: p, label: PLAN_LABEL[p], price, credits, net, risk, n, optimalCredits, overAllocated };
  });

  const mrr = rows.reduce((t, r) => t + r.price * r.n, 0);
  const arr = mrr * 12;
  const netMonthly = rows.reduce((t, r) => t + r.net.netEur * r.n, 0);
  const paying = rows.reduce((t, r) => t + r.n, 0);
  const arpa = paying > 0 ? mrr / paying : 0;

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Finance · MRR & marges</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FONDATEUR</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Revenu récurrent et bénéfice net réel de la plateforme, basés sur les abonnements en cours. La marge nette déduit coût API (pire cas, allocation pleine), frais de paiement et IS ({Math.round(taxRate * 100)} %).
      </p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="MRR" value={eur(mrr)} accent hint="Revenu mensuel récurrent" />
        <Kpi label="ARR" value={eur(arr)} hint="Annualisé (MRR × 12)" />
        <Kpi label="Bénéfice net / mois" value={eur(netMonthly)} accent={netMonthly > 0} hint="Après coût API, frais, IS" />
        <Kpi label="Clients payants" value={String(paying)} hint={`ARPA ${eur(arpa)}`} />
      </div>

      {/* Répartition par plan */}
      <h2 style={h2}>Par formule</h2>
      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', marginBottom: 26 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>{['Formule', 'Prix HT', 'Clients', 'MRR', 'Marge nette/ab.', 'Net/mois', 'Santé'].map((h, i) => (
              <th key={h} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plan}>
                <td style={{ ...td, fontWeight: 800, color: 'var(--ink)' }}>{r.label}</td>
                <td style={tdR}>{eur(r.price)}</td>
                <td style={tdR}>{r.n}</td>
                <td style={{ ...tdR, fontWeight: 800, color: 'var(--ink)' }}>{eur(r.price * r.n)}</td>
                <td style={{ ...tdR, color: r.net.netEur > 0 ? '#7ee8bf' : '#ff9db0' }}>{eur(r.net.netEur)} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({r.net.netPct}%)</span></td>
                <td style={{ ...tdR, fontWeight: 700 }}>{eur(r.net.netEur * r.n)}</td>
                <td style={tdR}>{r.risk.healthy ? <span style={{ color: '#7ee8bf' }}>saine</span> : <span style={{ color: '#f5b043' }}>à surveiller</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Optimisation des marges */}
      <h2 style={h2}>Optimisation des marges · reco</h2>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>
        Cible : <b style={{ color: 'var(--ink-2)' }}>{Math.round(TARGET_GROSS * 100)} % de marge brute</b> même si le client consomme 100 % de ses crédits. Deux leviers : réduire l'allocation, ou monter le prix.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {rows.map((r) => (
          <div key={r.plan} style={{ border: `1px solid ${r.overAllocated ? 'rgba(245,166,35,.4)' : 'var(--line-2)'}`, borderRadius: 14, background: r.overAllocated ? 'rgba(245,166,35,.06)' : 'var(--surface)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontSize: 15, color: 'var(--ink)' }}>{r.label}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{eur(r.price)}/mois</span>
              {r.overAllocated && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#ffca6b', background: 'rgba(245,166,35,.14)', padding: '2px 8px', borderRadius: 999 }}>SUR-ALLOUÉ</span>}
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              <Row k="Crédits actuels" v={r.credits.toLocaleString('fr-FR')} />
              <Row k={`Crédits pour ${Math.round(TARGET_GROSS * 100)} % de marge`} v={r.optimalCredits.toLocaleString('fr-FR')} accent={r.overAllocated} />
              <Row k="Coût API pire cas" v={eur(r.net.apiCostEur)} />
              <Row k="Prix conseillé (crédits actuels)" v={eur(r.risk.recommendedPriceEur)} accent={r.risk.recommendedPriceEur > r.price} />
              <Row k="Pire cas de marge" v={`${r.risk.worstMarginPct}% · ${r.risk.worstAction}`} />
            </div>
            {r.overAllocated && (
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#ffca6b', lineHeight: 1.5 }}>
                Réduire à <b>~{r.optimalCredits.toLocaleString('fr-FR')} crédits</b> (ou passer le prix à <b>{eur(r.risk.recommendedPriceEur)}</b>) pour sécuriser la marge.
              </p>
            )}
          </div>
        ))}
      </div>

      <p style={{ margin: '18px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>
        Réglages via variables serveur : <code>CREDIT_MARKUP</code> (marge), <code>CORPORATE_TAX_RATE</code> (IS). Les allocations et prix des formules sont dans <code>lib/rbac.ts</code> (PLAN_CREDITS / PLAN_PRICE) · dis-moi les valeurs cibles et je les applique.
      </p>
    </main>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: accent ? 'var(--accent-strong)' : 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}
function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <b style={{ color: accent ? '#ffca6b' : 'var(--ink)' }}>{v}</b>
    </div>
  );
}

const h2 = { margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' } as const;
const th = { padding: '11px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--line)' } as const;
const td = { padding: '11px 14px', fontSize: 13, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' } as const;
const tdR = { ...td, textAlign: 'right' } as const;
