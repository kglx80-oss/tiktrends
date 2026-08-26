import { eq, and, or, inArray, count } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDashboard } from '../../../lib/pipeline';
import { PageInfo } from '../../../components/PageInfo';
import { getSession } from '../../../lib/auth';
import { getActiveBrand } from '../../../lib/brands';
import { roleAtLeast } from '../../../lib/rbac';
import { anthropicConfigured } from '../../../lib/ai-status';
import { AssistantHome } from '../../../components/AssistantHome';
import { OnboardingChecklist, type OnboardStep } from '../../../components/OnboardingChecklist';

export const dynamic = 'force-dynamic';

const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, ' ');
const gcol: Record<string, string> = { A: '#18cc8c', B: '#7aa2ff', C: '#f5a623', D: '#ff4d6d' };

export default async function Dashboard() {
  const rows = buildDashboard();
  const s = await getSession();
  let credits = 0;
  let brand: { id: string; name: string } | null = null;
  if (s) {
    if (db) {
      const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
      credits = w?.c ?? 0;
    }
    const ab = await getActiveBrand(s.workspaceId);
    if (ab) brand = { id: ab.id, name: ab.name };
  }
  const firstName = ((s?.user.name || s?.user.email || 'toi').trim().split(/\s+/)[0]) || 'toi';

  // Onboarding : étapes de démarrage (ADMIN+ qui configure l'espace), calculées sur données réelles.
  let steps: OnboardStep[] = [];
  if (s && db && roleAtLeast(s.role, 'admin')) {
    const brandRows = await db.select({ id: schema.brands.id, sh: schema.brands.shopifyToken, mt: schema.brands.metaToken })
      .from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId));
    const brandIds = brandRows.map((b) => b.id);
    const hasConnection = brandRows.some((b) => b.sh || b.mt);
    const [ac] = await db.select({ n: count() }).from(schema.assets).where(eq(schema.assets.workspaceId, s.workspaceId));
    const assetCount = ac?.n ?? 0;
    let genCount = 0;
    if (brandIds.length) {
      const [gc] = await db.select({ n: count() }).from(schema.generations).where(and(inArray(schema.generations.brandId, brandIds), or(eq(schema.generations.kind, 'image'), eq(schema.generations.kind, 'video'))!));
      genCount = gc?.n ?? 0;
    }
    steps = [
      { key: 'brand', label: 'Créer ta première marque', desc: 'DA, produits, ton · le socle de toutes les générations.', href: '/brands/new', done: brandRows.length > 0 },
      { key: 'connect', label: 'Connecter une source', desc: 'Shopify ou Meta Ads pour faire remonter tes vraies données.', href: '/connections', done: hasConnection },
      { key: 'assets', label: 'Ajouter des assets', desc: 'Téléverse ou branche ton Drive · l’IA s’en sert automatiquement.', href: '/assets', done: assetCount > 0 },
      { key: 'generate', label: 'Générer ta première créa', desc: 'Studio Pubs / Image · lance ta première génération IA.', href: '/studio/ads', done: genCount > 0 },
    ];
  }

  return (
    <main style={{ minHeight: '100vh', padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' }}>
      <AssistantHome firstName={firstName} credits={credits} brandName={brand?.name ?? null} brandId={brand?.id ?? null} aiReady={anthropicConfigured()} />

      {steps.length > 0 && <OnboardingChecklist steps={steps} firstName={firstName} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Aperçu créas</h2>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>données d'exemple</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 18 }}>
        Pipeline réel : normalisation → dédup créas → agrégation → Radar. Branche un compte pour des données live.
      </p>

      <PageInfo title="vue d'ensemble des créas">
        Le Dashboard liste tes créas triées par dépense, avec leur <b>note Radar</b> et leur <b>bucket</b>
        (winner, à itérer, à couper…). C'est ta porte d'entrée : de là, ouvre le <b>Radar</b> pour le détail
        par axe ou l'<b>Analytics</b> pour les KPI agrégés.
      </PageInfo>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <a href="/api/oauth/tiktok" style={btn}>Connecter TikTok Ads</a>
        <a href="/api/oauth/meta" style={{ ...btn, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink)' }}>Connecter Meta Ads</a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
        {rows.map((r) => (
          <div key={r.platform + r.fingerprint} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{r.platform}</span>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: gcol[r.grade], color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{r.grade}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '8px 0 10px', color: 'var(--ink)' }}>{r.title}</div>
            <Row k="Dépense" v={eur(r.spend)} />
            <Row k="Impressions" v={r.impressions.toLocaleString('fr-FR')} />
            <Row k="CTR" v={(r.ctr * 100).toFixed(2) + '%'} />
            <Row k="ROAS" v={r.roas.toFixed(2) + '×'} />
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{r.bucket}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: 'var(--ink-2)' }}>
      <span>{k}</span><b style={{ fontFamily: 'var(--font-mono)' }}>{v}</b>
    </div>
  );
}
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 16, boxShadow: 'var(--sh-card)' };
const btn: React.CSSProperties = { padding: '10px 16px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 13 };
