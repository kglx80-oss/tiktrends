/**
 * Icônes officielles des outils (logos vectoriels) pour les connecteurs et les assets.
 * Chaque icône est auto-colorée : à poser sur une pastille claire pour une lisibilité constante.
 */
import type { CSSProperties } from 'react';

type P = { size?: number };
const box = (size: number): CSSProperties => ({ width: size, height: size, display: 'block' });

export function MetaIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 640 512" style={box(size)} aria-hidden>
      <path fill="#0668E1" d="M640 317.9C640 409.2 600.6 466.4 529.7 466.4C467.1 466.4 433.9 431.8 372.8 329.8L341.4 277.2C333.1 264.7 326.9 253.1 320.6 242.5C289.9 292.5 262.5 342.6 262.5 342.6C205.7 442.6 165.2 466.4 111.2 466.4C38.62 466.4 0 409.1 0 320.2C0 174.4 82.32 45.61 191.1 45.61C247.9 45.61 292.7 78.85 344.1 155.5C378.1 96.55 425.5 45.61 480.1 45.61C588.6 45.61 640 143.9 640 317.9zM287.7 238.2C264.9 199.5 240.3 168.4 207.9 168.4C157.9 168.4 116.9 258.5 116.9 331.6C116.9 359.7 127.1 375.5 145.2 375.5C169.2 375.5 190.1 358.6 219.7 306.3C219.7 306.3 251.3 251.7 287.7 238.2zM479.8 168.4C447.6 168.4 415.1 209.2 386.9 267.3C401.6 291.1 415.6 316.9 432.1 344.7L432.5 345.4C471.4 410.4 486.8 424.9 512.7 424.9C542.5 424.9 558.5 400.3 558.5 358.6C558.5 265.4 522.8 168.4 479.8 168.4z" />
    </svg>
  );
}

export function FacebookIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.875 11.854v-8.385H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.313 0 2.686.235 2.686.235v2.953H15.83c-1.49 0-1.955.925-1.955 1.874V12h3.328l-.532 3.469h-2.796v8.385A12.002 12.002 0 0 0 24 12z" />
    </svg>
  );
}

export function InstagramIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <defs>
        <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" /><stop offset="5%" stopColor="#fdf497" /><stop offset="45%" stopColor="#fd5949" /><stop offset="60%" stopColor="#d6249f" /><stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <path fill="url(#ig-g)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38C1.35 2.68.93 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13.67.66 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.13-1.38.66-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.93 19.86.63 19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zM12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm6.4-10.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44z" />
    </svg>
  );
}

export function ShopifyIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 448 512" style={box(size)} aria-hidden>
      <path fill="#95BF47" d="M388.32 104.1a4.66 4.66 0 0 0-4.4-4c-2 0-37.23-.8-37.23-.8s-21.61-20.82-29.62-28.83c-3.2-3.2-9.61-2.4-12-1.6-.4.4-6.81 2-17.61 5.61-10.41-30-28.82-57.63-61.24-57.63h-2.8C215 6.45 204.6.85 196.19.85c-66.45.4-98.27 83.27-108.28 125.28-25.62 8-44 13.61-46.43 14.41-14.41 4.4-14.81 4.8-16.42 18.42C23.86 169 0 359.02 0 359.02L346.09 512l188.28-40.83S388.72 106.5 388.32 104.1zM271.83 76.86l-28.42 8.81v-6c0-17.62-2.4-32-6.41-43.63 16.42 2.4 27.22 20.42 34.83 40.82zm-56.44-37.23c4.4 11.21 7.21 27.22 7.21 48.83v3.2c-18.42 5.61-38.43 12-58.44 18.42 11.21-42.82 32.42-63.64 51.23-70.45zM192.79 21.62c3.6 0 7.21 1.2 10.41 3.6-24.82 11.62-51.24 40.83-62.44 99.07l-46.03 14.4C107.94 96.47 134.96 21.62 192.79 21.62z" />
    </svg>
  );
}

export function GoogleDriveIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 87.3 78" style={box(size)} aria-hidden>
      <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" />
      <path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
      <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

export function GoogleIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.4 5.4 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.86 11.86 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

export function TikTokIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#25F4EE" d="M9.42 8.9v-.86a6.6 6.6 0 0 0-.9-.06A6.53 6.53 0 0 0 5 19.65a6.53 6.53 0 0 1 4.42-10.75z" />
      <path fill="#FE2C55" d="M16.9 6.3a3.75 3.75 0 0 1-.94-2.47h-1.13a3.77 3.77 0 0 0 2.07 2.47zM10.34 12.13a2.98 2.98 0 0 0-1.37 5.62 2.98 2.98 0 0 1 2.6-4.44c.28 0 .55.05.81.13v-3.4a6.6 6.6 0 0 0-.9-.06h-.16v2.6a2.98 2.98 0 0 0-.98-.5z" />
      <path fill="#000" d="M17.97 6.3a5.02 5.02 0 0 0 2.94.94V6.13a3 3 0 0 1-.94-.16 3.77 3.77 0 0 1-3.05-1.96h-1.06v11.05a2.98 2.98 0 0 1-5.36 1.79 2.98 2.98 0 0 0 5.16-2.04V6.14a5.02 5.02 0 0 0 2.31.16z" />
      <path fill="#000" d="M20.91 7.24v-.01a5.02 5.02 0 0 1-2.94-.93v9.66a5.15 5.15 0 0 1-5.15 5.15 5.12 5.12 0 0 1-2.85-.86 5.15 5.15 0 0 0 8.94-3.47V8.18a5.02 5.02 0 0 0 2.94.94V7.24z" />
    </svg>
  );
}

export function YouTubeIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#FF0000" d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8z" />
      <path fill="#fff" d="M9.55 15.57V8.43L15.82 12z" />
    </svg>
  );
}

export function LinkedInIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function XIcon({ size = 20 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#000" d="M18.9 1.5h3.68l-8.04 9.19L24 22.5h-7.4l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.5h7.59l5.24 6.93zm-1.29 18.8h2.04L6.49 3.6H4.3z" />
    </svg>
  );
}

export function SlackIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#36C5F0" d="M5.04 15.16a2.53 2.53 0 1 1-2.52-2.53h2.52zM6.31 15.16a2.53 2.53 0 0 1 5.05 0v6.31a2.53 2.53 0 0 1-5.05 0z" />
      <path fill="#2EB67D" d="M8.84 5.04a2.53 2.53 0 1 1 2.52-2.52v2.52zM8.84 6.31a2.53 2.53 0 0 1 0 5.05H2.52a2.53 2.53 0 0 1 0-5.05z" />
      <path fill="#ECB22E" d="M18.96 8.84a2.53 2.53 0 1 1 2.52 2.52h-2.52zM17.69 8.84a2.53 2.53 0 0 1-5.05 0V2.52a2.53 2.53 0 0 1 5.05 0z" />
      <path fill="#E01E5A" d="M15.16 18.96a2.53 2.53 0 1 1-2.52 2.52v-2.52zM15.16 17.69a2.53 2.53 0 0 1 0-5.05h6.32a2.53 2.53 0 0 1 0 5.05z" />
    </svg>
  );
}

export function NotionIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#fff" stroke="#111" strokeWidth="1" d="M4.5 4 15 3.2l4.8 3.4v13L15.4 21 4.5 20.2z" />
      <path fill="#111" d="M7 7.3v9.4l1.9-.1V11l4.6 6.3 2.4-.1V8.1l-1.9.1v5.4L9.6 7.2z" />
    </svg>
  );
}

export function StripeIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <rect width="24" height="24" rx="5" fill="#635BFF" />
      <path fill="#fff" d="M11.7 9.3c0-.62.5-.86 1.34-.86 1.2 0 2.71.36 3.9 1v-3.4A10.4 10.4 0 0 0 13.04 5c-2.68 0-4.47 1.4-4.47 3.74 0 3.65 5.02 3.07 5.02 4.64 0 .73-.64.97-1.52.97-1.3 0-2.97-.53-4.29-1.26v3.45c1.46.63 2.94.9 4.29.9 2.75 0 4.64-1.36 4.64-3.73-.01-3.94-5.05-3.24-5.05-4.72z" />
    </svg>
  );
}

export function SnapchatIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <rect width="24" height="24" rx="6" fill="#FFFC00" />
      <path fill="#000" d="M12 4.4c1.9 0 3.5 1.5 3.6 3.4.03.5 0 1 .04 1.5.36.2.8.15 1.18.02.5-.17 1 .48.6.9-.3.32-.78.4-1.18.55-.24.1-.28.28-.2.5.44 1.16 1.35 2.15 2.5 2.62.42.17.34.68-.06.82-.44.16-.92.18-1.32.44-.24.4.1.9-.28 1.24-.5.2-1-.12-1.5-.03-.44.1-.66.6-1.06.82-.9.5-2.05.28-2.9-.24-.28-.16-.6-.16-.88 0-.85.52-2 .74-2.9.24-.4-.22-.62-.72-1.06-.82-.5-.09-1 .23-1.5.03-.38-.34-.04-.84-.28-1.24-.4-.26-.88-.28-1.32-.44-.4-.14-.48-.65-.06-.82 1.15-.47 2.06-1.46 2.5-2.62.08-.22.04-.4-.2-.5-.4-.15-.88-.23-1.18-.55-.4-.42.1-1.07.6-.9.38.13.82.18 1.18-.02.04-.5.01-1 .04-1.5C8.5 5.9 10.1 4.4 12 4.4z" />
    </svg>
  );
}

export function PinterestIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#E60023" d="M12 0a12 12 0 0 0-4.37 23.17c-.1-.94-.19-2.38.04-3.4.2-.9 1.32-5.6 1.32-5.6s-.34-.68-.34-1.68c0-1.57.91-2.74 2.05-2.74.97 0 1.43.72 1.43 1.59 0 .97-.62 2.42-.94 3.76-.27 1.13.57 2.05 1.68 2.05 2.01 0 3.56-2.12 3.56-5.19 0-2.71-1.95-4.6-4.73-4.6-3.22 0-5.11 2.42-5.11 4.92 0 .97.37 2.02.84 2.58.09.11.1.21.08.32-.09.36-.28 1.13-.32 1.29-.05.21-.17.26-.39.16-1.46-.68-2.37-2.8-2.37-4.51 0-3.67 2.67-7.04 7.69-7.04 4.04 0 7.18 2.88 7.18 6.72 0 4.01-2.53 7.24-6.04 7.24-1.18 0-2.29-.61-2.67-1.34l-.73 2.77c-.26 1.02-.98 2.3-1.46 3.08A12 12 0 1 0 12 0z" />
    </svg>
  );
}

export function DropboxIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#0061FF" d="M6 1.8 0 5.62l6 3.82 6-3.82zM18 1.8l-6 3.82 6 3.82 6-3.82zM0 13.26l6 3.82 6-3.82-6-3.82zM18 9.44l-6 3.82 6 3.82 6-3.82zM6 18.35l6 3.82 6-3.82-6-3.81z" />
    </svg>
  );
}

export function FigmaIcon({ size = 20 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <path fill="#0ACF83" d="M8 24a4 4 0 0 0 4-4v-4H8a4 4 0 0 0 0 8z" />
      <path fill="#A259FF" d="M4 12a4 4 0 0 1 4-4h4v8H8a4 4 0 0 1-4-4z" />
      <path fill="#F24E1E" d="M4 4a4 4 0 0 1 4-4h4v8H8a4 4 0 0 1-4-4z" />
      <path fill="#FF7262" d="M12 0h4a4 4 0 0 1 0 8h-4z" />
      <path fill="#1ABCFE" d="M20 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
    </svg>
  );
}

export function CanvaIcon({ size = 22 }: P) {
  return (
    <svg viewBox="0 0 24 24" style={box(size)} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#00C4CC" />
      <path fill="#fff" d="M15.8 14.7c-.9 1.4-2.3 2.4-3.9 2.4-2.3 0-3.8-1.9-3.8-4.6 0-3.2 2-5.7 4.5-5.7 1.5 0 2.4.9 2.4 2 0 .8-.5 1.4-1.1 1.4-.5 0-.9-.35-.9-.9 0-.5.35-.7.35-1 0-.28-.28-.45-.66-.45-1.4 0-2.5 2-2.5 4.3 0 1.9.9 3.1 2.3 3.1 1.1 0 2-.65 2.7-1.7z" />
    </svg>
  );
}

/** Registre : nom du connecteur -> icône. Correspondance souple (préfixe/contenu). */
const REGISTRY: Array<{ match: RegExp; icon: (p: P) => React.ReactElement }> = [
  { match: /^meta( ads)?/i, icon: MetaIcon },
  { match: /^facebook/i, icon: FacebookIcon },
  { match: /^instagram/i, icon: InstagramIcon },
  { match: /^shopify/i, icon: ShopifyIcon },
  { match: /google drive/i, icon: GoogleDriveIcon },
  { match: /^google( ads|$| analytics| docs| sheets| bigquery)?|search console|gmail/i, icon: GoogleIcon },
  { match: /^tiktok/i, icon: TikTokIcon },
  { match: /^youtube/i, icon: YouTubeIcon },
  { match: /^linkedin/i, icon: LinkedInIcon },
  { match: /^x \(|^twitter|^x$/i, icon: XIcon },
  { match: /^slack/i, icon: SlackIcon },
  { match: /^notion/i, icon: NotionIcon },
  { match: /^stripe/i, icon: StripeIcon },
  { match: /^snapchat/i, icon: SnapchatIcon },
  { match: /^pinterest/i, icon: PinterestIcon },
  { match: /^dropbox/i, icon: DropboxIcon },
  { match: /^figma/i, icon: FigmaIcon },
  { match: /^canva/i, icon: CanvaIcon },
];

export function brandIconFor(name: string, size = 22): React.ReactElement | null {
  const hit = REGISTRY.find((r) => r.match.test(name));
  return hit ? hit.icon({ size }) : null;
}

/**
 * Pastille normalisée : logo réel sur fond clair si connu, sinon repli sur l'initiale colorée.
 * `tile` = côté de la pastille (défaut 34).
 */
export function BrandTile({ name, color, glyph, tile = 34 }: { name: string; color?: string; glyph?: string; tile?: number }) {
  const icon = brandIconFor(name, Math.round(tile * 0.62));
  if (icon) {
    return (
      <span style={{ width: tile, height: tile, borderRadius: 9, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,.18)' }}>
        {icon}
      </span>
    );
  }
  const g = glyph ?? name.slice(0, 2);
  const dark = ['#FFFC00', '#FFE01B'].includes(color || '');
  return (
    <span style={{ width: tile, height: tile, borderRadius: 9, background: color || 'var(--line-2)', color: dark ? '#111' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: g.length > 1 ? tile * 0.35 : tile * 0.44, flexShrink: 0 }}>{g}</span>
  );
}
