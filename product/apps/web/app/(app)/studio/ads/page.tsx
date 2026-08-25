import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { falConfigured } from '@tiktrends/integrations';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { listBrandAds, listSavedAdRefs } from '../../../actions/ads';
import { ensureBrandEnriched } from '../../../../lib/enrich';
import { AdsStudio } from './AdsStudio';
import { PageInfo } from '../../../../components/PageInfo';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'image')!;

export default async function AdsStudioPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Pubs IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0' }}>
            {why === 'plan' ? 'Les Pubs IA sont disponibles à partir du plan Core.' : "Ton rôle ne permet pas d'y accéder."}
          </p>
        </div>
      </main>
    );
  }

  const brand = await getActiveBrand(s.workspaceId);
  // Enrichissement automatique (DA, produits, photos) · sans bouton, avant l'affichage.
  if (brand) await ensureBrandEnriched(brand.id);
  const [ads, savedRefs] = await Promise.all([listBrandAds(), listSavedAdRefs()]);
  let products: Array<{ id: string; name: string; hasImage: boolean }> = [];
  let personas: Array<{ id: string; name: string }> = [];
  if (db && brand) {
    const [prows, perows] = await Promise.all([
      db.select({ id: schema.products.id, name: schema.products.name, imageUrl: schema.products.imageUrl }).from(schema.products).where(eq(schema.products.brandId, brand.id)),
      db.select({ id: schema.personas.id, name: schema.personas.name }).from(schema.personas).where(eq(schema.personas.brandId, brand.id)),
    ]);
    products = prows.map((p) => ({ id: p.id, name: p.name, hasImage: !!p.imageUrl }));
    personas = perows;
  }

  return (
    <main style={wrap}>
      <Link href="/studio" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ Studio IA</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={h1}>Pubs IA</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>CONCEPT · SCÈNE · DESIGN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 16 }}>
        Des publicités complètes, prêtes à poster, rattachées à {brand ? <b>{brand.name}</b> : 'ta marque active'}.
      </p>
      <PageInfo title="générer des pubs">
        Deux logiques, comme Atria. <b>Depuis la marque</b> : choisis produit, persona, objectif et gabarits, l'IA
        écrit le concept, génère la scène avec ton produit et compose la pub finale (texte, bouton, logo).
        <b> Cloner une pub gagnante</b> : choisis une pub de ta <b>Veille</b> (ou importe une capture), l'IA en reprend
        l'angle + la structure et te sort plusieurs variations sur ta marque et ton produit. 4 crédits par pub.
      </PageInfo>

      <AdsStudio ready={falConfigured()} aiReady={anthropicConfigured()} brandName={brand?.name ?? null} initial={ads} products={products} personas={personas} savedRefs={savedRefs} />
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
