'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CIBLE_TACTILE_MIN, verrouAction } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { saveAd, unsaveAd, followBrand, unfollowBrand } from '../app/actions/inspo';

/**
 * Les gestes les plus RÉPÉTÉS de la veille · sauvegarder une créa, suivre une
 * marque. Deux durcissements, tirés d'un audit du parcours :
 *
 * 1. Double-clic verrouillé. Ces boutons lançaient une action serveur sans garde :
 *    `useTransition` était appelé mais son état d'attente était jeté à la
 *    destructuration, et le bouton n'était jamais `disabled`. Un clic pressé
 *    partait deux fois et désynchronisait l'état optimiste. On garde `pending`
 *    (→ `disabled`) ET un `verrouAction` (noyau, éprouvé) tenu dans un ref et pris
 *    dans le même tick · `pending` ne bascule qu'au rendu suivant, donc lui seul
 *    ne suffit pas contre deux clics du même tick. Relâché dans un `finally`
 *    (succès comme échec).
 * 2. Cible tactile. Le ★ faisait 30×30 · sous le minimum maison (`CIBLE_TACTILE_MIN`,
 *    40 px), donc raté au doigt sous volume. On élargit la ZONE cliquable à 40 px
 *    sans grossir le visuel (pastille interne de 30).
 */

export function SaveButton({ ad, initialSaved }: { ad: InspoAd; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, start] = useTransition();
  const verrou = useRef(verrouAction());
  const basculer = () => {
    if (!verrou.current.tenter()) return;
    const next = !saved;
    setSaved(next); // optimiste
    start(async () => {
      try {
        if (next) await saveAd({ platform: ad.platform, externalId: ad.id, snapshot: ad });
        else await unsaveAd({ platform: ad.platform, externalId: ad.id });
      } catch { setSaved(!next); }
      finally { verrou.current.relacher(); }
    });
  };
  return (
    <button type="button" aria-pressed={saved} disabled={pending}
      title={saved ? 'Retirer des sauvegardes' : 'Sauvegarder'}
      onClick={basculer}
      style={{ minWidth: CIBLE_TACTILE_MIN, minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', padding: 0, cursor: pending ? 'default' : 'pointer' }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: saved ? 'var(--grad-accent)' : 'rgba(0,0,0,.65)', color: '#fff', fontSize: 14, lineHeight: 1 }}>
        {saved ? '★' : '☆'}
      </span>
    </button>
  );
}

export function FollowButton({ ad, initialFollowing }: { ad: InspoAd; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();
  const verrou = useRef(verrouAction());
  if (!ad.advertiserName) return null;
  const basculer = () => {
    if (!verrou.current.tenter()) return;
    const next = !following;
    setFollowing(next);
    start(async () => {
      try {
        if (next) await followBrand({ platform: ad.platform, name: ad.advertiserName!, externalId: ad.advertiserId, logoUrl: ad.advertiserLogo, domain: ad.landingDomain });
        else await unfollowBrand({ platform: ad.platform, name: ad.advertiserName! });
      } catch { setFollowing(!next); }
      finally { verrou.current.relacher(); }
    });
  };
  return (
    <button type="button" aria-pressed={following} disabled={pending} onClick={basculer}
      style={{ minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 999, cursor: pending ? 'default' : 'pointer', border: '1px solid var(--line-2)', background: following ? 'var(--accent-soft)' : 'transparent', color: following ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
      {following ? '✓ Suivi' : '+ Suivre'}
    </button>
  );
}

/** Retrait d'une marque suivie (page Sauvegardes) · rafraîchit la liste après coup. */
export function BrandRemoveButton({ platform, name }: { platform: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const verrou = useRef(verrouAction());
  if (gone) return null;
  const retirer = () => {
    if (!verrou.current.tenter()) return;
    setGone(true);
    start(async () => {
      try { await unfollowBrand({ platform, name }); router.refresh(); }
      catch { setGone(false); }
      finally { verrou.current.relacher(); }
    });
  };
  return (
    <button type="button" title="Ne plus suivre" disabled={pending} onClick={retirer}
      style={{ minWidth: CIBLE_TACTILE_MIN, minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: pending ? 'default' : 'pointer', fontSize: 14 }}>
      ✕
    </button>
  );
}
