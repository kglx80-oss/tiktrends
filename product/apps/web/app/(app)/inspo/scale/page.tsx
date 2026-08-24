import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { ttSearchAds, SAMPLE_INSPO_ADS, type InspoAd } from '@tiktrends/integrations';
import { classifyAngle, capPerBrand, median, type AngleKey } from '@tiktrends/core';
import { SwipeFile, type SwipeItem, type SwipeStats } from './SwipeFile';
import { PageInfo } from '../../../../components/PageInfo';

export const dynamic = 'force-dynamic';
const feature = FEATURES.find((f) => f.key === 'scale')!;

const PRESETS = [
  { q: 'complément alimentaire', label: 'Compléments' },
  { q: 'skincare', label: 'Skincare' },
  { q: 'bijoux', label: 'Bijoux' },
  { q: 'maison déco', label: 'Maison & déco' },
  { q: 'animaux', label: 'Animaux' },
  { q: 'café', label: 'Café' },
];

const eur = (n: number) => (n >= 1000 ? Math.round(n / 1000).toLocaleString('fr-FR') + ' k€' : Math.round(n) + ' €');
const growthOf = (a: InspoAd) => a.reachDelta7d ?? a.reach ?? 0;

export default async function ScalePage({ searchParams }: { searchParams: Promise<{ q?: string; country?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Ce qui scale</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0' }}>
            {why === 'plan' ? 'La Veille « Ce qui scale » est disponible à partir du plan Core.' : "Ton rôle ne permet pas d'y accéder."}
          </p>
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const country = sp.country || 'FR';
  const apiKey = process.env.TRENDTRACK_API_KEY;

  let ads: InspoAd[] = [];
  let sample = false;
  let error = '';
  if (!apiKey) { ads = SAMPLE_INSPO_ADS; sample = true; }
  else if (q) {
    try {
      const r = await ttSearchAds({ apiKey }, { search: q, searchIn: 'ad_copy', status: 'all', sortBy: 'reachDelta7d', country, limit: 100, offset: 0 });
      ads = r.ads;
    } catch (e) { error = (e as Error).message; }
  }

  // Curation : plafond 3 créas par marque (on garde les plus fortes en croissance).
  const curated = capPerBrand(ads, (a) => a.advertiserName || a.id, growthOf, 3);

  // Enrichissement (angle) + état sauvegardé/suivi.
  let savedSet = new Set<string>(); let followSet = new Set<string>();
  if (db && !sample) {
    const brand = await getActiveBrand(s.workspaceId);
    const savedWhere = brand ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, brand.id)) : eq(schema.savedAds.workspaceId, s.workspaceId);
    const followWhere = brand ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, brand.id)) : eq(schema.followedBrands.workspaceId, s.workspaceId);
    const [sv, fl] = await Promise.all([
      db.select({ p: schema.savedAds.platform, e: schema.savedAds.externalId }).from(schema.savedAds).where(savedWhere),
      db.select({ p: schema.followedBrands.platform, n: schema.followedBrands.name }).from(schema.followedBrands).where(followWhere),
    ]);
    savedSet = new Set(sv.map((r) => r.p + ':' + r.e));
    followSet = new Set(fl.map((r) => r.p + ':' + r.n));
  }

  const items: SwipeItem[] = curated.map((ad) => ({
    ad, angle: classifyAngle(ad.body), saved: savedSet.has(ad.platform + ':' + ad.id),
    following: followSet.has(ad.platform + ':' + (ad.advertiserName || '')),
  }));

  const advertisers = Array.from(new Set(curated.map((a) => a.advertiserName).filter(Boolean))) as string[];
  const stats: SwipeStats = {
    total: curated.length,
    videos: curated.filter((a) => (a.mediaType || '').toLowerCase().includes('vid')).length,
    advertisers: advertisers.length,
    spendCumul: eur(curated.reduce((n, a) => n + (a.estimatedSpend ?? 0), 0)),
    medianDuration: median(curated.map((a) => a.daysRunning ?? 0)),
    medianGrowth: median(curated.map((a) => growthOf(a))),
  };

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/inspo" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Veille</Link>
        <span style={{ color: 'var(--muted)' }}>/</span>
        <h1 style={h1}>Ce qui scale</h1>
        {q && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {country} · {q}</span>}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 8, marginBottom: 12, maxWidth: 720 }}>
        Le swipe file des créas qui <b>montent</b> : trié par <b>croissance de reach</b> (pas le reach cumulé),
        plafonné à <b>3 créas par marque</b>, avec les <b>angles classés automatiquement</b>. Repère la tendance avant qu'elle s'épuise.
      </p>
      <PageInfo title="pourquoi c'est différent d'un simple export Meta">
        1) On trie par <b>croissance</b> : une pub qui tourne depuis 800 j à 0 % a marché, elle ne marche plus.
        2) On <b>plafonne à 3/marque</b> : sinon un gros annonceur monopolise le fichier.
        3) Les <b>angles se classent seuls</b> (témoignage, preuve sociale, réponse objection…) pour voir ce qui domine
        et ce que personne n'a encore essayé.
      </PageInfo>

      {/* Choix de niche */}
      <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0 18px' }}>
        <input name="q" defaultValue={q} placeholder="Une niche (ex : compléments, skincare, café)…" style={{ ...inputBase, flex: '1 1 260px' }} />
        <input type="hidden" name="country" value={country} />
        <button type="submit" style={searchBtn}>Analyser la niche</button>
      </form>
      {!q && !sample && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>Exemples :</span>
          {PRESETS.map((p) => (
            <Link key={p.q} href={`/inspo/scale?q=${encodeURIComponent(p.q)}&country=FR`} style={preset}>{p.label}</Link>
          ))}
        </div>
      )}

      {sample && <div style={banner('rgba(245,166,35,.12)', 'rgba(245,166,35,.4)', '#f5c877')}>Mode démonstration (échantillon). La source de données n'est pas configurée sur le serveur.</div>}
      {error && <div style={banner('rgba(255,77,109,.10)', 'rgba(255,77,109,.4)', '#ff9db0')}>Erreur de la source : {error}</div>}

      {(q || sample) && curated.length === 0 && !error && (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Aucune créa trouvée pour cette niche. Essaie un autre mot-clé.</p>
      )}

      {curated.length > 0 && <SwipeFile items={items} stats={stats} advertisers={advertisers} niche={q || 'échantillon'} country={country} />}
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
const inputBase = { padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;
const searchBtn = { padding: '11px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' } as const;
const preset = { padding: '7px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' } as const;
const banner = (bg: string, border: string, color: string) => ({ padding: '10px 14px', borderRadius: 12, background: bg, border: `1px solid ${border}`, color, fontSize: 13, marginBottom: 18 } as const);
