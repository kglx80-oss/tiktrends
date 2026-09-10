'use client';

import { useState, useTransition } from 'react';
import type { InspoAd } from '@tiktrends/integrations';
import { decouverteMarcheAction } from '../app/actions/decouverte';
import { AdCard } from './AdCard';

/**
 * « Découvrir dans ma catégorie » · la veille qui vient à toi.
 *
 * Le radar ne surveille que les marques suivies · cette section ouvre l'autre
 * œil, sur demande. Elle affiche les créas ÉPROUVÉES de ta catégorie que tu ne
 * suis pas encore · chacune porte le bouton « Génère ta version » qui arme les
 * Pubs IA. À la demande, pas au chargement · une requête de veille à chaque
 * ouverture de page serait payée pour rien.
 */
export function DecouverteSection() {
  const [ads, setAds] = useState<InspoAd[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, start] = useTransition();

  function decouvrir() {
    if (busy) return;
    setNote('');
    start(async () => {
      const r = await decouverteMarcheAction();
      if (r.error) { setNote(r.error); setAds([]); return; }
      setAds(r.ads ?? []);
      if (r.note) setNote(r.note);
    });
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Découvrir dans ma catégorie</h2>
        <button type="button" onClick={decouvrir} disabled={busy} style={{
          fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 999, cursor: busy ? 'default' : 'pointer',
          border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: busy ? 0.6 : 1,
        }}>{busy ? 'Recherche…' : '✦ Trouver des créas éprouvées'}</button>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Les pubs qui tiennent dans ta catégorie, hors de ta veille.</span>
      </div>

      {ads && ads.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
          {ads.map((ad) => <AdCard key={ad.platform + ad.id} ad={ad} />)}
        </div>
      )}

      {note && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{note}</p>}
    </section>
  );
}
