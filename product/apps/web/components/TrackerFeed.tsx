'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InspoAd } from '@tiktrends/integrations';
import { AdCard } from './AdCard';
import { scanTrackerAction, markTrackerSeenAction } from '../app/actions/tracker';

export interface TrackerEvent { ad: InspoAd; advertiserName: string; unseen: boolean }

/**
 * Fil « nouveautés des concurrents » : détecte et affiche les nouvelles pubs des
 * marques suivies. Scan à la demande + rendu des créas détectées (les plus récentes).
 */
export function TrackerFeed({ events, followedCount, trackingEnabled }: { events: TrackerEvent[]; followedCount: number; trackingEnabled: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const unseen = events.filter((e) => e.unseen).length;

  const scan = () => start(async () => {
    setMsg(null);
    const r = await scanTrackerAction();
    if (r.error) setMsg('Scan indisponible pour le moment.');
    else if (!r.scanned) setMsg('Aucune marque suivie à scanner.');
    else setMsg(r.newAds ? `${r.newAds} nouvelle(s) pub(s) détectée(s) !` : 'Rien de neuf depuis le dernier scan.');
    router.refresh();
  });

  const markSeen = () => start(async () => { await markTrackerSeenAction(); router.refresh(); });

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          Nouveautés des concurrents
          {unseen > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#0d070c', background: 'var(--grad-accent)', borderRadius: 999, padding: '2px 8px' }}>{unseen} nouveau{unseen > 1 ? 'x' : ''}</span>}
        </h2>
        <span style={{ flex: 1 }} />
        {unseen > 0 && <button type="button" onClick={markSeen} disabled={busy} style={ghostBtn}>Tout marquer vu</button>}
        <button type="button" onClick={scan} disabled={busy || !followedCount} title={!followedCount ? 'Suis d\'abord des marques dans l\'Inspo' : undefined} style={{
          padding: '9px 16px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: busy || !followedCount ? 'default' : 'pointer',
          background: 'var(--grad-accent)', color: '#0d070c', opacity: busy || !followedCount ? .6 : 1,
        }}>{busy ? 'Scan en cours…' : '🛰️ Scanner maintenant'}</button>
      </div>

      {msg && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', color: '#f5b043' }}>{msg}</div>}

      {!trackingEnabled && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>
          La veille auto s'active dès que la bibliothèque de pubs (Trendtrack) est branchée côté serveur.
        </p>
      )}

      {events.length === 0 ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {followedCount ? 'Aucune nouveauté pour l\'instant. Lance un scan pour détecter les dernières pubs de tes marques suivies.' : 'Suis des marques dans l\'Inspo (« + Suivre ») pour surveiller leurs nouvelles pubs ici.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
          {events.map((e, i) => (
            <div key={e.ad.platform + e.ad.id + i} style={{ position: 'relative' }}>
              {e.unseen && <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 3, fontSize: 10, fontWeight: 800, color: '#0d070c', background: 'var(--grad-accent)', borderRadius: 999, padding: '2px 8px' }}>NOUVEAU</span>}
              <AdCard ad={e.ad} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const ghostBtn = { padding: '8px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' } as const;
