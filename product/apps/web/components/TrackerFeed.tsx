'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from './Icon';
import { useRouter } from 'next/navigation';
import type { InspoAd } from '@tiktrends/integrations';
import { estGagnantVeille, evenementsConcurrent, etatScanNouveautes, cibleSelonPointeur, EVENEMENT_LABEL, EVENEMENT_RAISON, type EvenementConcurrent } from '@tiktrends/core';
import { useIsMobile } from './useIsMobile';
import { AdCard } from './AdCard';
import { scanTrackerAction, markTrackerSeenAction } from '../app/actions/tracker';
import { Empty } from './Empty';
import { useToast } from './Toast';
import { useRetraitsOnglet } from './SavedTabs';

export interface TrackerEvent { ad: InspoAd; advertiserName: string; unseen: boolean }

/**
 * Fil « nouveautés des concurrents » : détecte et affiche les nouvelles pubs des
 * marques suivies. Scan à la demande + rendu des créas détectées (les plus récentes).
 */
export function TrackerFeed({ events, followedCount, trackingEnabled }: { events: TrackerEvent[]; followedCount: number; trackingEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // Lot 16 · « Tout marquer vu » se voit TOUT DE SUITE (badge, bouton, compteur
  // de l'onglet) · avant, il attendait le rendu serveur, en retard de 3,8 s
  // 4 fois sur 12 (transition calée, relancée par la fermeture du toast · mesuré).
  // On retient les nouveautés vues ici · une nouveauté arrivée APRÈS reste neuve.
  const [vuesIci, setVuesIci] = useState<ReadonlySet<string>>(new Set());
  const titreRef = useRef<HTMLHeadingElement>(null);
  const cleEvt = (e: TrackerEvent) => `${e.ad.platform}:${e.ad.id}`;
  const nonVu = (e: TrackerEvent) => e.unseen && !vuesIci.has(cleEvt(e));
  const unseen = events.filter(nonVu).length;
  const vuesEncoreServies = events.filter((e) => e.unseen && vuesIci.has(cleEvt(e))).length;
  const signalerRetraits = useRetraitsOnglet();
  useEffect(() => { signalerRetraits('nouveautes', vuesEncoreServies); }, [signalerRetraits, vuesEncoreServies]);
  // Sans bibliothèque de pubs côté serveur, pas de scan · le bouton le dit au
  // lieu d'annoncer « aucune marque suivie » (recette #106, point 6).
  const etatScan = etatScanNouveautes({ veilleActive: trackingEnabled, marquesSuivies: followedCount });
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  const cible = Math.max(40, cibleSelonPointeur(tactile));
  // Les GAGNANTS d'abord · parmi les nouveautés détectées, celles qui sont
  // éprouvées (tiennent, ou montent) remontent en tête · on clone ce qui est
  // prouvé, pas le énième lancement. À égalité, la plus ancienne (donc la plus
  // installée) passe devant.
  const ordered = [...events].sort((a, b) =>
    (estGagnantVeille(b.ad) ? 1 : 0) - (estGagnantVeille(a.ad) ? 1 : 0)
    || (b.ad.daysRunning ?? 0) - (a.ad.daysRunning ?? 0),
  );

  const scan = () => start(async () => {
    setMsg(null);
    const r = await scanTrackerAction();
    if (r.error) setMsg('Scan indisponible pour le moment.');
    else if (!r.scanned) setMsg('Aucune marque suivie à scanner.');
    else setMsg(r.newAds ? `${r.newAds} nouvelle(s) pub(s) détectée(s) !` : 'Rien de neuf depuis le dernier scan.');
    router.refresh();
  });

  const markSeen = () => start(async () => {
    const vues = events.filter((e) => e.unseen).map(cleEvt);
    await markTrackerSeenAction();
    setVuesIci((s) => new Set([...s, ...vues]));
    toast('Tout marqué comme vu.');
    // Le bouton cliqué disparaît · le focus va au titre du fil, pas sur <body>.
    requestAnimationFrame(() => titreRef.current?.focus());
    router.refresh();
  });

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 ref={titreRef} tabIndex={-1} style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0, outlineOffset: 4 }}>
          Nouveautés des concurrents
          {unseen > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: 'var(--on-accent)', background: 'var(--grad-accent)', borderRadius: 999, padding: '2px 8px' }}>{unseen} nouveau{unseen > 1 ? 'x' : ''}</span>}
        </h2>
        <span style={{ flex: 1 }} />
        {unseen > 0 && <button type="button" onClick={markSeen} disabled={busy} style={{ ...ghostBtn, minHeight: cible }}>Tout marquer vu</button>}
        <button type="button" onClick={scan} disabled={busy || !etatScan.actif} title={etatScan.raison ?? undefined} aria-describedby={etatScan.raison ? 'scan-raison' : undefined} style={{
          minHeight: cible, padding: '9px 16px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: busy || !etatScan.actif ? 'default' : 'pointer',
          background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: busy || !etatScan.actif ? .6 : 1,
        }}>{busy ? 'Scan en cours…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="radar" size={14} /> Scanner maintenant</span>}</button>
      </div>

      {msg && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', color: '#f5b043' }}>{msg}</div>}

      {etatScan.raison && followedCount > 0 && (
        <p id="scan-raison" style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>
          Scan indisponible · {etatScan.raison}
        </p>
      )}

      {events.length === 0 ? (
        followedCount ? (
          <Empty
            tone="wait" title="Aucune nouveauté pour l’instant."
            why="Lance un scan pour détecter les dernières pubs de tes marques suivies."
          />
        ) : (
          <Empty
            tone="todo" title="Aucune marque suivie."
            why="Suis des marques dans la veille pour surveiller leurs nouvelles pubs ici."
            action={{ label: 'Ouvrir la veille', href: '/veille' }}
          />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
          {ordered.map((e, i) => {
            const evenements = evenementsConcurrent(e.ad, { nouveau: nonVu(e) });
            return (
              <div key={e.ad.platform + e.ad.id + i} style={{ position: 'relative' }}>
                {evenements.length > 0 && (
                  <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    {evenements.map((ev) => <BadgeEvenement key={ev} evenement={ev} />)}
                  </div>
                )}
                <AdCard ad={e.ad} cibles44={tactile} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const ghostBtn = { padding: '8px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' } as const;

/**
 * Le badge d'un événement de veille · sa couleur dit sa nature. La diffusion
 * durable et la croissance signalent un gagnant à cloner (accentué) · la
 * nouveauté reste neutre · elle dit « pas encore vue », pas « prouvée ».
 */
export function BadgeEvenement({ evenement }: { evenement: EvenementConcurrent }) {
  const fond: Record<EvenementConcurrent, string> = {
    diffusion_durable: 'var(--grad-accent)',
    croissance: 'linear-gradient(135deg, #1f9d63, #16794c)',
    nouveaute: 'var(--ink-2)',
  };
  const teinte: Record<EvenementConcurrent, string> = {
    diffusion_durable: 'var(--on-accent)',
    croissance: '#fff',
    nouveaute: 'var(--paper)',
  };
  return (
    <span
      title={EVENEMENT_RAISON[evenement]}
      style={{ fontSize: 10, fontWeight: 800, color: teinte[evenement], background: fond[evenement], borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}
    >
      {EVENEMENT_LABEL[evenement]}
    </span>
  );
}
