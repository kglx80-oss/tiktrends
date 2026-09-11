import type { InspoAd } from '@tiktrends/integrations';
import { estGagnantVeille, bibliothequePub, siteMarque } from '@tiktrends/core';
import { studioDepuisVeille } from '../lib/veille-link';
import { SaveButton, FollowButton } from './InspoButtons';
import { AdMedia } from './AdMedia';
import { Icon } from './Icon';

export const compact = (n?: number) => {
  if (n == null) return 'n/c';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return String(n);
};
const eur = (n?: number) => (n == null ? 'n/c' : '€' + compact(n));

const lienExterne = { fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--line-2)', color: 'var(--ink-2)', textDecoration: 'none', background: 'var(--bg)' } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 auto', minWidth: 60, padding: '5px 8px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export function AdCard({ ad, saved = false, following = false, cloneRef }: { ad: InspoAd; saved?: boolean; following?: boolean; cloneRef?: string }) {
  // Gagnant = éprouvé · tient depuis assez longtemps, ou portée qui progresse.
  // On le flague et on pousse le clone · c'est la pub PROUVÉE qu'on veut refaire,
  // pas le énième lancement d'un concurrent.
  const gagnant = estGagnantVeille(ad);
  // Liens sortants · retrouver la marque à sa source, pas une impasse.
  const biblio = bibliothequePub({ platform: ad.platform, name: ad.advertiserName });
  const site = siteMarque({ landingDomain: ad.landingDomain, landingUrl: ad.landingUrl });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative' }}>
        <AdMedia mediaUrl={ad.mediaUrl} thumbnailUrl={ad.thumbnailUrl} isVideo={ad.mediaType === 'video'} daysRunning={ad.daysRunning} aspect="1/1" />
        {/* Sauvegarder / retirer (instantané) */}
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
          <SaveButton ad={ad} initialSaved={saved} />
        </div>
      </div>
      <div style={{ padding: '11px 12px', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ad.advertiserLogo && (
             
            <img src={ad.advertiserLogo} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ad.advertiserName || 'Annonceur'}</span>
          {gagnant && <span title="Éprouvée · tient dans le temps ou sa portée progresse" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: 'var(--on-accent)', background: 'var(--grad-accent)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}><Icon name="trophy" size={11} /> Gagnant</span>}
          <FollowButton ad={ad} initialFollowing={following} />
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
        {(biblio || site) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {biblio && <a href={biblio.url} target="_blank" rel="noreferrer" style={lienExterne}>{biblio.label} ↗</a>}
            {site && <a href={site} target="_blank" rel="noreferrer" style={lienExterne}>Site ↗</a>}
          </div>
        )}
        {/* Le pont veille → création. Il pointait vers `/studio` (le hub, pas les
             Pubs IA) avec des paramètres que la page ne lit pas, et charriait la
             copy concurrente mot pour mot · un clic sans suite, ou une créa qui
             recopie. Ici on distille l'ANGLE éprouvé et on arme les Pubs IA · la
             règle « reprends l'angle, pas les mots » vit dans le noyau. */}
        {/* Le clone d'un gagnant est mis en avant · fond plein, l'action évidente.
             Une pub non éprouvée garde le geste discret · rien n'y presse. */}
        <a href={studioDepuisVeille(ad, { ref: cloneRef })}
          style={{ marginTop: 2, textAlign: 'center', fontSize: 12, fontWeight: gagnant ? 800 : 700, padding: '7px 10px', borderRadius: 10,
            border: gagnant ? 'none' : '1px solid var(--line-2)',
            background: gagnant ? 'var(--grad-accent)' : 'transparent',
            color: gagnant ? 'var(--on-accent)' : 'var(--ink)', textDecoration: 'none' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={13} /> {gagnant ? 'Clone ce gagnant' : 'Génère ta version'}</span>
        </a>
      </div>
    </div>
  );
}
