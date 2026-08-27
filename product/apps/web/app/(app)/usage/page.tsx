import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, PLAN_CREDITS, PLAN_LABEL, type Plan } from '../../../lib/rbac';
import { unlimitedCredits } from '../../../lib/credits';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

/** Regroupe les libellés du grand livre en familles lisibles par le client. */
function familyOf(reason: string): { label: string; icon: string } {
  const r = reason.toLowerCase();
  if (r.includes('recharge')) return { label: 'Recharge', icon: '💳' };
  if (r.includes('abonnement') || r.includes('formule') || r.includes('test')) return { label: 'Abonnement', icon: '◈' };
  if (r.includes('pubs') || r.includes('clone')) return { label: 'Pubs IA', icon: '✨' };
  if (r.includes('vidéo')) return { label: 'Vidéo IA', icon: '🎬' };
  if (r.includes('image') || r.includes('visuel')) return { label: 'Image IA', icon: '🖼️' };
  if (r.includes('assistant')) return { label: 'Assistant', icon: '💬' };
  if (r.includes('assets') || r.includes('tagging')) return { label: 'Assets', icon: '🗂️' };
  if (r.includes('jarvis')) return { label: 'Jarvis', icon: '🧠' };
  if (r.includes('concurrent')) return { label: 'Veille', icon: '🔭' };
  if (r.includes('marque') || r.includes('profil') || r.includes('produits')) return { label: 'Marque', icon: '🏷️' };
  return { label: 'Autre', icon: '·' };
}

export default async function UsagePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');

  const plan = s.plan as Plan;
  const unlimited = unlimitedCredits(s.user.email);
  const since = new Date(Date.now() - 30 * 86_400_000);

  let balance = 0;
  let rows: Array<typeof schema.creditLedger.$inferSelect> = [];
  let spent30 = 0, added30 = 0;
  if (db) {
    const [[w], list, agg] = await Promise.all([
      db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, s.workspaceId)).orderBy(desc(schema.creditLedger.createdAt)).limit(120),
      db.select({
        spent: sql<number>`coalesce(-sum(case when ${schema.creditLedger.delta} < 0 then ${schema.creditLedger.delta} else 0 end), 0)`,
        added: sql<number>`coalesce(sum(case when ${schema.creditLedger.delta} > 0 then ${schema.creditLedger.delta} else 0 end), 0)`,
      }).from(schema.creditLedger).where(and(eq(schema.creditLedger.workspaceId, s.workspaceId), gte(schema.creditLedger.createdAt, since))),
    ]);
    balance = w?.c ?? 0;
    rows = list;
    spent30 = Number(agg[0]?.spent ?? 0);
    added30 = Number(agg[0]?.added ?? 0);
  }

  // Répartition de la consommation par famille (30 derniers jours).
  const byFamily = new Map<string, { icon: string; total: number }>();
  for (const r of rows) {
    if (r.delta >= 0 || (r.createdAt as Date) < since) continue;
    const f = familyOf(r.reason);
    const cur = byFamily.get(f.label) ?? { icon: f.icon, total: 0 };
    cur.total += -r.delta;
    byFamily.set(f.label, cur);
  }
  const families = [...byFamily.entries()].sort((a, b) => b[1].total - a[1].total);
  const maxFamily = families[0]?.[1].total || 1;

  const alloc = PLAN_CREDITS[plan] ?? 0;
  const fmt = (n: number) => n.toLocaleString('fr-FR');
  const when = (d: Date) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Utilisation des crédits</h1>
        <span style={{ flex: 1 }} />
        <Link href="/billing" style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>Abonnement & factures ›</Link>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Le détail de ce que ton espace a consommé, action par action. Rien n'est facturé sans apparaître ici.
      </p>

      <PageInfo title="lire ta consommation">
        Chaque génération débite un nombre de crédits fixe selon l'action (une image coûte moins qu'une vidéo).
        Les lignes en <b style={{ color: '#7ee8bf' }}>vert</b> ajoutent des crédits (allocation mensuelle, recharge, remboursement),
        celles en <b style={{ color: 'var(--ink-2)' }}>gris</b> en consomment. Une génération qui échoue est remboursée.
      </PageInfo>

      {/* Résumé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Card label="Solde actuel" value={unlimited ? '∞' : fmt(balance)} sub={unlimited ? 'Illimité · fondateur' : `sur ${fmt(alloc)} / mois (${PLAN_LABEL[plan]})`} strong />
        <Card label="Consommé (30 j)" value={fmt(spent30)} sub="crédits utilisés" />
        <Card label="Ajouté (30 j)" value={fmt(added30)} sub="allocation + recharges" />
      </div>

      {/* Répartition par type d'action */}
      {families.length > 0 && (
        <section style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Où partent tes crédits <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· 30 derniers jours</span></h2>
          <div style={{ display: 'grid', gap: 9 }}>
            {families.map(([label, { icon, total }]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 130, fontSize: 12.5, color: 'var(--ink-2)' }}>{icon} {label}</span>
                <div style={{ flex: 1, height: 10, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${(total / maxFamily) * 100}%`, height: '100%', background: 'var(--grad-accent)', borderRadius: 999 }} />
                </div>
                <span style={{ width: 62, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{fmt(total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Journal détaillé */}
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Journal détaillé</h2>
      {rows.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Aucun mouvement pour l'instant. Lance une génération depuis le Studio.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const f = familyOf(r.reason);
            const positive = r.delta > 0;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: 'var(--surface)' }}>
                <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{f.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{f.label}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{when(r.createdAt as Date)}</span>
                <span style={{ width: 78, textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: positive ? '#7ee8bf' : 'var(--ink-2)' }}>
                  {positive ? '+' : ''}{fmt(r.delta)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {rows.length >= 120 && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>120 mouvements les plus récents affichés.</p>}
    </main>
  );
}

function Card({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div style={{ border: `1px solid ${strong ? 'rgba(254,44,85,.3)' : 'var(--line)'}`, borderRadius: 16, background: strong ? 'rgba(254,44,85,.06)' : 'var(--surface)', padding: '15px 17px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color: strong ? 'var(--accent-strong)' : 'var(--ink)', marginTop: 5, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}
