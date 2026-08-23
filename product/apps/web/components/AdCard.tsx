import type { InspoAd } from '@tiktrends/integrations';
import { saveAdAction, unsaveAdAction, followBrandAction, unfollowBrandAction } from '../app/actions/inspo';

export const compact = (n?: number) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return String(n);
};
const eur = (n?: number) => (n == null ? '—' : '€' + compact(n));

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 auto', minWidth: 60, padding: '5px 8px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export function AdCard({ ad, saved = false, following = false, back }: { ad: InspoAd; saved?: boolean; following?: boolean; back?: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative' }}>
        <a href={ad.mediaUrl || ad.thumbnailUrl || '#'} target="_blank" rel="noreferrer" style={{ position: 'relative', aspectRatio: '1/1', display: 'block', background: 'var(--paper)' }}>
          {ad.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.thumbnailUrl} alt={ad.advertiserName || 'ad'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>{ad.daysRunning} j actifs</span>
          {ad.mediaType === 'video' && <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>▶ vidéo</span>}
        </a>
        {/* Sauvegarder / retirer */}
        <form action={saved ? unsaveAdAction : saveAdAction} style={{ position: 'absolute', top: 6, right: 6, margin: 0 }}>
          <input type="hidden" name="platform" value={ad.platform} />
          <input type="hidden" name="externalId" value={ad.id} />
          {!saved && <input type="hidden" name="snapshot" value={JSON.stringify(ad)} />}
          {back && <input type="hidden" name="back" value={back} />}
          <button type="submit" title={saved ? 'Retirer des sauvegardes' : 'Sauvegarder'} style={{ width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer', background: saved ? 'var(--grad-accent)' : 'rgba(0,0,0,.65)', color: '#fff', fontSize: 14, lineHeight: 1 }}>
            {saved ? '★' : '☆'}
          </button>
        </form>
      </div>
      <div style={{ padding: '11px 12px', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ad.advertiserLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.advertiserLogo} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ad.advertiserName || '—'}</span>
          {ad.advertiserName && (
            <form action={following ? unfollowBrandAction : followBrandAction} style={{ margin: 0 }}>
              <input type="hidden" name="platform" value={ad.platform} />
              <input type="hidden" name="name" value={ad.advertiserName} />
              {ad.advertiserId && <input type="hidden" name="externalId" value={ad.advertiserId} />}
              {ad.advertiserLogo && <input type="hidden" name="logoUrl" value={ad.advertiserLogo} />}
              {back && <input type="hidden" name="back" value={back} />}
              <button type="submit" style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--line-2)', background: following ? 'var(--accent-soft)' : 'transparent', color: following ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
                {following ? '✓ Suivi' : '+ Suivre'}
              </button>
            </form>
          )}
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
