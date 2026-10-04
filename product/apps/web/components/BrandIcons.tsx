/**
 * Les logos des outils tiers · UN seul composant pour toutes les tuiles
 * d'intégrations (Connexions, feuille de route, fiche marque, Assets, Analytics).
 *
 * ── Ce qu'il garantit ───────────────────────────────────────────────────────
 *
 *  · Un logo n'est rendu que s'il vient d'un tracé OFFICIEL ou de référence ·
 *    jamais dessiné à la main. La règle « quel logo pour quel nom » vit dans le
 *    noyau (`cleLogoOutil`) ; un outil sans tracé reçoit un repli EXPLICITE
 *    (monogramme teinté, `data-logo="repli"`), pas un logo approchant.
 *  · Le logo est décoratif · `aria-hidden`, le nom accessible est porté par le
 *    libellé voisin (nom de l'outil écrit à côté de chaque tuile).
 *  · Taille et fond cohérents · pastille carrée arrondie, logo à 62 % du côté,
 *    teinte officielle sur blanc, ou sur sa teinte quand elle est trop pâle
 *    pour le blanc (seuil MESURÉ · `pastilleLogo`).
 *  · Marque blanche · aucun tracé du fournisseur de données interne n'existe
 *    ici, et `cleLogoOutil` ne lui en attribue jamais.
 *
 * ── Provenance des tracés ───────────────────────────────────────────────────
 *
 *  · Logos monochromes · Simple Icons 16.33.0, CC0-1.0, recopiés à l'identique
 *    avec leur teinte officielle · voir `logos-outils.ts` (source de chaque
 *    marque citée en commentaire).
 *  · Logos multicolores (Instagram, Google, Google Drive, LinkedIn, Slack,
 *    Figma) · tracés déjà présents dans ce fichier avant le lot A (#120),
 *    conservés tels quels · conformes à la présentation officielle de ces
 *    marques ; Simple Icons ne publie pas LinkedIn ni Slack.
 *  · Retirés au lot A · les tracés approchants de Notion, Canva, Snapchat,
 *    Stripe et TikTok (dessinés, pas officiels) et le Shopify tronqué (sac sans
 *    son « S »). Notion, Snapchat, Stripe, TikTok, Shopify passent au tracé
 *    Simple Icons ; Canva (absent de Simple Icons) revient au monogramme.
 */
import type { CSSProperties, ReactElement } from 'react';
import { cleLogoOutil, encreMonogramme, pastilleLogo, type CleLogoOutil } from '@tiktrends/core';
import { TRACES_SIMPLE_ICONS } from './logos-outils';

const box = (size: number): CSSProperties => ({ width: size, height: size, display: 'block' });

/** Les logos multicolores · leur identité EST la couleur, ils se posent sur blanc. */
const MULTICOLORES: Partial<Record<CleLogoOutil, (size: number) => ReactElement>> = {
  instagram: (size) => (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden focusable="false">
      <defs>
        <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" /><stop offset="5%" stopColor="#fdf497" /><stop offset="45%" stopColor="#fd5949" /><stop offset="60%" stopColor="#d6249f" /><stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <path fill="url(#ig-g)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38C1.35 2.68.93 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13.67.66 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.13-1.38.66-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.93 19.86.63 19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zM12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm6.4-10.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44z" />
    </svg>
  ),
  google: (size) => (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden focusable="false">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.4 5.4 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.86 11.86 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  ),
  googledrive: (size) => (
    <svg viewBox="0 0 87.3 78" style={box(size)} aria-hidden focusable="false">
      <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" />
      <path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
      <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  ),
  linkedin: (size) => (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden focusable="false">
      <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  ),
  slack: (size) => (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden focusable="false">
      <path fill="#36C5F0" d="M5.04 15.16a2.53 2.53 0 1 1-2.52-2.53h2.52zM6.31 15.16a2.53 2.53 0 0 1 5.05 0v6.31a2.53 2.53 0 0 1-5.05 0z" />
      <path fill="#2EB67D" d="M8.84 5.04a2.53 2.53 0 1 1 2.52-2.52v2.52zM8.84 6.31a2.53 2.53 0 0 1 0 5.05H2.52a2.53 2.53 0 0 1 0-5.05z" />
      <path fill="#ECB22E" d="M18.96 8.84a2.53 2.53 0 1 1 2.52 2.52h-2.52zM17.69 8.84a2.53 2.53 0 0 1-5.05 0V2.52a2.53 2.53 0 0 1 5.05 0z" />
      <path fill="#E01E5A" d="M15.16 18.96a2.53 2.53 0 1 1-2.52 2.52v-2.52zM15.16 17.69a2.53 2.53 0 0 1 0-5.05h6.32a2.53 2.53 0 0 1 0 5.05z" />
    </svg>
  ),
  figma: (size) => (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden focusable="false">
      <path fill="#0ACF83" d="M8 24a4 4 0 0 0 4-4v-4H8a4 4 0 0 0 0 8z" />
      <path fill="#A259FF" d="M4 12a4 4 0 0 1 4-4h4v8H8a4 4 0 0 1-4-4z" />
      <path fill="#F24E1E" d="M4 4a4 4 0 0 1 4-4h4v8H8a4 4 0 0 1-4-4z" />
      <path fill="#FF7262" d="M12 0h4a4 4 0 0 1 0 8h-4z" />
      <path fill="#1ABCFE" d="M20 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
    </svg>
  ),
};

/** Un logo monochrome Simple Icons, dans la teinte demandée. */
function TraceSimple({ cle, size, trait }: { cle: keyof typeof TRACES_SIMPLE_ICONS; size: number; trait?: string }) {
  const t = TRACES_SIMPLE_ICONS[cle];
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden focusable="false">
      <path fill={trait ?? t.hex} d={t.d} />
    </svg>
  );
}

function estSimple(cle: CleLogoOutil): cle is keyof typeof TRACES_SIMPLE_ICONS {
  return cle in TRACES_SIMPLE_ICONS;
}

/** Les outils dont un logo est réellement embarqué (tracé disponible). */
export function logoDisponible(cle: CleLogoOutil): boolean {
  return estSimple(cle) || !!MULTICOLORES[cle];
}

/**
 * Le logo nu d'un outil (sans pastille), dans sa teinte officielle · pour un
 * titre ou un bouton (« Connecter Google Drive »). `null` si aucun tracé.
 */
export function LogoOutil({ cle, size = 22 }: { cle: CleLogoOutil; size?: number }) {
  if (estSimple(cle)) return <TraceSimple cle={cle} size={size} />;
  const multi = MULTICOLORES[cle];
  return multi ? multi(size) : null;
}

export function MetaIcon({ size = 22 }: { size?: number }) {
  return <LogoOutil cle="meta" size={size} />;
}
export function ShopifyIcon({ size = 22 }: { size?: number }) {
  return <LogoOutil cle="shopify" size={size} />;
}
export function GoogleDriveIcon({ size = 22 }: { size?: number }) {
  return <LogoOutil cle="googledrive" size={size} />;
}

const tuile = (tile: number, fond: string): CSSProperties => ({
  width: tile, height: tile, borderRadius: 9, background: fond, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,.18)',
});

/**
 * La pastille d'un outil · son logo officiel s'il existe, sinon un monogramme
 * teinté de sa couleur (repli explicite). Décorative (`aria-hidden`) · le nom
 * de l'outil est TOUJOURS écrit à côté par l'appelant.
 * `tile` = côté de la pastille (défaut 34).
 */
export function BrandTile({ name, color, glyph, tile = 34 }: { name: string; color?: string; glyph?: string; tile?: number }) {
  const cle = cleLogoOutil(name);
  const taille = Math.round(tile * 0.62);
  if (cle && estSimple(cle)) {
    const { fond, trait } = pastilleLogo(TRACES_SIMPLE_ICONS[cle].hex);
    return (
      <span aria-hidden data-logo="officiel" data-outil={cle} style={tuile(tile, fond)}>
        <TraceSimple cle={cle} size={taille} trait={trait} />
      </span>
    );
  }
  const multi = cle ? MULTICOLORES[cle] : undefined;
  if (cle && multi) {
    return (
      <span aria-hidden data-logo="officiel" data-outil={cle} style={tuile(tile, '#fff')}>
        {multi(taille)}
      </span>
    );
  }
  const g = glyph ?? name.slice(0, 2);
  // On borne la couleur à un hex #RRGGBB avant de l'interpoler dans le style ·
  // défense en profondeur (aucun appelant ne passe de couleur non constante
  // aujourd'hui) et garantie que le suffixe alpha `${base}cc` reste valide.
  const base = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color! : '#3a2e3a';
  return (
    <span aria-hidden data-logo="repli" style={{
      width: tile, height: tile, borderRadius: 9, flexShrink: 0,
      // Dégradé depuis la couleur officielle · la pastille prend du relief au
      // lieu d'un aplat, et reste reconnaissable à la teinte de l'outil.
      background: `linear-gradient(150deg, ${base} 0%, ${base}cc 55%, ${base}99 100%)`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,.18), 0 1px 3px rgba(0,0,0,.28)`,
      // Sur une teinte trop pâle (jaune vif), l'encre sombre reste lisible ·
      // même seuil mesuré que les pastilles de logo.
      color: encreMonogramme(base), display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: g.length > 1 ? tile * 0.35 : tile * 0.44,
      letterSpacing: g.length > 1 ? '-.02em' : 0,
    }}>{g}</span>
  );
}
