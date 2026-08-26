import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { CREDIT_COSTS, analyzeCosts, analyzePlan, analyzePlanRisk, analyzePlanNet, repricingSuggestions, creditMarkup, corporateTaxRate, CREDIT_EUR, PAYMENT_FEE_PCT } from '@tiktrends/core';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_CREDITS, PLAN_PRICE, PLAN_LABEL, type Plan } from '../../../lib/rbac';
import { grantCreditsAction, rechargeAllocationAction } from '../../actions/credits';
import { input, btn, btnGhost, panel, Msg } from '../../../components/ui';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { grant: 'Crédits mis à jour.', recharge: "Allocation mensuelle rechargée." };
const ERR: Record<string, string> = { forbidden: 'Réservé au propriétaire.', amount: 'Montant invalide.' };

const ACTION_FR: Record<string, string> = {
  tag_video: 'Tag vidéo (IA)', tag_image: 'Tag image (IA)', transcription_min: 'Transcription (par min)',
  script: 'Script (Studio)', brief: 'Brief', image: 'Génération image', review_mining: "Analyse d'avis",
  report: 'Rapport', clone_image: 'Clone image',
};

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { ok, e } = await searchParams;
  const isOwner = s.role === 'owner';

  let balance = 0;
  let ledger: Array<typeof schema.creditLedger.$inferSelect> = [];
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    balance = w?.c ?? 0;
    ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, s.workspaceId)).orderBy(desc(schema.creditLedger.createdAt)).limit(12);
  }
  const alloc = PLAN_CREDITS[s.plan as Plan] ?? 0;
  const usedPct = alloc ? Math.min(100, Math.round(((alloc - balance) / alloc) * 100)) : 0;

  // Économie : coût réel fournisseur -> prix de revente (règle maison × markup).
  const markup = creditMarkup();
  const analysis = analyzeCosts(markup);
  const plans: Plan[] = ['starter', 'core', 'plus', 'business'];
  const planEco = plans.map((p) => analyzePlan(PLAN_LABEL[p], PLAN_PRICE[p], PLAN_CREDITS[p], markup));
  const taxRate = corporateTaxRate();
  const planNet = plans.filter((p) => PLAN_PRICE[p] > 0).map((p) => analyzePlanNet(PLAN_LABEL[p], PLAN_PRICE[p], PLAN_CREDITS[p], markup, taxRate));
  const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: 3 }) + ' €';
  // Rentabilité « chef d'entreprise » : marge plancher (pire cas) par formule + corrections de barème.
  const TARGET_MARGIN = 70;
  const planRisk = plans.filter((p) => PLAN_PRICE[p] > 0).map((p) => analyzePlanRisk(PLAN_LABEL[p], PLAN_PRICE[p], PLAN_CREDITS[p], TARGET_MARGIN));
  const suggestions = repricingSuggestions(markup);
  const risky = planRisk.filter((p) => !p.healthy);

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Crédits</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ADMIN+</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Chaque action IA (tagging, génération, rapports…) consomme des crédits. Gère ici l'allocation, le solde et les règles.
      </p>
      <PageInfo title="comment marchent les crédits">
        Ton plan donne une <b>allocation mensuelle</b>. Chaque action IA débite des crédits selon un barème (ci-dessous),
        avec une trace dans l'historique. Le propriétaire peut <b>recharger l'allocation</b> ou <b>ajuster</b> le solde
        manuellement. Report partiel de 25&nbsp;% des crédits non utilisés en fin de cycle (règle CDC).
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      {/* Solde + allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={card}><div style={cl}>Solde actuel</div><div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent-strong)' }}>◈ {balance.toLocaleString('fr-FR')}</div></div>
        <div style={card}><div style={cl}>Allocation ({PLAN_LABEL[s.plan]})</div><div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)' }}>{alloc.toLocaleString('fr-FR')}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>par mois</div></div>
        <div style={card}>
          <div style={cl}>Consommé ce cycle</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)' }}>{usedPct}%</div>
          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${usedPct}%`, height: '100%', background: 'var(--grad-accent)' }} />
          </div>
        </div>
      </div>

      {/* Contrôles propriétaire */}
      {isOwner && (
        <div style={panel}>
          <h2 style={h2}>Gérer les crédits</h2>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <form action={rechargeAllocationAction}>
              <button type="submit" style={btn}>Recharger l'allocation du mois</button>
            </form>
            <form action={grantCreditsAction} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div><label style={lbl}>Ajustement (+/−)</label><input name="amount" type="number" placeholder="ex : 500" style={{ ...input, width: 120 }} /></div>
              <div><label style={lbl}>Motif</label><input name="reason" placeholder="Bonus, correction…" style={{ ...input, width: 180 }} /></div>
              <button type="submit" style={btnGhost}>Appliquer</button>
            </form>
          </div>
        </div>
      )}

      {/* ============ ÉCONOMIE RÉELLE (ADMIN) ============ */}
      <section style={{ ...panel, borderColor: 'rgba(245,166,35,.3)', background: 'linear-gradient(180deg, rgba(245,166,35,.06), var(--surface))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...h2, fontSize: 18 }}>Économie & marges · règle maison</h2>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>COÛT RÉEL × {markup}</span>
        </div>
        <p style={{ margin: '8px 0 14px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 760 }}>
          Notre modèle : on facture le client au <b>coût API réel × {markup}</b> (marge cible, réglable via la variable
          d'environnement <code style={codeS}>CREDIT_MARKUP</code>). L'unité de facturation est le <b>crédit</b>, valorisé à
          <b> {CREDIT_EUR.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</b> de revente (référence : plan Core, 99 € / 2000 crédits).
          Formule : <code style={codeS}>crédits = plafond(coût_réel × {markup} ÷ {CREDIT_EUR})</code>. Les coûts réels sont des estimations de
          première passe, à affiner avec les factures Fal / Anthropic.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Action</th><th style={th}>Fournisseur</th><th style={thR}>Coût réel</th>
                <th style={thR}>Crédits</th><th style={thR}>Revente</th><th style={thR}>Marge</th><th style={thR}>Reco</th>
              </tr>
            </thead>
            <tbody>
              {analysis.map((a) => (
                <tr key={a.action} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, color: 'var(--ink)', fontWeight: 700 }}>{a.label}<div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>par {a.unit}</div></td>
                  <td style={{ ...td, color: 'var(--ink-2)' }}>{a.provider}</td>
                  <td style={tdR}>{eur(a.realEur)}</td>
                  <td style={{ ...tdR, color: 'var(--ink)', fontWeight: 700 }}>◈ {a.credits}</td>
                  <td style={tdR}>{eur(a.resaleEur)}</td>
                  <td style={{ ...tdR, fontWeight: 800, color: a.marginX >= markup * 0.9 ? '#7ee8bf' : '#f5b043' }}>×{a.marginX.toFixed(1)}</td>
                  <td style={tdR}>
                    <span title={a.aligned ? 'Barème aligné sur la marge cible' : `Reco : ◈ ${a.recommendedCredits} pour une marge ×${markup}`}
                      style={{ fontWeight: 700, color: a.aligned ? 'var(--muted)' : 'var(--accent-strong)' }}>
                      {a.aligned ? '✓' : `◈ ${a.recommendedCredits}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
          « Marge » = prix de revente ÷ coût réel. En vert : marge ≥ cible. En orange : sous la cible · la colonne « Reco »
          indique le nombre de crédits à facturer pour revenir à ×{markup}.
        </p>
      </section>

      {/* ============ MARGE NETTE · CE QU'ON GAGNE VRAIMENT ============ */}
      <section style={{ ...panel, borderColor: 'rgba(126,232,191,.35)', background: 'linear-gradient(180deg, rgba(61,220,151,.05), var(--surface))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...h2, fontSize: 18 }}>Ce qu'on gagne vraiment · marge nette</h2>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d3d2a', background: 'linear-gradient(135deg,#3ddc97,#7ee8bf)' }}>SAS · IS {Math.round(taxRate * 100)}%</span>
        </div>
        <p style={{ margin: '8px 0 16px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 820 }}>
          Bénéfice net par abonnement, une fois déduits le <b>coût API</b> (cas max, tout consommé au markup ×{markup}),
          les <b>frais de paiement</b> (~{Math.round(PAYMENT_FEE_PCT * 100)}% + 0,30 €) et l'<b>impôt sur les sociétés</b> ({Math.round(taxRate * 100)}%).
          La TVA (20 %) est collectée puis reversée : neutre. En pratique la marge est plus élevée (peu de clients consomment 100 % de leurs crédits).
        </p>

        {/* Cartes « net par formule » */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          {planNet.map((p) => (
            <div key={p.plan} style={{ border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{p.plan}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>{p.priceEur} € / mois HT</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#7ee8bf', lineHeight: 1 }}>+{Math.round(p.netEur)} €</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>net / mois · {p.netPct}% du prix</div>
              <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>soit <b style={{ color: 'var(--ink)' }}>{Math.round(p.netEur * 12)} €</b> net / an par client</div>
            </div>
          ))}
        </div>

        {/* Détail du calcul */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Formule</th><th style={thR}>Prix HT</th><th style={thR}>− Coût API</th>
                <th style={thR}>− Frais paiement</th><th style={thR}>= Marge brute</th><th style={thR}>− Impôt (IS)</th><th style={thR}>= Marge nette</th>
              </tr>
            </thead>
            <tbody>
              {planNet.map((p) => (
                <tr key={p.plan} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, color: 'var(--ink)', fontWeight: 700 }}>{p.plan}</td>
                  <td style={tdR}>{p.priceEur} €</td>
                  <td style={{ ...tdR, color: '#f5b043' }}>{eur(p.apiCostEur)}</td>
                  <td style={{ ...tdR, color: '#f5b043' }}>{eur(p.paymentFeeEur)}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{Math.round(p.grossEur)} € <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({p.grossPct}%)</span></td>
                  <td style={{ ...tdR, color: '#f5b043' }}>{eur(p.taxEur)}</td>
                  <td style={{ ...tdR, fontWeight: 800, color: '#7ee8bf' }}>{Math.round(p.netEur)} € <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({p.netPct}%)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
          Réglable : <code style={codeS}>CREDIT_MARKUP</code> (marge), <code style={codeS}>CORPORATE_TAX_RATE</code> (IS · 0.15 réduit sous 42 500 € de bénéfice, 0.25 normal).
        </p>
      </section>

      {/* ============ RENTABILITÉ · MODE CHEF D'ENTREPRISE ============ */}
      <section style={{ ...panel, borderColor: risky.length ? 'rgba(245,176,67,.45)' : 'rgba(126,232,191,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ ...h2, fontSize: 18 }}>Rentabilité & optimisation</h2>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: risky.length ? '#0d070c' : '#0d3d2a', background: risky.length ? 'linear-gradient(135deg,#f5a623,#ff8c42)' : 'linear-gradient(135deg,#3ddc97,#7ee8bf)' }}>
            {risky.length ? `${risky.length} formule(s) à surveiller` : 'Marges saines'}
          </span>
        </div>
        <p style={{ margin: '8px 0 14px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 780 }}>
          Le vrai risque n'est pas la marge moyenne, c'est le <b>pire cas</b> : si un client dépense <b>toute</b> son
          allocation sur l'action la moins rentable (souvent la <b>vidéo</b>), quelle marge reste-t-il&nbsp;? On vise une
          marge brute d'au moins <b>{TARGET_MARGIN}%</b> même dans ce scénario.
        </p>

        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 660 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Formule</th><th style={thR}>Prix</th><th style={thR}>Marge pleine</th>
                <th style={thR}>Marge plancher</th><th style={th}>Action à risque</th><th style={thR}>Prix conseillé</th><th style={thR}>Santé</th>
              </tr>
            </thead>
            <tbody>
              {planRisk.map((p) => (
                <tr key={p.plan} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, color: 'var(--ink)', fontWeight: 700 }}>{p.plan}</td>
                  <td style={tdR}>{p.priceEur} €</td>
                  <td style={{ ...tdR, color: '#7ee8bf', fontWeight: 700 }}>{p.bestMarginPct} %</td>
                  <td style={{ ...tdR, fontWeight: 800, color: p.worstMarginPct >= TARGET_MARGIN ? '#7ee8bf' : p.worstMarginPct >= 40 ? '#f5b043' : '#ff6b6b' }}>{p.worstMarginPct} %</td>
                  <td style={{ ...td, color: 'var(--ink-2)' }}>{p.worstAction}<div style={{ fontSize: 10.5, color: 'var(--muted)' }}>coût max {eur(p.worstRealCostEur)}</div></td>
                  <td style={tdR}>{p.recommendedPriceEur > p.priceEur ? <b style={{ color: 'var(--accent-strong)' }}>{p.recommendedPriceEur} €</b> : <span style={{ color: 'var(--muted)' }}>OK</span>}</td>
                  <td style={tdR}><span style={{ fontWeight: 800, color: p.healthy ? '#7ee8bf' : '#f5b043' }}>{p.healthy ? '✓' : '⚠'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Corrections de barème conseillées */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Corrections de barème conseillées ({suggestions.length})</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {suggestions.map((a) => {
                const up = a.recommendedCredits > a.credits;
                return (
                  <div key={a.action} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160, color: 'var(--ink-2)' }}>{a.label} <span style={{ color: 'var(--muted)' }}>· marge ×{a.marginX.toFixed(1)}</span></span>
                    <span style={{ color: 'var(--muted)' }}>◈ {a.credits}</span>
                    <span style={{ color: 'var(--muted)' }}>→</span>
                    <span style={{ fontWeight: 800, color: up ? 'var(--accent-strong)' : '#7ee8bf' }}>◈ {a.recommendedCredits}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#f5b043' : '#7ee8bf' }}>{up ? 'à augmenter' : 'baisse possible'}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
              Pour appliquer : ajuste <code style={codeS}>CREDIT_COSTS</code> dans <code style={codeS}>packages/core</code> vers les valeurs « reco »,
              et/ou relève le prix des formules à risque. Le multiplicateur global se règle via <code style={codeS}>CREDIT_MARKUP</code>.
            </p>
          </div>
        )}

        {/* Synthèse chef d'entreprise */}
        <div style={{ marginTop: 12, padding: '13px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(254,44,85,.08), rgba(120,90,255,.05))', border: '1px solid var(--line-2)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--ink)' }}>Lecture directeur :</b> la marge « pleine » est confortable partout, mais la <b>vidéo</b> est
          le poste qui tire la rentabilité vers le bas (coût réel élevé, sous-facturée en crédits). Deux leviers :
          {' '}1) <b>reprix</b> la vidéo dans le barème (colonne reco) ; 2) <b>encadre</b> le volume vidéo par formule
          (quota) pour protéger la marge plancher. Le reste des actions (image, copy, tags) est très margé et finance
          l'ensemble.
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* Barème */}
        <section style={panel}>
          <h2 style={h2}>Barème (coût par action)</h2>
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {Object.entries(CREDIT_COSTS).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--ink-2)' }}>{ACTION_FR[k] || k}</span>
                <span style={{ color: 'var(--ink)', fontWeight: 700 }}>◈ {v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Historique */}
        <section style={panel}>
          <h2 style={h2}>Historique</h2>
          {ledger.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun mouvement pour l'instant.</p>}
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {ledger.map((l) => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <div><div style={{ color: 'var(--ink)' }}>{l.reason}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(l.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
                <span style={{ fontWeight: 800, color: l.delta >= 0 ? 'var(--ok)' : '#ff9db0' }}>{l.delta >= 0 ? '+' : ''}{l.delta}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

const card = { padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)' } as const;
const cl = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 6 } as const;
const h2 = { margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' } as const;
const lbl = { fontSize: 12, color: 'var(--ink-2)', display: 'block', marginBottom: 5 } as const;
const th = { padding: '4px 10px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' } as const;
const thR = { ...th, textAlign: 'right' } as const;
const td = { padding: '9px 10px', verticalAlign: 'top' } as const;
const tdR = { ...td, textAlign: 'right', color: 'var(--ink-2)', whiteSpace: 'nowrap' } as const;
const codeS = { fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, background: 'rgba(255,255,255,.06)', padding: '1px 5px', borderRadius: 5, color: 'var(--ink)' } as const;
