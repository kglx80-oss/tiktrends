import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { CREDIT_COSTS } from '@tiktrends/core';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_CREDITS, PLAN_LABEL, type Plan } from '../../../lib/rbac';
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
