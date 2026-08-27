import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason, roleAtLeast } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { falConfigured } from '@tiktrends/integrations';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { listBrandAds, listSavedAdRefs } from '../../../actions/ads';
import { listAssets } from '../../../actions/assets';
import { ensureBrandEnriched } from '../../../../lib/enrich';
import { AdsStudio } from './AdsStudio';
import { PageInfo } from '../../../../components/PageInfo';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'image')!;

export default async function AdsStudioPage({ searchParams }: { searchParams: Promise<{ mode?: string; angle?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const sp = await searchParams;
  const initialMode = sp.mode === 'clone' ? 'clone' : 'brand';
  const initialAngle = (sp.angle ?? '').slice(0, 300);
  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
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
  const [ads, savedRefs, allAssets] = await Promise.all([listBrandAds(), listSavedAdRefs(), listAssets({ kind: 'image' })]);
  const assetChoices = allAssets.slice(0, 24).map((a) => ({ id: a.id, name: a.name, url: a.url }));
  let products: Array<{ id: string; name: string; hasImage: boolean }> = [];
  let personas: Array<{ id: string; name: string }> = [];
  let edenRules = '';
  if (db && brand) {
    const [prows, perows, brow] = await Promise.all([
      db.select({ id: schema.products.id, name: schema.products.name, imageUrl: schema.products.imageUrl }).from(schema.products).where(eq(schema.products.brandId, brand.id)),
      db.select({ id: schema.personas.id, name: schema.personas.name }).from(schema.personas).where(eq(schema.personas.brandId, brand.id)),
      db.select({ r: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1),
    ]);
    products = prows.map((p) => ({ id: p.id, name: p.name, hasImage: !!p.imageUrl }));
    personas = perows;
    edenRules = (brow[0]?.r ?? '').trim();
  }
  // Nombre de « règles » (lignes non vides) pour l'indicateur EDEN.
  const edenCount = edenRules ? edenRules.split('\n').map((l) => l.trim()).filter(Boolean).length : 0;
  // Passerelle Studio → ADSMAP : proposée seulement si la carte est ouverte et
  // qu'une marque active peut la recevoir.
  const adsmapOpen = !!brand && canAccess(effectiveAccess(s), FEATURES.find((f) => f.key === 'adsmap')!);

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

      {/* Indicateur Jarvis : visible seulement en ADMIN+ (couche secrète, jamais exposée aux membres/clients). */}
      {brand && roleAtLeast(s.role, 'admin') && (
        <Link href="/jarvis" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', marginBottom: 16, padding: '11px 15px', borderRadius: 14, border: `1px solid ${edenCount ? 'rgba(120,220,150,.4)' : 'var(--line-2)'}`, background: edenCount ? 'linear-gradient(180deg, rgba(120,220,150,.08), var(--surface))' : 'var(--surface)' }}>
          <span style={{ fontSize: 17 }}>🧠</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
              {edenCount ? `Jarvis actif · ${edenCount} règle${edenCount > 1 ? 's' : ''} maison appliquée${edenCount > 1 ? 's' : ''}` : 'Jarvis · aucune règle maison définie'}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
              {edenCount ? 'Tes consignes sont imposées en priorité sur chaque pub générée.' : 'Pose tes consignes maison pour cadrer le style, le ton et les interdits.'}
            </span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: edenCount ? '#7ee8bf' : 'var(--accent-strong)', whiteSpace: 'nowrap' }}>{edenCount ? 'Gérer ›' : 'Configurer ›'}</span>
        </Link>
      )}

      <AdsStudio ready={falConfigured()} aiReady={anthropicConfigured()} brandName={brand?.name ?? null} initial={ads} products={products} personas={personas} savedRefs={savedRefs} assets={assetChoices} initialMode={initialMode} initialAngle={initialAngle} adsmap={adsmapOpen} />
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
