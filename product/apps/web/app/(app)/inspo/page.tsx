import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { ttSearchAds, ttSearchTikTok, ttSearchGoogle, SAMPLE_INSPO_ADS, type InspoAd, type AdSort, type AdPlatform } from '@tiktrends/integrations';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'inspo')!;
const CHIPS = ['skincare', 'fitness', 'mode', 'maison', 'nutrition', 'beauté', 'gadget'];
const LIMIT = 24;

const SORTS: Array<{ v: AdSort; label: string }> = [
  { v: 'reachDelta7d', label: 'Scaling 7 j' },
  { v: 'longestRunning', label: 'Plus anciennes' },
  { v: 'reach', label: 'Reach total' },
  { v: 'newest', label: 'Plus récentes' },
  { v: 'mostDuplicates', label: 'Plus dupliquées' },
];
const COUNTRIES = ['FR', 'BE', 'CH', 'DE', 'ES', 'IT', 'GB', 'NL', 'PT', 'US', 'CA'];
const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien'], ['nl', 'Néerlandais']];
const REACHES = [['100000', '100 k+'], ['500000', '500 k+'], ['1000000', '1 M+']];
const DAYS = [['7', '7 j+'], ['30', '30 j+'], ['90', '90 j+']];

const compact = (n?: number) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return String(n);
};
const eur = (n?: number) => (n == null ? '—' : '€' + compact(n));

type SP = {
  q?: string; p?: string; searchIn?: string; media?: string; sort?: string; status?: string;
  country?: string; lang?: string; minReach?: string; minDays?: string; page?: string;
};

const PLATFORMS: [AdPlatform, string][] = [['meta', 'Meta'], ['tiktok', 'TikTok'], ['google', 'Google']];
const platformLabel: Record<AdPlatform, string> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google' };

function buildQS(sp: SP, over: Partial<SP>): string {
  const merged = { ...sp, ...over };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
  return '/inspo?' + p.toString();
}

export default async function InspoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  const access = { role: s.role, plan: s.plan };
  if (!canAccess(access, feature)) {
    const why = denyReason(access, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Inspo</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>
            {why === 'plan' ? "Fonctionnalité incluse dès l'abonnement Core" : 'Accès réservé'}
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {why === 'plan'
              ? "L'Inspo (bibliothèque concurrentielle Trendtrack) est disponible à partir du plan Core. Passe ton espace en Core dans Réglages → Abonnement."
              : "Ton rôle ne permet pas d'accéder à l'Inspo."}
          </p>
          {why === 'plan' && s.role === 'owner' && (
            <a href="/settings" style={upgradeBtn}>Gérer l'abonnement →</a>
          )}
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const query = (sp.q || '').trim();
  const platform: AdPlatform = sp.p === 'tiktok' || sp.p === 'google' ? sp.p : 'meta';
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const apiKey = process.env.TRENDTRACK_API_KEY;

  let ads: InspoAd[] = [];
  let total = 0;
  let error = '';
  let sample = false;

  if (!apiKey) {
    ads = SAMPLE_INSPO_ADS;
    sample = true;
  } else if (query) {
    try {
      const media = sp.media === 'video' || sp.media === 'image' ? sp.media : undefined;
      let r;
      if (platform === 'tiktok') {
        r = await ttSearchTikTok({ apiKey }, { search: query, limit: LIMIT, page, mediaType: media, country: sp.country || undefined });
      } else if (platform === 'google') {
        r = await ttSearchGoogle({ apiKey }, { search: query, limit: LIMIT, page, country: sp.country || undefined });
      } else {
        r = await ttSearchAds({ apiKey }, {
          search: query, limit: LIMIT, offset: (page - 1) * LIMIT,
          mediaType: media,
          status: sp.status === 'all' ? 'all' : 'active',
          searchIn: (sp.searchIn as 'ad_copy' | 'brand' | 'domain') || undefined,
          country: sp.country || undefined,
          adLanguage: sp.lang || undefined,
          minReach: sp.minReach ? Number(sp.minReach) : undefined,
          minDaysRunning: sp.minDays ? Number(sp.minDays) : undefined,
          sortBy: (sp.sort as AdSort) || 'reachDelta7d',
        });
      }
      ads = r.ads;
      total = r.total;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const totalPages = Math.min(Math.ceil(total / LIMIT) || 1, 417);

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Inspo</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>bibliothèque concurrentielle · Trendtrack · {platformLabel[platform]}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 16 }}>
        Recherche les publicités qui tournent chez tes concurrents. L'ancienneté (<b>jours actifs</b>) est un proxy de performance.
      </p>

      {/* Filtres */}
      <form action="/inspo" method="get" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input name="q" defaultValue={query} placeholder="Ex : skincare, coque téléphone, legging…" style={{ flex: 1, minWidth: 240, ...inputBase }} />
          <button type="submit" style={searchBtn}>Rechercher</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Select name="p" def={sp.p} opts={PLATFORMS} />
          <Select name="searchIn" def={sp.searchIn} opts={[['ad_copy', 'Dans : copy'], ['brand', 'Dans : marque'], ['domain', 'Dans : domaine']]} />
          <Select name="sort" def={sp.sort} opts={SORTS.map((x) => [x.v, 'Tri : ' + x.label])} />
          <Select name="media" def={sp.media} opts={[['', 'Média : tous'], ['video', 'Vidéo'], ['image', 'Image']]} />
          <Select name="status" def={sp.status} opts={[['active', 'Actives'], ['all', 'Toutes']]} />
          <Select name="country" def={sp.country} opts={[['', 'Pays : tous'], ...COUNTRIES.map((c) => [c, c])]} />
          <Select name="lang" def={sp.lang} opts={[['', 'Langue : toutes'], ...LANGS]} />
          <Select name="minReach" def={sp.minReach} opts={[['', 'Reach : min'], ...REACHES]} />
          <Select name="minDays" def={sp.minDays} opts={[['', 'Ancienneté : min'], ...DAYS]} />
        </div>
      </form>

      {/* Chips thématiques (réinitialisent la recherche en gardant les filtres) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {CHIPS.map((c) => (
          <a key={c} href={buildQS(sp, { q: c, page: '1' })} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--ink-2)', textDecoration: 'none' }}>{c}</a>
        ))}
      </div>

      {sample && <div style={banner('rgba(245,166,35,.12)', 'rgba(245,166,35,.4)', '#f5c877')}>Mode démonstration (échantillon réel). Ajoute <code>TRENDTRACK_API_KEY</code> sur le serveur pour la recherche en direct.</div>}
      {error && <div style={banner('rgba(255,77,109,.10)', 'rgba(255,77,109,.4)', '#ff9db0')}>Erreur Trendtrack : {error}</div>}
      {!sample && !error && !query && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Lance une recherche ou choisis une thématique ci-dessus.</p>}
      {!sample && !error && query && <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 14 }}>≈ {compact(total)} annonce(s) · page {page}/{totalPages}</p>}

      {/* Grille */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>

      {/* Pagination */}
      {!sample && !error && query && ads.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 26 }}>
          {page > 1
            ? <a href={buildQS(sp, { page: String(page - 1) })} style={pageBtn}>← Précédent</a>
            : <span style={{ ...pageBtn, opacity: .4, pointerEvents: 'none' }}>← Précédent</span>}
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted)' }}>{page} / {totalPages}</span>
          {page < totalPages
            ? <a href={buildQS(sp, { page: String(page + 1) })} style={pageBtn}>Suivant →</a>
            : <span style={{ ...pageBtn, opacity: .4, pointerEvents: 'none' }}>Suivant →</span>}
        </div>
      )}
    </main>
  );
}

function Select({ name, def, opts }: { name: string; def?: string; opts: string[][] }) {
  return (
    <select name={name} defaultValue={def ?? opts[0]?.[0] ?? ''} style={{ ...inputBase, padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
      {opts.map((o) => <option key={o[0] || 'any'} value={o[0]}>{o[1]}</option>)}
    </select>
  );
}

function AdCard({ ad }: { ad: InspoAd }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <a href={ad.mediaUrl || ad.thumbnailUrl || '#'} target="_blank" rel="noreferrer" style={{ position: 'relative', aspectRatio: '1/1', display: 'block', background: 'var(--paper)' }}>
        {ad.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.thumbnailUrl} alt={ad.advertiserName || 'ad'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>{ad.daysRunning} j actifs</span>
        {ad.mediaType === 'video' && <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>▶ vidéo</span>}
      </a>
      <div style={{ padding: '11px 12px', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ad.advertiserLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.advertiserLogo} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.advertiserName || '—'}</span>
        </div>
        {ad.body && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ad.body}</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ad.platform === 'tiktok' ? (
            <>
              <Stat label="Vues" value={compact(ad.views)} />
              <Stat label="Likes" value={compact(ad.likes)} />
              {ad.engagementRate != null && <Stat label="Engag." value={ad.engagementRate.toFixed(1).replace('.', ',') + ' %'} />}
            </>
          ) : ad.platform === 'google' ? (
            <>
              <Stat label="Reach" value={compact(ad.reach)} />
              {ad.format && <Stat label="Format" value={ad.format.replace('_', ' ')} />}
              {ad.mainCountry && <Stat label="Pays" value={ad.mainCountry} />}
            </>
          ) : (
            <>
              <Stat label="Reach" value={compact(ad.reach)} />
              <Stat label="Spend est." value={eur(ad.estimatedSpend)} />
              {ad.mainCountry && <Stat label="Pays" value={ad.mainCountry} />}
            </>
          )}
        </div>
        {(ad.callToAction || ad.landingDomain) && (
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ad.callToAction && <span style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>{ad.callToAction}</span>}
            {ad.landingDomain && <span>· {ad.landingDomain}</span>}
          </div>
        )}
        <a href={`/studio?brand=${encodeURIComponent(ad.advertiserName || '')}&inspo=${encodeURIComponent(ad.body || '')}`}
          style={{ marginTop: 2, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line-2)', color: 'var(--ink)', textDecoration: 'none' }}>
          ✨ Générer une variante
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 auto', minWidth: 60, padding: '5px 8px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
const inputBase = { padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, outline: 'none' } as const;
const searchBtn = { padding: '11px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' } as const;
const upgradeBtn = { display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' } as const;
const pageBtn = { padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none' } as const;
const banner = (bg: string, border: string, color: string) => ({ padding: '10px 14px', borderRadius: 12, background: bg, border: `1px solid ${border}`, color, fontSize: 13, marginBottom: 18 } as const);
