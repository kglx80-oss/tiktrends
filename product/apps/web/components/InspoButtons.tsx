'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InspoAd } from '@tiktrends/integrations';
import { saveAd, unsaveAd, followBrand, unfollowBrand } from '../app/actions/inspo';

export function SaveButton({ ad, initialSaved }: { ad: InspoAd; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [, start] = useTransition();
  return (
    <button type="button" title={saved ? 'Retirer des sauvegardes' : 'Sauvegarder'}
      onClick={() => {
        const next = !saved;
        setSaved(next); // optimiste
        start(async () => {
          try {
            if (next) await saveAd({ platform: ad.platform, externalId: ad.id, snapshot: ad });
            else await unsaveAd({ platform: ad.platform, externalId: ad.id });
          } catch { setSaved(!next); }
        });
      }}
      style={{ width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer', background: saved ? 'var(--grad-accent)' : 'rgba(0,0,0,.65)', color: '#fff', fontSize: 14, lineHeight: 1 }}>
      {saved ? '★' : '☆'}
    </button>
  );
}

export function FollowButton({ ad, initialFollowing }: { ad: InspoAd; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [, start] = useTransition();
  if (!ad.advertiserName) return null;
  return (
    <button type="button"
      onClick={() => {
        const next = !following;
        setFollowing(next);
        start(async () => {
          try {
            if (next) await followBrand({ platform: ad.platform, name: ad.advertiserName!, externalId: ad.advertiserId, logoUrl: ad.advertiserLogo });
            else await unfollowBrand({ platform: ad.platform, name: ad.advertiserName! });
          } catch { setFollowing(!next); }
        });
      }}
      style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--line-2)', background: following ? 'var(--accent-soft)' : 'transparent', color: following ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
      {following ? '✓ Suivi' : '+ Suivre'}
    </button>
  );
}

/** Retrait d'une marque suivie (page Sauvegardes) — rafraîchit la liste après coup. */
export function BrandRemoveButton({ platform, name }: { platform: string; name: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button type="button" title="Ne plus suivre"
      onClick={() => { setGone(true); start(async () => { try { await unfollowBrand({ platform, name }); router.refresh(); } catch { setGone(false); } }); }}
      style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>
      ✕
    </button>
  );
}
