import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { falConfigured } from '@tiktrends/integrations';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { listBrandImages } from '../../../actions/image';
import { ImageStudio } from './ImageStudio';
import { PageInfo } from '../../../../components/PageInfo';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'image')!;

export default async function ImageStudioPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Image IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0' }}>
            {why === 'plan' ? "L'Image IA est disponible à partir du plan Core." : "Ton rôle ne permet pas d'y accéder."}
          </p>
        </div>
      </main>
    );
  }

  const [brand, images] = await Promise.all([getActiveBrand(s.workspaceId), listBrandImages()]);
  let products: Array<{ id: string; name: string; hasImage: boolean }> = [];
  let colors: string[] = [];
  if (db && brand) {
    const rows = await db.select({ id: schema.products.id, name: schema.products.name, imageUrl: schema.products.imageUrl }).from(schema.products).where(eq(schema.products.brandId, brand.id));
    products = rows.map((p) => ({ id: p.id, name: p.name, hasImage: !!p.imageUrl }));
    const [row] = await db.select({ colors: schema.brands.colors }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
    colors = row?.colors ?? [];
  }

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={h1}>Image IA</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FAL · FLUX / IDEOGRAM</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 16 }}>
        Génère des visuels pub à partir d'un texte ou de ton image produit. Rattachés à {brand ? <b>{brand.name}</b> : 'ta marque active'}.
      </p>
      <PageInfo title="générer un visuel">
        <b>Mise en scène produit</b> (recommandé) : importe la photo de ton produit, l'IA garde ton vrai
        packaging et ne recompose que le décor (Kontext). Enregistre la photo une fois sur le produit, elle sera
        réutilisée. Le mode <b>Texte → Image</b> reste dispo pour des visuels d'ambiance sans produit. Coche
        <b>Texte lisible</b> pour une accroche écrite propre (Ideogram), et <b>Optimiser le prompt</b> pour que
        Claude rédige un prompt de qualité pub. 4 crédits par image.
      </PageInfo>

      <ImageStudio ready={falConfigured()} aiReady={anthropicConfigured()} brandName={brand?.name ?? null} initial={images} products={products} brandColors={colors} />
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
