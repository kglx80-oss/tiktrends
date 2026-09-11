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
import { Icon } from '../../../../components/Icon';
import { essaiSuivantAction } from '../../../actions/adsmap-attribution';
import { ContexteCreation } from '../../../../components/ContexteCreation';
import { effectiveAccess } from '../../../../lib/access';
import { spendStatus } from '../../../../lib/spend-guard';
import { bilanCopieAction } from '../../../actions/adsmap-attribution';
import { conseilMoteur, conseilMode } from '@tiktrends/core';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'image')!;

export default async function AdsStudioPage({ searchParams }: { searchParams: Promise<{ mode?: string; angle?: string; ref?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const sp = await searchParams;
  // La deep-link de veille · `ref` désigne une pub sauvegardée à cloner. Sa
  // présence force le mode clone, sinon on aurait armé une référence sur un
  // écran qui ne la lit pas · un réglage sans effet, pire qu'absent.
  const initialRef = (sp.ref ?? '').slice(0, 64);
  const initialMode = sp.mode === 'clone' || initialRef ? 'clone' : 'brand';
  const initialAngle = (sp.angle ?? '').slice(0, 300);
  // Trois lectures INDÉPENDANTES, menées en parallèle · les enchaîner ajoutait
  // deux allers-retours à chaque ouverture du studio, pour rien.
  //
  // - `suggestion` · ce que l'outil conseille de tester, déduit de ce qui est
  //   DÉJÀ mesuré (aucun modèle appelé). Un échec laisse le sélecteur sans conseil.
  // - `budget` · le plafond de dépense, lu AVANT de proposer de générer · il est
  //   dur, et le découvrir une fois le lot refusé, c'est « aucun résultat » sans
  //   explication. Le studio doit pouvoir le dire pendant qu'on choisit le nombre.
  // - `bilanCopie` · ce que les relectures de la marque conseillent · lecture
  //   pure, rien de facturé. Un échec laisse le catalogue décider, comme avant.
  //
  // Chacune tolère son PROPRE échec · une lecture qui rate n'emporte pas les deux
  // autres, exactement comme quand elles étaient séparées.
  const [suggestion, budget, bilanCopie] = await Promise.all([
    essaiSuivantAction().then((r) => r.suggestion ?? null).catch(() => null),
    spendStatus().catch(() => null),
    bilanCopieAction().then((r) => r.bilan).catch(() => undefined),
  ]);
  const conseilMoteurs = conseilMoteur(bilanCopie);
  // Le MODE par défaut suit la mesure aussi · une marque dont l'entière échoue
  // mesurément part en composée. Sans mesure suffisante, l'entière reste le
  // défaut (le mode que le lot de contrôle a montré viable). Les compteurs se
  // reconstruisent du taux et du dénominateur (taux = compte / n).
  const conseilModes = bilanCopie
    ? conseilMode({
        relues: bilanCopie.relues,
        accroche: Math.round((bilanCopie.tauxReecriture ?? 0) * bilanCopie.relues),
        avecReference: bilanCopie.avecReference,
        produitsInfideles: Math.round((bilanCopie.tauxProduit ?? 0) * bilanCopie.avecReference),
        avecTexte: bilanCopie.avecTexte,
        illisibles: Math.round((bilanCopie.tauxIllisible ?? 0) * bilanCopie.avecTexte),
      })
    : { defaut: 'entiere' as const, mesure: false, motif: '' };
  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Pubs IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--muted)' }}><Icon name="lock" size={34} /></div>
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
  const [ads, savedRefs, allAssets] = await Promise.all([listBrandAds(), listSavedAdRefs(), listAssets({ kind: 'image', limit: 24 })]);
  const assetChoices = allAssets.map((a) => ({ id: a.id, name: a.name, url: a.url, thumbUrl: a.thumbUrl }));
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={h1}>Pubs IA</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>CONCEPT · SCÈNE · DESIGN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Des publicités complètes, prêtes à poster, rattachées à {brand ? <b>{brand.name}</b> : 'ta marque active'}.
      </p>

      {/* Le contexte tient sur UNE ligne · marque, ce que la catégorie a appris,
           l'état de Jarvis (admin). Ce qui explique le chemin, l'assistant le
           montre en le parcourant ; ce qui s'enrichit, la Veille et Jarvis le
           font. Ici, on informe et on crée, on ne règle rien d'annexe. */}
      {brand && <ContexteCreation brandName={brand.name} edenCount={edenCount} isAdmin={roleAtLeast(s.role, 'admin')} />}

      <AdsStudio ready={falConfigured()} aiReady={anthropicConfigured()} brandName={brand?.name ?? null} initial={ads} products={products} personas={personas} savedRefs={savedRefs} assets={assetChoices} initialMode={initialMode} initialAngle={initialAngle} initialRef={initialRef} adsmap={adsmapOpen} suggestion={suggestion} budget={budget && { resume: budget.summary, bloque: budget.blocked }} conseilMoteurs={conseilMoteurs} conseilModes={conseilModes} />
    </main>
  );
}

const wrap = { padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 1080, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
