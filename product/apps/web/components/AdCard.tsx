import type { InspoAd } from '@tiktrends/integrations';
import { estGagnantVeille, bibliothequePub, libelleBibliotheque, siteMarque, ancreCarteVeille, lienAnnonceurVeille, LIBELLE_ANNONCEUR_VEILLE, TITRE_ANNONCEUR_VEILLE, nomLienAnnonceurVeille, CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { studioDepuisVeille } from '../lib/veille-link';
import { SaveButton, FollowButton } from './InspoButtons';
import { AdMedia } from './AdMedia';
import { Icon } from './Icon';
import { AvatarSite } from './AvatarSite';
import { PreparerCreation } from './studios/PreparerCreation';

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

export function AdCard({ ad, saved = false, following = false, cloneRef, ctaSobre = false, cibles44 = false, contexteRetour }: { ad: InspoAd; saved?: boolean; following?: boolean; cloneRef?: string;
  /**
   * Rend le pont vers la création DISCRET · même lien, même texte, même
   * comportement, mais sans le fond plein accentué. La Veille mène par
   * l'observation et l'analyse · la création y est secondaire. Défaut `false` ·
   * les autres usages de la carte (Sauvegardes, découverte, tracker) gardent
   * l'emphase existante et ne régressent pas.
   */
  ctaSobre?: boolean;
  /**
   * Porte les liens AUTONOMES de la carte (biblio, site) et le pont de création
   * à la cible tactile 44 · un lien de carte n'est pas un lien inline exempté.
   * Défaut `false` · les autres surfaces (Sauvegardes, découverte, tracker,
   * landing) gardent leur densité inchangée.
   */
  cibles44?: boolean;
  /**
   * Lot 18B · le contexte de la recherche de Veille en cours (`contexteVeille`) ·
   * la carte porte alors une ancre, un lien vers les annonces du même annonceur
   * et un Studio qui sait revenir ici. Absent hors Veille · rien ne change.
   */
  contexteRetour?: string }) {
  const t44 = cibles44 ? { minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' } as const : null;
  // Gagnant = éprouvé · tient depuis assez longtemps, ou portée qui progresse.
  // On le flague et on pousse le clone · c'est la pub PROUVÉE qu'on veut refaire,
  // pas le énième lancement d'un concurrent.
  const gagnant = estGagnantVeille(ad);
  // Liens sortants · retrouver la marque à sa source, pas une impasse.
  const biblio = bibliothequePub({ platform: ad.platform, name: ad.advertiserName });
  const site = siteMarque({ landingDomain: ad.landingDomain, landingUrl: ad.landingUrl });
  const ancre = contexteRetour != null ? ancreCarteVeille(ad) : null;
  const retour = contexteRetour != null ? `${contexteRetour}${ancre ? `#${ancre}` : ''}` : null;
  const annonceur = retour != null ? lienAnnonceurVeille(ad, retour) : null;
  return (
    <div id={ancre ?? undefined} style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column', ...(ancre ? { scrollMarginTop: 96 } : null) }}>
      <div style={{ position: 'relative' }}>
        <AdMedia mediaUrl={ad.mediaUrl} thumbnailUrl={ad.thumbnailUrl} isVideo={ad.mediaType === 'video'} daysRunning={ad.daysRunning} aspect="1/1" />
        {/* Sauvegarder / retirer (instantané) */}
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
          <SaveButton ad={ad} initialSaved={saved} />
        </div>
      </div>
      <div style={{ padding: '11px 12px', display: 'grid', gap: 8 }}>
        {/* minWidth:0 · la rangée est un enfant de grille et le nom un flex-item ·
            sans ça (min-width auto par défaut) l'ellipsis voulue sur le nom
            n'opère pas et un annonceur au nom long pousse le badge et le bouton
            Suivre hors de la carte. */}
        {/* Nom long (mesuré · « M… » à 1280 dans Nouveautés, coincé entre « Piste
            forte » et « Suivre ») · la rangée passe à la ligne quand le nom n'a
            plus 120 px, le nom tient sur 2 lignes et reste complet au survol.
            Un nom court ne change rien (recette #106, point 6). */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
          {/* Le logo plateforme quand il existe · sinon une identité de repli
              (favicon du site d'atterrissage, ou initiales teintées) plutôt qu'un
              nom nu · même traitement d'identité que le reste de l'outil. */}
          {ad.advertiserLogo ? (
            <img src={ad.advertiserLogo} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <AvatarSite nom={ad.advertiserName || 'Annonceur'} site={ad.landingDomain} taille={22} rayon={11} />
          )}
          <span title={ad.advertiserName || undefined} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere', lineHeight: 1.3, flex: '1 1 120px', minWidth: 0 }}>{ad.advertiserName || 'Annonceur'}</span>
          {gagnant && <span title="Source observée · tient dans le temps ou sa portée progresse · un proxy public de traction, pas une preuve de rentabilité" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: 'var(--on-accent)', background: 'var(--grad-accent)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}><Icon name="trophy" size={11} /> Piste forte</span>}
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
        {(biblio || site || annonceur) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Lot 18B · la recherche INTERNE des annonces du même annonceur ·
                une recherche par nom, pas un suivi (le bouton Suivre reste à part). */}
            {annonceur && <a href={annonceur} style={{ ...lienExterne, ...t44, color: 'var(--ink)' }} title={TITRE_ANNONCEUR_VEILLE} aria-label={nomLienAnnonceurVeille(ad)}>{LIBELLE_ANNONCEUR_VEILLE} ›</a>}
            {biblio && <a href={biblio.url} target="_blank" rel="noreferrer" style={{ ...lienExterne, ...t44 }} title="Ouvre une recherche par nom d’annonceur · pas l’annonce exacte">{libelleBibliotheque(biblio)} ↗</a>}
            {site && <a href={site} target="_blank" rel="noreferrer" style={{ ...lienExterne, ...t44 }}>Site ↗</a>}
          </div>
        )}
        {/* Un seul geste de création (retrait des anciens studios, 10/10) ·
            « Préparer une création » là où la carte est une source accessible
            (Veille, Sauvegardes, Formats) ; ailleurs, le lien vers la
            préparation d'un projet, angle distillé et provenance repris
            (`studioDepuisVeille`). La piste qui tient est mise en avant. */}
        {(contexteRetour != null || cloneRef) ? (
          <PreparerCreation
            annonce={{ id: ad.id, platform: ad.platform, mediaType: ad.mediaType ?? null, thumbnailUrl: ad.thumbnailUrl ?? null, mediaUrl: ad.mediaUrl ?? null, advertiserName: ad.advertiserName ?? null, body: ad.body ?? null, callToAction: ad.callToAction ?? null, landingDomain: ad.landingDomain ?? null, landingUrl: ad.landingUrl ?? null, daysRunning: ad.daysRunning ?? null }}
            sauvegardeId={cloneRef ?? null} retour={retour} cibles44={cibles44} />
        ) : (
        <a href={studioDepuisVeille(ad, { ref: cloneRef, retour })}
          style={{ marginTop: 2, textAlign: 'center', fontSize: 12, fontWeight: (gagnant && !ctaSobre) ? 800 : 700, padding: '7px 10px', borderRadius: 10,
            ...(cibles44 ? { minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', justifyContent: 'center' } : null),
            border: (gagnant && !ctaSobre) ? 'none' : '1px solid var(--line-2)',
            background: (gagnant && !ctaSobre) ? 'var(--grad-accent)' : 'transparent',
            color: (gagnant && !ctaSobre) ? 'var(--on-accent)' : (ctaSobre ? 'var(--ink-2)' : 'var(--ink)'), textDecoration: 'none' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={13} /> {gagnant ? 'Décline cette piste' : 'Préparer une création'}</span>
        </a>
        )}
      </div>
    </div>
  );
}
