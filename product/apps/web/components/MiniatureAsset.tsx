'use client';

import { useState } from 'react';
import { apercuAsset } from '../lib/apercu-asset';

const cadre: React.CSSProperties = { aspectRatio: '1 / 1', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
const media: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };

/**
 * La miniature d'un asset de la bibliothèque · image, vidéo, ou repli.
 *
 * Un asset dont l'URL ne charge plus affichait l'icône « image cassée » du
 * navigateur. `onError` fait basculer sur l'icône de type · propre, jamais
 * cassé. La décision d'affichage vit dans `apercuAsset` (pure) · ici on la rend.
 */
export function MiniatureAsset({ kind, url, name, icon, cadreStyle }: {
  kind: string;
  url: string;
  name: string;
  icon: string;
  /** Ajustement du cadre · sert à réutiliser la miniature dans un sélecteur de
   *  taille fixe (le picker d'Assets) et pas seulement dans la grille. */
  cadreStyle?: React.CSSProperties;
}) {
  const [cassee, setCassee] = useState(false);
  const quoi = apercuAsset(kind, cassee);
  return (
    <div style={{ ...cadre, ...cadreStyle }}>
      {quoi === 'image' && <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setCassee(true)} style={media} />}
      {quoi === 'video' && <video src={url} muted playsInline preload="metadata" onError={() => setCassee(true)} style={media} />}
      {quoi === 'icone' && <span style={{ fontSize: 40 }}>{icon}</span>}
    </div>
  );
}
