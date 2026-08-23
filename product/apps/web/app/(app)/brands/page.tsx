import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { deleteBrandAction } from '../../actions/brands';
import { Msg } from '../../../components/ui';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { '1': 'Marque créée.', created: 'Marque créée et sélectionnée.', renamed: 'Marque renommée.', deleted: 'Marque supprimée.', saved: 'Marque mise à jour.' };
const ERR: Record<string, string> = { forbidden: 'Action réservée aux administrateurs.', name: 'Donne un nom à la marque.' };

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { ok, e } = await searchParams;
  const active = await getActiveBrand(s.workspaceId);

  const rows = db ? await db.select().from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId)) : [];
  const ids = rows.map((b) => b.id);

  // Comptages (personas, scénarios, comptes pub) en une passe par table.
  const countMap = (arr: Array<{ brandId: string; n: number }>) => Object.fromEntries(arr.map((x) => [x.brandId, Number(x.n)]));
  let personaC: Record<string, number> = {}, scenC: Record<string, number> = {}, adC: Record<string, number> = {};
  if (db && ids.length) {
    const [p, sc, ad] = await Promise.all([
      db.select({ brandId: schema.personas.brandId, n: sql<number>`count(*)` }).from(schema.personas).where(inArray(schema.personas.brandId, ids)).groupBy(schema.personas.brandId),
      db.select({ brandId: schema.scenarios.brandId, n: sql<number>`count(*)` }).from(schema.scenarios).where(inArray(schema.scenarios.brandId, ids)).groupBy(schema.scenarios.brandId),
      db.select({ brandId: schema.adAccounts.brandId, n: sql<number>`count(*)` }).from(schema.adAccounts).where(inArray(schema.adAccounts.brandId, ids)).groupBy(schema.adAccounts.brandId),
    ]);
    personaC = countMap(p); scenC = countMap(sc); adC = countMap(ad);
  }

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Marques</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
        <span style={{ flex: 1 }} />
        <Link href="/brands/new" style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>+ Créer une marque</Link>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Chaque marque a son propre espace : sélectionne-la en haut du menu pour filtrer sauvegardes, suivis et analyses.
      </p>
      <PageInfo title="gérer tes marques">
        Crée une marque via le parcours guidé (profil, charte, audience, concurrents) : elle devient <b>active</b>
        automatiquement. Le sélecteur en haut à gauche bascule d'une marque à l'autre. Ce que tu sauvegardes ou suis
        dans l'Inspo est rattaché à la marque active.
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 12px' }}>Tes marques ({rows.length})</h2>

      {rows.length === 0 && (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '30px 22px', textAlign: 'center' }}>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '0 0 14px' }}>Aucune marque pour l'instant. Crée la première en quelques minutes.</p>
          <Link href="/brands/new" style={{ padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>+ Créer une marque</Link>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((b) => (
          <div key={b.id} style={{ border: `1px solid ${active?.id === b.id ? 'var(--line-2)' : 'var(--line)'}`, borderRadius: 16, background: 'var(--surface)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{initials(b.name)}</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{b.name}</span>
                  {active?.id === b.id && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)' }}>● active</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                  {[b.category || b.industry, b.url].filter(Boolean).join(' · ') || 'Profil à compléter'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link href={`/brands/${b.id}`} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}>Voir détails</Link>
                <form action={deleteBrandAction} style={{ margin: 0 }}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,77,109,.3)', background: 'transparent', color: '#ff9db0', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Supprimer</button>
                </form>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
              <Stat n={adC[b.id] ?? 0} label="comptes pub" />
              <Stat n={scenC[b.id] ?? 0} label="scénarios" />
              <Stat n={personaC[b.id] ?? 0} label="personas" />
              <Stat n={(b.competitors ?? []).length} label="concurrents" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 12.5, color: 'var(--muted)' }}>
      <b style={{ color: 'var(--ink)', fontSize: 14 }}>{n}</b>{label}
    </span>
  );
}
