import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, PLAN_CREDITS, PLAN_PRICE, type Plan } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { changePlanAction } from '../../../actions/billing';
import { grantCreditsAction, rechargeAllocationAction } from '../../../actions/credits';
import { input, btn, btnGhost, panel, lbl, Msg } from '../../../../components/ui';

export const dynamic = 'force-dynamic';

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const OK: Record<string, string> = {
  changed: 'Formule appliquée.', same: 'C’est déjà la formule actuelle.',
  grant: 'Crédits ajustés.', recharge: 'Allocation rechargée.',
};
const ERR: Record<string, string> = { forbidden: 'Réservé au fondateur.', plan: 'Formule inconnue.', amount: 'Montant invalide.' };

/**
 * Pilotage interne des formules et des crédits · fondateur uniquement.
 *
 * Ces leviers attribuent des crédits SANS paiement : ils n'ont rien à faire sur
 * une page cliente. Ils vivaient jusqu'ici dans /settings et /billing, où le seul
 * garde était « rôle = propriétaire » · or toute inscription libre crée un
 * propriétaire. Ils sont désormais réunis ici, dans ADMIN+.
 */
export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/billing');
  const { ok, e } = await searchParams;

  let balance = 0;
  let subStatus: string | null = null;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance, st: schema.workspaces.subscriptionStatus })
      .from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    balance = w?.c ?? 0;
    subStatus = w?.st ?? null;
  }
  const plan = s.plan as Plan;
  const alloc = PLAN_CREDITS[plan] ?? 0;
  const fmt = (n: number) => n.toLocaleString('fr-FR');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Formules & crédits · pilotage</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FONDATEUR</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18, maxWidth: 720, lineHeight: 1.6 }}>
        Leviers internes sur <b>{s.workspaceName}</b>. Ils appliquent une formule et créditent
        <b> sans passer par Stripe</b> · à réserver aux tests, aux comptes de démonstration et aux gestes commerciaux.
        Le parcours client, lui, passe uniquement par <Link href="/billing" style={{ color: 'var(--accent-strong)' }}>Abonnement & factures</Link>.
      </p>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      {/* État courant */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
        <Stat label="Formule" value={PLAN_LABEL[plan]} sub={`${PLAN_PRICE[plan]} € / mois`} />
        <Stat label="Solde crédits" value={fmt(balance)} sub={`allocation ${fmt(alloc)} / mois`} strong />
        <Stat label="Abonnement Stripe" value={subStatus ?? 'aucun'} sub={subStatus ? 'géré par Stripe' : 'pilotage manuel'} />
      </div>

      <div style={panel}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Appliquer une formule</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
          Change la formule et recale l'allocation mensuelle. Les recharges déjà payées sont conservées :
          seule l'allocation d'abonnement est remplacée.
        </p>
        <form action={changePlanAction} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="hidden" name="back" value="admin" />
          <select name="plan" defaultValue={plan} style={{ ...input, width: 'auto', minWidth: 200 }}>
            {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]} · {fmt(PLAN_CREDITS[p])} cr.</option>)}
          </select>
          <button type="submit" style={btn}>Appliquer</button>
        </form>
      </div>

      <div style={{ ...panel, marginTop: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Ajuster les crédits</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
          Chaque mouvement est tracé au grand livre et apparaît dans l'historique du client.
        </p>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form action={grantCreditsAction} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input type="hidden" name="back" value="admin" />
            <div><label style={lbl}>Ajustement (+/−)</label><input name="amount" type="number" placeholder="ex : 500" style={{ ...input, width: 130 }} /></div>
            <div><label style={lbl}>Motif</label><input name="reason" placeholder="Geste commercial, correction…" style={{ ...input, width: 230 }} /></div>
            <button type="submit" style={btn}>Appliquer</button>
          </form>
          <form action={rechargeAllocationAction}>
            <input type="hidden" name="back" value="admin" />
            <button type="submit" style={btnGhost}>Recharger l'allocation du mois</button>
          </form>
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
        Pour le détail des coûts réels et des marges par action, voir <Link href="/credits" style={{ color: 'var(--accent-strong)' }}>Crédits & marges</Link>.
        Pour le MRR et les encaissements, voir <Link href="/admin/finance" style={{ color: 'var(--accent-strong)' }}>Finance</Link>.
      </p>
    </main>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div style={{ border: `1px solid ${strong ? 'rgba(245,166,35,.3)' : 'var(--line)'}`, borderRadius: 16, background: strong ? 'rgba(245,166,35,.06)' : 'var(--surface)', padding: '15px 17px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, color: strong ? 'var(--accent-strong)' : 'var(--ink)', marginTop: 5, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}
