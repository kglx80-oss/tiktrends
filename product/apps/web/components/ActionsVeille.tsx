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
import { JarvisVeillePanneau } from './JarvisVeillePanneau';
import { btn } from './ui';

const ligne: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box', minHeight: 48, padding: '6px 10px', borderRadius: 10, color: 'var(--ink)', textDecoration: 'none', fontSize: 13 };
const pastille: CSSProperties = { width: 32, height: 32, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--accent-soft)', color: 'var(--accent)' };
function LigneAction({ icon, titre, detail }: { icon: string; titre: string; detail: string }) { return <><span style={pastille}><Icon name={icon} size={16} /></span><span style={{ minWidth: 0 }}><strong style={{ fontWeight: 600 }}>{titre}</strong><small style={{ display: 'block', color: 'var(--muted)', marginTop: 3, fontSize: 11, lineHeight: 1.4 }}>{detail}</small></span></>; }
export function RaccourcisVeille({ ad, sauvegardeId, retour }: { ad: InspoAd; sauvegardeId?: string; retour: string | null }) {
  const rapide: CSSProperties = { width: 36, height: 36, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--voile-media)', color: 'var(--clair-fixe)', border: 0, boxShadow: '0 4px 12px var(--line-2)' };
  return <div role="toolbar" aria-label="Actions rapides" style={{ position: 'absolute', bottom: 16, right: 10, display: 'flex', gap: 6, zIndex: 2 }}><button type="button" disabled aria-label="Transcription audio indisponible" title="Transcription audio non raccordée" style={{ ...rapide, opacity: .65 }}><Icon name="file" size={15}/></button>{(['scripts', 'accroche'] as const).map((action) => <JarvisVeillePanneau key={action} href={lienJarvisVeille(ad, { action, ref: sauvegardeId, retour })} annonceur={ad.advertiserName} extrait={ad.body} titre={action === 'scripts' ? 'Scripts similaires' : 'Analyser l’accroche'} style={rapide}><Icon name={action === 'scripts' ? 'sparkles' : 'search'} size={15}/><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{action === 'scripts' ? 'Scripts similaires' : 'Analyser l’accroche'}</span></JarvisVeillePanneau>)}</div>;
}
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
      <JarvisVeillePanneau href={lienJarvisVeille(ad, { action: 'cloner', ref: sauvegardeId, retour })} annonceur={ad.advertiserName} extrait={ad.body} titre="Cloner" style={{ ...btn, borderRadius: 10, minHeight: 44, textDecoration: 'none', justifyContent: 'center' }}><Icon name="layers" size={16} /> Cloner</JarvisVeillePanneau>
      <button type="button" aria-haspopup="dialog" aria-expanded={!!position} onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const width = Math.min(330, window.innerWidth - 24);
        setPosition({ width, left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)), top: Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 600)) });
      }} style={{ ...ligne, border: '1px solid var(--line-2)', background: 'var(--surface)', cursor: 'pointer', justifyContent: 'center' }}>
        <span aria-hidden style={{ width: 12, height: 12, borderRadius: 99, background: 'var(--grad-accent)', boxShadow: 'inset 2px 2px 2px var(--accent-soft)' }} /> Actions <span aria-hidden>⌄</span>
      </button>
    </div>
    <Portail><div onClick={() => setPosition(null)} style={{ position: 'fixed', inset: 0, zIndex: 210, display: position ? 'block' : 'none' }}>
      <div ref={panneau} role="dialog" aria-modal="true" aria-label={`Actions pour ${ad.advertiserName || 'cette annonce'}`} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ ...surface, borderRadius: 16, position: 'absolute', ...position, maxHeight: `calc(100dvh - ${(position?.top ?? 0) + 12}px)`, overflowY: 'auto', background: 'var(--surface)', boxShadow: '0 12px 40px var(--line-2)' }}>
        <div style={{ padding: '14px 16px', background: 'var(--accent-soft)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ ...pastille, color: 'var(--ink)', fontWeight: 600 }}>{(ad.advertiserName || 'A').slice(0,1)}</span><div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{ad.advertiserName || 'Annonceur'}</strong><p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ad.body || 'Texte non fourni'}</p></div>
          <button type="button" aria-label="Fermer les actions" onClick={() => setPosition(null)} style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 0, color: 'var(--ink)', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '0 6px 8px' }}>
          <h3 style={section}>Script</h3>
          <div style={{ ...ligne, color: 'var(--muted)' }}><LigneAction icon="file" titre="Transcrire le script" detail="Transcription audio non raccordée" /></div>
          {ad.body && <a download="texte-publicitaire.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(ad.body)}`} style={ligne}><LigneAction icon="download" titre="Exporter le texte publicitaire" detail="TXT · texte disponible" /></a>}
          <JarvisVeillePanneau href={cible('scripts')} annonceur={ad.advertiserName} extrait={ad.body} onOpen={() => setPosition(null)} style={ligne}><LigneAction icon="sparkles" titre="Scripts similaires" detail="Même mécanique, réécrite pour ta marque" /></JarvisVeillePanneau>
          <h3 style={section}>Comprendre</h3>
          <JarvisVeillePanneau href={cible('accroche')} annonceur={ad.advertiserName} extrait={ad.body} onOpen={() => setPosition(null)} style={ligne}><LigneAction icon="search" titre="Analyser l’accroche" detail="Observation, puis hypothèse" /></JarvisVeillePanneau>
          <JarvisVeillePanneau href={cible('hypothese')} annonceur={ad.advertiserName} extrait={ad.body} onOpen={() => setPosition(null)} style={ligne}><LigneAction icon="bulb" titre="En faire une hypothèse" detail="Prête à tester dans un lot" /></JarvisVeillePanneau>
          <h3 style={section}>Créer</h3><div onClick={() => setPosition(null)} style={{ padding: '4px 10px 8px' }}><JarvisVeillePanneau href={lienJarvisVeille(ad, { action: 'cloner', ref: sauvegardeId, retour })} annonceur={ad.advertiserName} extrait={ad.body} titre="Cloner" onOpen={() => setPosition(null)} style={{ ...ligne, background: 'var(--accent-soft)' }}><LigneAction icon="layers" titre="Cloner pour ma marque" detail="Structure gardée, adaptée à ta marque" /></JarvisVeillePanneau></div><details style={{ margin: '4px 10px', fontSize: 11, color: 'var(--muted)' }}><summary style={{ cursor: 'pointer', padding: '8px 0' }}>Source, suivi et diffusion</summary>
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
          </dl></details></details>
        </div>
        <p style={{ margin: 0, padding: '12px 16px', background: 'var(--accent-soft)', color: 'var(--ink-2)', fontSize: 11, lineHeight: 1.5 }}>Jarvis prend le relais avec la créative en contexte.</p>
      </div>
    </div></Portail>
  </>;
}
