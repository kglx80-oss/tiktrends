'use client';

import { useState } from 'react';
import { apercuAsset } from '../lib/apercu-asset';
import { Icon, iconForAssetKind } from './Icon';

const cadre: React.CSSProperties = { aspectRatio: '1 / 1', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
const media: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };

/**
 * La miniature d'un asset de la bibliothèque · vraie vignette, image, vidéo, ou repli.
 *
 * ── La cascade, et pourquoi elle existe ──────────────────────────────────────
 *
 * Un fichier Drive (surtout une vidéo, mais aussi une image trop lourde) n'a
 * pour adresse que le lien `drive.google.com/…/view` · une page HTML qu'aucune
 * balise `<img>` ni `<video>` ne sait afficher. On voyait donc l'icône de repli
 * à la place du vrai visuel · c'est LE reproche répété sur les assets.
 *
 * `thumbUrl` est la vraie vignette Drive (images ET vidéos), persistée sur notre
 * bucket à la synchro · une adresse publique, permanente, légère. On l'essaie
 * d'abord. Si elle manque ou casse, on retombe sur l'ancien affichage par type,
 * qui retombe lui-même sur l'icône. Jamais cassé, toujours le meilleur visuel
 * disponible.
 *
 * La décision par type vit dans `apercuAsset` (pure, testée) · ici on la rend.
 */
export function MiniatureAsset({ kind, url, thumbUrl, name, cadreStyle }: {
  kind: string;
  url: string;
  /** Vraie vignette Drive (bucket) · essayée en premier, pour images ET vidéos. */
  thumbUrl?: string | null;
  name: string;
  /** Ajustement du cadre · sert à réutiliser la miniature dans un sélecteur de
   *  taille fixe (le picker d'Assets) et pas seulement dans la grille. */
  cadreStyle?: React.CSSProperties;
}) {
  const [cassee, setCassee] = useState(false);
  const [thumbCassee, setThumbCassee] = useState(false);
  const vignette = !!thumbUrl && !thumbCassee;
  const quoi = apercuAsset(kind, cassee);
  return (
    <div style={{ ...cadre, ...cadreStyle }}>
      {vignette && <img src={thumbUrl!} alt={name} loading="lazy" decoding="async" onError={() => setThumbCassee(true)} style={media} />}
      {!vignette && quoi === 'image' && <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setCassee(true)} style={media} />}
      {!vignette && quoi === 'video' && <video src={url} muted playsInline preload="metadata" onError={() => setCassee(true)} style={media} />}
      {!vignette && quoi === 'icone' && <span style={{ color: 'var(--muted)' }}><Icon name={iconForAssetKind(kind)} size={34} /></span>}
    </div>
  );
}
