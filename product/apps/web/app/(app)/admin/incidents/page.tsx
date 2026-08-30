import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { FAMILY_LABEL, type ErrorFamily } from '../../../../lib/user-error';

export const dynamic = 'force-dynamic';

/**
 * Journal des échecs techniques · fondateur uniquement.
 *
 * Objectif : voir en un coup d'œil si un fournisseur déraille, AVANT qu'un client
 * le signale. On regarde donc d'abord les familles (réseau ? quota ? clé ?) et
 * les zones touchées, le détail ligne à ligne ne venant qu'ensuite.
 */

const FAMILY_HINT: Partial<Record<ErrorFamily, string>> = {
  quota: 'Recharger le compte fournisseur (Fal, Anthropic).',
  acces: 'Clé serveur expirée ou révoquée · à renouveler dans .env.deploy.',
  saturation: 'Pic de charge chez le fournisseur · en général transitoire.',
  service: 'Panne côté fournisseur · vérifier sa page de statut.',
  image: 'Souvent des URLs produit incorrectes côté client, pas une panne.',
  reseau: 'Coupure réseau ou DNS · vérifier le serveur si ça persiste.',
};

const H = 24 * 3600 * 1000;

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/admin');

  const sp = await searchParams;
  const jours = [1, 7, 30].includes(Number(sp.j)) ? Number(sp.j) : 7;
  const since = new Date(Date.now() - jours * H);

  let parFamille: Array<{ family: string; n: number; dernier: Date }> = [];
  let parScope: Array<{ scope: string; n: number }> = [];
  let lignes: Array<typeof schema.errorLog.$inferSelect & { espace: string | null }> = [];
  let total = 0;

  if (db) {
    const [fam, sco, recent] = await Promise.all([
      db.select({ family: schema.errorLog.family, n: sql<number>`count(*)`, dernier: sql<Date>`max(${schema.errorLog.createdAt})` })
        .from(schema.errorLog).where(gte(schema.errorLog.createdAt, since))
        .groupBy(schema.errorLog.family).orderBy(sql`count(*) desc`),
      db.select({ scope: schema.errorLog.scope, n: sql<number>`count(*)` })
        .from(schema.errorLog).where(gte(schema.errorLog.createdAt, since))
        .groupBy(schema.errorLog.scope).orderBy(sql`count(*) desc`).limit(12),
      db.select({
        id: schema.errorLog.id, scope: schema.errorLog.scope, family: schema.errorLog.family,
        detail: schema.errorLog.detail, workspaceId: schema.errorLog.workspaceId,
        createdAt: schema.errorLog.createdAt, espace: schema.workspaces.name,
      }).from(schema.errorLog)
        .leftJoin(schema.workspaces, eq(schema.errorLog.workspaceId, schema.workspaces.id))
        .where(gte(schema.errorLog.createdAt, since))
        .orderBy(desc(schema.errorLog.createdAt)).limit(80),
    ]);
    parFamille = fam.map((r) => ({ family: r.family, n: Number(r.n), dernier: r.dernier as Date }));
    parScope = sco.map((r) => ({ scope: r.scope, n: Number(r.n) }));
    lignes = recent as typeof lignes;
    total = parFamille.reduce((a, r) => a + r.n, 0);
  }

  const max = parFamille[0]?.n || 1;
  const quand = (d: Date) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const nomFamille = (f: string) => FAMILY_LABEL[f as ErrorFamily] ?? f;

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Incidents techniques</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FONDATEUR</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 7, 30].map((j) => (
            <Link key={j} href={`/admin/incidents?j=${j}`} style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: 'none',
              border: '1px solid var(--line-2)',
              background: j === jours ? 'var(--grad-accent)' : 'transparent',
              color: j === jours ? '#0d070c' : 'var(--ink-2)',
            }}>{j} j</Link>
          ))}
        </div>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22, maxWidth: 720, lineHeight: 1.6 }}>
        Chaque échec rencontré par un client, regroupé par cause. Sert à repérer un fournisseur qui déraille
        avant que quiconque le signale. Conservation 30 jours.
      </p>

      {total === 0 ? (
        <div style={{ border: '1px dashed rgba(126,232,191,.35)', background: 'rgba(126,232,191,.05)', borderRadius: 16, padding: '30px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 26 }}>✓</div>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#7ee8bf', fontWeight: 700 }}>Aucun incident sur {jours} jour(s).</p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>Toutes les générations ont abouti, ou le journal vient d'être mis en service.</p>
        </div>
      ) : (
        <>
          <section style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
              Par cause <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· {total} échec(s)</span>
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {parFamille.map((f) => (
                <div key={f.family}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 165, fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{nomFamille(f.family)}</span>
                    <div style={{ flex: 1, height: 10, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${(f.n / max) * 100}%`, height: '100%', background: 'var(--grad-accent)', borderRadius: 999 }} />
                    </div>
                    <span style={{ width: 44, textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{f.n}</span>
                    <span style={{ width: 96, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{quand(f.dernier)}</span>
                  </div>
                  {FAMILY_HINT[f.family as ErrorFamily] && (
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 175, marginTop: 3 }}>{FAMILY_HINT[f.family as ErrorFamily]}</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Zones touchées</h2>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {parScope.map((z) => (
                <span key={z.scope} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, border: '1px solid var(--line-2)', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-2)', fontFamily: 'ui-monospace, monospace' }}>{z.scope}</span>
                  <span style={{ color: 'var(--accent-strong)', fontWeight: 800 }}>{z.n}</span>
                </span>
              ))}
            </div>
          </section>

          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Derniers échecs</h2>
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
            {lignes.map((r, i) => (
              <div key={r.id} style={{ padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent-strong)', fontFamily: 'ui-monospace, monospace' }}>{r.scope}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-2)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)' }}>{nomFamille(r.family)}</span>
                  {r.espace && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.espace}</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{quand(r.createdAt as Date)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word', lineHeight: 1.5 }}>{r.detail}</div>
              </div>
            ))}
          </div>
          {lignes.length >= 80 && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>80 échecs les plus récents affichés.</p>}
        </>
      )}
    </main>
  );
}
