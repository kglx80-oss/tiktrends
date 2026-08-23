import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { ttSearchAds, SAMPLE_INSPO_ADS, type InspoAd } from '@tiktrends/integrations';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'inspo')!;
const CHIPS = ['skincare', 'fitness', 'mode', 'maison', 'nutrition', 'beauté', 'gadget'];

const compact = (n?: number) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return String(n);
};
const eur = (n?: number) => (n == null ? '—' : '€' + compact(n));

export default async function InspoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  // Gating : rôle + abonnement.
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
            <a href="/settings" style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              Gérer l'abonnement →
            </a>
          )}
        </div>
      </main>
    );
  }

  const { q } = await searchParams;
  const query = (q || '').trim();
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
      const r = await ttSearchAds({ apiKey }, { search: query, limit: 24 });
      ads = r.ads;
      total = r.total;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Inspo</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          bibliothèque concurrentielle · Trendtrack
        </span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Recherche les publicités qui tournent chez tes concurrents. L'ancienneté de diffusion
        (<b>jours actifs</b>) est un proxy de performance.
      </p>

      {/* Recherche */}
      <form action="/inspo" method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <input name="q" defaultValue={query} placeholder="Ex : skincare, coque téléphone, legging…"
          style={{ flex: 1, minWidth: 240, padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }} />
        <button type="submit" style={{ padding: '11px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Rechercher</button>
      </form>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {CHIPS.map((c) => (
          <a key={c} href={`/inspo?q=${encodeURIComponent(c)}`} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--ink-2)', textDecoration: 'none' }}>{c}</a>
        ))}
      </div>

      {sample && (
        <div style={banner('rgba(245,166,35,.12)', 'rgba(245,166,35,.4)', '#f5c877')}>
          Mode démonstration (échantillon réel). Ajoute <code>TRENDTRACK_API_KEY</code> sur le serveur pour la recherche en direct.
        </div>
      )}
      {error && (
        <div style={banner('rgba(255,77,109,.10)', 'rgba(255,77,109,.4)', '#ff9db0')}>
          Erreur Trendtrack : {error}
        </div>
      )}
      {!sample && !error && !query && (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Lance une recherche ou choisis une thématique ci-dessus.</p>
      )}
      {!sample && !error && query && (
        <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 14 }}>{compact(total)} annonce(s) pour « {query} »</p>
      )}

      {/* Grille */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
    </main>
  );
}

function AdCard({ ad }: { ad: InspoAd }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <a href={ad.mediaUrl || ad.thumbnailUrl || '#'} target="_blank" rel="noreferrer"
        style={{ position: 'relative', aspectRatio: '1/1', display: 'block', background: 'var(--paper)' }}>
        {ad.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.thumbnailUrl} alt={ad.advertiserName || 'ad'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>
          {ad.daysRunning} j actifs
        </span>
        {ad.mediaType === 'video' && (
          <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>▶ vidéo</span>
        )}
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
          <Stat label="Reach" value={compact(ad.reach)} />
          <Stat label="Spend est." value={eur(ad.estimatedSpend)} />
          {ad.mainCountry && <Stat label="Pays" value={ad.mainCountry} />}
        </div>
        {(ad.callToAction || ad.landingDomain) && (
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ad.callToAction && <span style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>{ad.callToAction}</span>}
            {ad.landingDomain && <span>· {ad.landingDomain}</span>}
          </div>
        )}
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
const banner = (bg: string, border: string, color: string) =>
  ({ padding: '10px 14px', borderRadius: 12, background: bg, border: `1px solid ${border}`, color, fontSize: 13, marginBottom: 18 } as const);
