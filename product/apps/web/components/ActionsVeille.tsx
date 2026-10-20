'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { InspoAd } from '@tiktrends/integrations';
import { bibliothequePub, libelleBibliotheque, siteMarque } from '@tiktrends/core';
import { lienJarvisVeille } from '../lib/veille-jarvis';
import { Icon } from './Icon';
import { surface } from './ui';
import { Portail } from './Portail';
import { usePiegeFocus } from './use-piege-focus';
import { FollowButton } from './InspoButtons';
import { PreparerCreation } from './studios/PreparerCreation';

const ligne: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 10px', borderRadius: 10, color: 'var(--ink)', textDecoration: 'none', fontSize: 13 };
const section: CSSProperties = { margin: '12px 10px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' };

/** Actions explicites : ouvrir le panneau ou préparer une demande ne lance pas l'IA. */
export function ActionsVeille({ ad, following, sauvegardeId, retour, annonceur }: {
  ad: InspoAd; following: boolean; sauvegardeId?: string; retour: string | null; annonceur: string | null;
}) {
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const panneau = useRef<HTMLDivElement>(null);
  usePiegeFocus(panneau, { actif: !!position, onFermer: () => setPosition(null) });
  const biblio = bibliothequePub({ platform: ad.platform, name: ad.advertiserName });
  const site = siteMarque({ landingDomain: ad.landingDomain, landingUrl: ad.landingUrl });
  const cible = (action: 'scripts' | 'accroche' | 'hypothese') => lienJarvisVeille(ad, { action, ref: sauvegardeId, retour });
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 8 }}>
      <PreparerCreation annonce={ad} sauvegardeId={sauvegardeId} retour={retour} cibles44 libelle="Créer" />
      <button type="button" aria-haspopup="dialog" aria-expanded={!!position} onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const width = Math.min(344, window.innerWidth - 24);
        setPosition({ width, left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)), top: Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 580)) });
      }} style={{ ...ligne, border: '1px solid var(--line-2)', background: 'var(--surface)', cursor: 'pointer', justifyContent: 'center' }}>
        <Icon name="sparkles" size={14} /> Actions <span aria-hidden>⌄</span>
      </button>
    </div>
    <Portail><div onClick={() => setPosition(null)} style={{ position: 'fixed', inset: 0, zIndex: 210, display: position ? 'block' : 'none' }}>
      <div ref={panneau} role="dialog" aria-modal="true" aria-label={`Actions pour ${ad.advertiserName || 'cette annonce'}`} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ ...surface, position: 'absolute', ...position, maxHeight: `calc(100dvh - ${(position?.top ?? 0) + 12}px)`, overflowY: 'auto', background: 'var(--surface)', boxShadow: '0 12px 40px var(--line-2)' }}>
        <div style={{ padding: '12px 16px', background: 'var(--accent-soft)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{ad.advertiserName || 'Annonceur'}</strong><p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ad.body || 'Texte non fourni'}</p></div>
          <button type="button" aria-label="Fermer les actions" onClick={() => setPosition(null)} style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 0, color: 'var(--ink)', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '0 6px 8px' }}>
          <h3 style={section}>Script</h3>
          <div style={{ ...ligne, color: 'var(--muted)' }}><Icon name="file" size={18} /><span>Transcrire le script<small style={{ display: 'block', marginTop: 3 }}>Transcription audio non raccordée</small></span></div>
          {ad.body && <a download="texte-publicitaire.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(ad.body)}`} style={ligne}><Icon name="download" size={18} /><span>Exporter le texte publicitaire<small style={{ display: 'block', color: 'var(--muted)', marginTop: 3 }}>TXT · texte fourni, sans transcription audio</small></span></a>}
          <a href={cible('scripts')} style={ligne}><Icon name="sparkles" size={18} /><span>Scripts similaires<small style={{ display: 'block', color: 'var(--muted)', marginTop: 3 }}>Préparer la demande dans Jarvis</small></span></a>
          <h3 style={section}>Comprendre</h3>
          <a href={cible('accroche')} style={ligne}><Icon name="search" size={18} /> Analyser l’accroche</a>
          <a href={cible('hypothese')} style={ligne}><Icon name="bulb" size={18} /> En faire une hypothèse</a>
          <h3 style={section}>Source et suivi</h3>
          {annonceur && <a href={annonceur} style={ligne}>Ses annonces dans la Veille ›</a>}
          {biblio && <a href={biblio.url} target="_blank" rel="noopener noreferrer" style={ligne}>{libelleBibliotheque(biblio)} ↗</a>}
          {site && <a href={site} target="_blank" rel="noopener noreferrer" style={ligne}>Site de l’annonceur ↗</a>}
          <div style={{ padding: '4px 10px' }}><FollowButton ad={ad} initialFollowing={following} /></div>
          <details style={{ margin: '8px 10px', fontSize: 12, color: 'var(--muted)' }}><summary>Informations de diffusion</summary><dl>
            {ad.reach != null && <><dt>Portée</dt><dd>{ad.reach.toLocaleString('fr-FR')}</dd></>}
            {ad.estimatedSpend != null && <><dt>Dépense estimée, non vérifiée</dt><dd>{ad.estimatedSpend.toLocaleString('fr-FR')} €</dd></>}
            {ad.views != null && <><dt>Vues</dt><dd>{ad.views.toLocaleString('fr-FR')}</dd></>}
            {ad.likes != null && <><dt>Likes</dt><dd>{ad.likes.toLocaleString('fr-FR')}</dd></>}
            {ad.engagementRate != null && <><dt>Engagement</dt><dd>{ad.engagementRate.toLocaleString('fr-FR')} %</dd></>}
            {ad.format && <><dt>Format</dt><dd>{ad.format}</dd></>}
            {ad.landingDomain && <><dt>Domaine</dt><dd>{ad.landingDomain}</dd></>}
            {ad.callToAction && <><dt>Appel à l’action</dt><dd>{ad.callToAction}</dd></>}
          </dl></details>
        </div>
        <p style={{ margin: 0, padding: '12px 16px', background: 'var(--accent-soft)', color: 'var(--ink-2)', fontSize: 11, lineHeight: 1.5 }}>Jarvis reprend la créative en contexte. Demande à relire avant envoi ; coût indiqué avant l’intervention.</p>
      </div>
    </div></Portail>
  </>;
}
