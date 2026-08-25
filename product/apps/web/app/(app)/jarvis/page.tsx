import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { JarvisRules } from './JarvisRules';

export const dynamic = 'force-dynamic';

const LAYERS: Array<{ icon: string; title: string; desc: string }> = [
  { icon: '🎯', title: 'Ancrage marque', desc: 'DA (couleurs, logo, polices), produit réel et USP injectés dans chaque prompt.' },
  { icon: '✍️', title: 'Copywriting direct-response', desc: 'Accroches qui claquent, spécificité, déclencheurs émotionnels. Anti-slogans plats.' },
  { icon: '🔎', title: 'Intelligence concurrentielle', desc: 'Reprend les mécaniques des pubs qui fonctionnent (concurrents + veille sauvegardée).' },
  { icon: '📐', title: 'Contraintes de rendu', desc: 'Réalisme, proportions réelles, packaging fidèle, aucun texte parasite dans la scène.' },
  { icon: '🧩', title: 'Composition maison', desc: 'Gabarits, couleurs, logo et variantes de mise en page posés par-dessus l’image.' },
  { icon: '📜', title: 'Tes règles', desc: 'Tes consignes maison imposées en priorité absolue (ci-dessous).' },
];

const ENGINES: Array<{ tag: string; name: string; role: string }> = [
  { tag: 'IMAGE', name: 'Nano Banana 2 (Gemini)', role: 'Mise en scène produit fidèle' },
  { tag: 'VIDÉO', name: 'Kling 2.5 turbo pro', role: 'Animation des visuels' },
  { tag: 'COPY', name: 'Claude', role: 'Concepts, angles, copywriting' },
];

export default async function JarvisPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const brand = await getActiveBrand(s.workspaceId);
  let rules = '';
  if (db && brand) {
    const [row] = await db.select({ creativeRules: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    rules = row?.creativeRules ?? '';
  }

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1040, margin: '0 auto' }}>
      {/* Héro */}
      <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid var(--line-2)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(230,0,126,.16), rgba(120,90,255,.10) 60%, var(--surface))', padding: '26px 28px', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🧠</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Jarvis</h1>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>IA CRÉATIVE MAISON</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 620, lineHeight: 1.5 }}>
              Ta couche d’intelligence par-dessus les modèles (Nano Banana, Kling, Claude). Les modèles sont le moteur ; Jarvis, c’est ta marque, tes règles et ton contrôle qualité qui transforment un rendu générique en créa à toi.
            </p>
          </div>
        </div>
      </div>

      {/* Ce que Jarvis applique */}
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Ce que Jarvis applique, à chaque génération</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 26 }}>
        {LAYERS.map((l) => (
          <div key={l.title} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
            <div style={{ fontSize: 20 }}>{l.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginTop: 6 }}>{l.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.5 }}>{l.desc}</div>
          </div>
        ))}
      </div>

      {/* Éditeur de règles (le cœur) */}
      <JarvisRules brandName={brand?.name ?? null} initial={rules} />

      {/* Moteurs orchestrés */}
      <h2 style={{ margin: '28px 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Moteurs orchestrés</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {ENGINES.map((e) => (
          <div key={e.name} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: 'var(--accent-strong)', border: '1px solid var(--line-2)' }}>{e.tag}</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 8 }}>{e.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{e.role}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>Les moteurs sont interchangeables (surchargeables par configuration) : Jarvis reste ta couche, quel que soit le fournisseur.</p>
    </main>
  );
}
