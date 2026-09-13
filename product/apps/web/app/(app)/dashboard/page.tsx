import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDashboard } from '../../../lib/pipeline';
import { PageInfo } from '../../../components/PageInfo';
import { getSession } from '../../../lib/auth';
import { getActiveBrand } from '../../../lib/brands';
import { roleAtLeast } from '../../../lib/rbac';
import { anthropicConfigured } from '../../../lib/ai-status';
import { AssistantHome } from '../../../components/AssistantHome';
import { JourneyPanel } from '../../../components/JourneyPanel';
import { Bandeau } from '../../../components/Bandeau';
import { BarreValeur } from '../../../components/BarreValeur';
import { partDeMax } from '@tiktrends/core';
import { onboardingState } from '../../../lib/onboarding-state';

export const dynamic = 'force-dynamic';

const eur = (n: number) => '€' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, ' ');
const gcol: Record<string, string> = { A: '#18cc8c', B: '#7aa2ff', C: '#f5a623', D: '#ff4d6d' };

export default async function Dashboard() {
  const rows = buildDashboard();
  // Le maximum de dépense du lot · sert à proportionner la barre de chaque carte,
  // pour que le tri « par dépense » se VOIE au lieu de se lire ligne à ligne.
  const maxDepense = Math.max(0, ...rows.map((r) => r.spend));
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

  // Le chemin de démarrage · calculé sur la donnée réelle, jamais sur des cases
  // cochées à la main. Ouvert à tous les rôles qui peuvent agir : un membre qui
  // ne voit pas où en est l'espace ne peut pas aider à l'avancer.
  const parcours = s && roleAtLeast(s.role, 'member') ? await onboardingState(s.workspaceId, roleAtLeast(s.role, 'admin')) : null;

  return (
    <main style={{ minHeight: '100vh', padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 1180, margin: '0 auto' }}>
      <AssistantHome firstName={firstName} credits={credits} brandName={brand?.name ?? null} brandId={brand?.id ?? null} aiReady={anthropicConfigured()} />

      {parcours && <JourneyPanel j={parcours.journey} relance={parcours.relance} firstName={firstName} />}

      <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Aperçu créas</h2>
      <Bandeau ton="demo" titre="Données d'exemple" sortie={{ href: '/connections', label: 'Brancher un compte' }}>
        Pipeline réel : normalisation → dédup créas → agrégation → Radar. Ces cartes sont un échantillon tant qu'aucun compte n'est branché.
      </Bandeau>

      <PageInfo title="vue d'ensemble des créas">
        Le Dashboard liste tes créas triées par dépense, avec leur <b>note Radar</b> et leur <b>bucket</b>
        (winner, à itérer, à couper…). C'est ta porte d'entrée : de là, ouvre le <b>Radar</b> pour le détail
        par axe ou l'<b>Analytics</b> pour les KPI agrégés.
      </PageInfo>
      {/* Un SEUL chemin pour brancher un compte · le bandeau ci-dessus mène à
          /connections, foyer unique de la connexion (cartes, gardes OAuth, TikTok
          annoncé honnêtement « à venir »). Les deux boutons directs qui vivaient
          ici doublonnaient ce chemin, et « Connecter TikTok » lançait un flux
          incomplet · retirés pour un fil clair. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
        {rows.map((r) => (
          <div key={r.platform + r.fingerprint} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{r.platform}</span>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: gcol[r.grade], color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{r.grade}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '8px 0 10px', color: 'var(--ink)' }}>{r.title}</div>
            <Row k="Dépense" v={eur(r.spend)} />
            <div style={{ margin: '2px 0 8px' }}>
              <BarreValeur part={partDeMax(r.spend, maxDepense)} couleur={gcol[r.grade] ?? 'var(--grad-accent)'} hauteur={5} />
            </div>
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
