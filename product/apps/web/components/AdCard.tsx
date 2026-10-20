import type { InspoAd } from '@tiktrends/integrations';
import { estGagnantVeille, bibliothequePub, libelleBibliotheque, siteMarque, ancreCarteVeille, lienAnnonceurVeille, LIBELLE_ANNONCEUR_VEILLE, TITRE_ANNONCEUR_VEILLE, nomLienAnnonceurVeille, CIBLE_TACTILE_MIN, bandeauVeille, teinte } from '@tiktrends/core';
import { studioDepuisVeille } from '../lib/veille-link';
import { SaveButton, FollowButton } from './InspoButtons';
import { AdMedia } from './AdMedia';
import { Icon } from './Icon';
import { AvatarSite } from './AvatarSite';
import { PreparerCreation } from './studios/PreparerCreation';
import { ActionsVeille } from './ActionsVeille';

export const compact = (n?: number) => {
  if (n == null) return 'n/c';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return String(n);
};
const eur = (n?: number) => (n == null ? 'n/c' : '€' + compact(n));

const lienExterne = { fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--line-2)', color: 'var(--ink-2)', textDecoration: 'none', background: 'var(--bg)' } as const;

function Stat({ label, value, dense = false }: { label: string; value: string; dense?: boolean }) {
  // `dense` · la présentation V5 resserre la carte (maquette · grille compacte) ·
  // tuiles plus serrées et valeur un cran plus petite, sans rien retirer du signal.
  return (
    <div style={{ flex: '1 1 auto', minWidth: dense ? 54 : 60, padding: dense ? '4px 7px' : '5px 8px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: dense ? 12 : 13, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export function AdCard({ ad, saved = false, following = false, cloneRef, ctaSobre = false, cibles44 = false, contexteRetour, badgesV5 = false }: { ad: InspoAd; saved?: boolean; following?: boolean; cloneRef?: string;
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
  contexteRetour?: string;
  /**
   * UX V5 · présentation de la maquette · bandeau plateforme + format en haut du
   * média, et pastille de statut (Active / Inactive · N j) avec jauge. N'affiche
   * QUE des champs réels (`bandeauVeille`, noyau) · pas de durée, ratio,
   * variantes ni tags simulés (absents de la source). Opt-in · défaut `false` ·
   * les autres surfaces de la carte restent inchangées.
   */
  badgesV5?: boolean }) {
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
  // UX V5 · bandeau et statut, tirés des seuls champs réels de l'annonce.
  const bandeau = badgesV5 ? bandeauVeille(ad) : null;
  return (
    <div id={ancre ?? undefined} style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column', ...(ancre ? { scrollMarginTop: 96 } : null) }}>
      <div style={{ position: 'relative' }}>
        {/* En V5, le bandeau plateforme + format prend le coin haut-gauche · les
            jours de diffusion quittent ce coin pour la pastille de statut, sous le
            média (maquette). Hors V5, le badge « N j actifs » du média reste. */}
        <AdMedia mediaUrl={ad.mediaUrl} thumbnailUrl={ad.thumbnailUrl} isVideo={ad.mediaType === 'video'} daysRunning={badgesV5 ? undefined : ad.daysRunning} aspect="1/1" />
        {bandeau && (
          // Bandeau plateforme + format (maquette V5) · deux pastilles jumelles,
          // MÊME fond sombre et MÊME rayon que la sauvegarde du coin opposé
          // (`SaveButton`, rayon 9) · un seul système d'étiquettes sur le média,
          // pas deux opacités qui se contredisent.
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, zIndex: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9, background: teinte('sombre-fixe', .65), color: 'var(--clair-fixe)' }}>{bandeau.plateforme}</span>
            {bandeau.media && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9, background: teinte('sombre-fixe', .65), color: 'var(--clair-fixe)' }}>{bandeau.media}</span>}
          </div>
        )}
        {/* Sauvegarder / retirer (instantané) */}
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
          <SaveButton ad={ad} initialSaved={saved} />
        </div>
      </div>
      {/* En V5 (maquette · grille 4 colonnes compactes) la carte se resserre ·
          padding et interligne réduits, sans rien retirer des signaux réels. */}
      <div style={{ padding: badgesV5 ? '10px 11px 11px' : '11px 12px', display: 'grid', gap: badgesV5 ? 6 : 8 }}>
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
          <span title={ad.advertiserName || undefined} style={{ fontSize: badgesV5 ? 14 : 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere', lineHeight: 1.3, flex: '1 1 120px', minWidth: 0 }}>{ad.advertiserName || 'Annonceur'}</span>
          {!badgesV5 && gagnant && <span title="Source observée · tient dans le temps ou sa portée progresse · un proxy public de traction, pas une preuve de rentabilité" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: 'var(--on-accent)', background: 'var(--grad-accent)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}><Icon name="trophy" size={11} /> Piste forte</span>}
          {badgesV5 ? (ad.mainCountry && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ad.mainCountry}</span>) : <FollowButton ad={ad} initialFollowing={following} />}
        </div>
        {bandeau && (
          // Pastille de statut + jauge (maquette V5) · elle suit le nom, comme sur
          // la maquette. Statut et jours RÉELS · la jauge mesure les jours contre
          // le seuil de piste éprouvée (noyau · PROVEN_DAYS), pas un seuil inventé.
          // Le POINT porte l'état (actif vert / inactif gris · redondé par le mot
          // « Active »/« Inactive », jamais la seule couleur) ; la JAUGE mesure la
          // progression vers le seuil et reste verte quel que soit l'état. Pas de
          // variantes ni de date de première vue (absentes de la source · R14).
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: bandeau.statut.actif ? 'var(--ok)' : 'var(--muted)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{bandeau.statut.texte} · {bandeau.statut.jours} j</span>
            <span aria-hidden style={{ flex: '1 1 auto', maxWidth: 132, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', minWidth: 24 }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round(bandeau.jauge * 100)}%`, borderRadius: 999, background: 'var(--ok)' }} />
            </span>
          </div>
        )}
        {ad.body && <p style={{ margin: 0, fontSize: badgesV5 ? 13 : 12, color: badgesV5 ? 'var(--ink)' : 'var(--ink-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{badgesV5 ? `« ${ad.body} »` : ad.body}</p>}
        {!badgesV5 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ad.platform === 'tiktok' ? (
            <>
              <Stat label="Vues" value={compact(ad.views)} dense={badgesV5} />
              <Stat label="Likes" value={compact(ad.likes)} dense={badgesV5} />
              {ad.engagementRate != null && <Stat label="Engag." value={ad.engagementRate.toFixed(1).replace('.', ',') + ' %'} dense={badgesV5} />}
            </>
          ) : ad.platform === 'google' ? (
            <>
              <Stat label="Reach" value={compact(ad.reach)} dense={badgesV5} />
              {ad.format && <Stat label="Format" value={ad.format.replace('_', ' ')} dense={badgesV5} />}
              {ad.mainCountry && <Stat label="Pays" value={ad.mainCountry} dense={badgesV5} />}
            </>
          ) : (
            <>
              <Stat label="Reach" value={compact(ad.reach)} dense={badgesV5} />
              <Stat label="Spend est." value={eur(ad.estimatedSpend)} dense={badgesV5} />
              {ad.mainCountry && <Stat label="Pays" value={ad.mainCountry} dense={badgesV5} />}
            </>
          )}
        </div>}
        {!badgesV5 && (ad.callToAction || ad.landingDomain) && (
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ad.callToAction && <span style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>{ad.callToAction}</span>}
            {ad.landingDomain && <span>· {ad.landingDomain}</span>}
          </div>
        )}
        {!badgesV5 && (biblio || site || annonceur) && (
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
        {badgesV5 ? <ActionsVeille ad={ad} following={following} sauvegardeId={cloneRef} retour={retour} annonceur={annonceur} /> : (contexteRetour != null || cloneRef) ? (
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
