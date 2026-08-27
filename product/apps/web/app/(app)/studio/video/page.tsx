import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { higgsfieldConfigured, falConfigured } from '@tiktrends/integrations';
import { listBrandVideos, listAnimatableAssets } from '../../../actions/video';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { ensureBrandEnriched } from '../../../../lib/enrich';
import { VideoStudioFull } from './VideoStudioFull';
import { PageInfo } from '../../../../components/PageInfo';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'video')!;

export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Vidéo IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0' }}>
            {why === 'plan' ? "La Vidéo IA est disponible à partir du plan Core." : "Ton rôle ne permet pas d'accéder à la Vidéo IA."}
          </p>
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const brand = await getActiveBrand(s.workspaceId);
  if (brand) await ensureBrandEnriched(brand.id);
  const [videos, assets] = await Promise.all([listBrandVideos(), listAnimatableAssets()]);

  return (
    <main style={wrap}>
      <Link href="/studio" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ Studio IA</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={h1}>Vidéo IA</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>KLING 2.5 · FAL</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 16 }}>
        Génère des vidéos verticales prêtes pour TikTok, à partir d'un texte ou d'une image. Les vidéos sont rattachées à {brand ? <b>{brand.name}</b> : 'ta marque active'}.
      </p>
      <PageInfo title="générer une vidéo">
        Stratégie cohérente avec Pubs IA : <b>Image → Vidéo</b> anime directement <b>ton produit ou une pub déjà générée</b>
        (mouvement de caméra, micro-animations), pendant que <b>Texte → Vidéo</b> part d'une description. Le bouton
        <b> Suggérer un mouvement</b> propose une consigne ancrée sur ta marque. Format 9:16 pour TikTok, rendu ~1 à 3 min,
        20 crédits par vidéo.
      </PageInfo>

      <VideoStudioFull ready={falConfigured() || higgsfieldConfigured()} aiReady={anthropicConfigured()} brandName={brand?.name ?? null} initialVideos={videos} initialPrompt={sp.prompt} assets={assets} />
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
