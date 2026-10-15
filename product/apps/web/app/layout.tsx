import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { COULEUR_BARRE, THEME_COOKIE, themeDepuisCookie, type Theme } from '@tiktrends/core';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.tiktrends.co'),
  title: {
    default: 'TikTrends · La créative devient une science',
    template: '%s · TikTrends',
  },
  description: 'Génère des publicités statiques et vidéo, teste par lots et laisse la donnée trancher. La création publicitaire en boucle fermée.',
  applicationName: 'TikTrends',
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
  // Marque blanche · aucune requête vers un tiers ne doit trahir l'hôte réel.
  // Les favicons de sites (avatars de marques/concurrents) partent vers Google ·
  // sans politique, le navigateur y joint `Referer: app.tiktrends.co/…`. En
  // `same-origin`, les navigations INTERNES gardent leur référent (attribution,
  // retours d'écran), mais rien ne fuit vers un tiers cross-origin.
  referrer: 'same-origin',
};

/** V5 · A4a · le thème demandé, lu AU RENDU SERVEUR dans le cookie `tt_theme`
 *  (règle du noyau · seul « clair » vaut clair, le défaut est sombre). */
async function themeDemande(): Promise<Theme> {
  return themeDepuisCookie((await cookies()).get(THEME_COOKIE)?.value);
}

// Sans `width`, un mobile rend la page à ~980px de large puis dézoome · rien ne
// s'adapte, tout est minuscule. C'est le socle de tout le responsive.
// La couleur de barre du navigateur suit le thème (`--bg` de chaque palette).
export async function generateViewport(): Promise<Viewport> {
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: COULEUR_BARRE[await themeDemande()],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // L'attribut part avec le PREMIER octet du document · les jetons de
  // `tokens.css` s'appliquent avant toute peinture, aucun flash de thème.
  const theme = await themeDemande();
  return (
    <html lang="fr" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
