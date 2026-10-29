import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { COULEUR_BARRE, COULEUR_BARRE_SPATIALE, ENTETE_SECTION, THEME_COOKIE, couleurBarreViewport, preferenceDepuisCookie, scriptThemeAuto, sectionValide, type PreferenceTheme, type SectionSpatiale } from '@tiktrends/core';
import { RAIL_COOKIE, railCollapsedFromCookie } from '../lib/rail-preference';
// Aucune feuille de style ici · chaque arbre apporte la sienne. L'ancienne
// interface importe `globals.css` dans ses segments, l'arbre Spatial n'importe
// que celle de la maquette (`app/(spatial)/layout.tsx`). Les deux ne se
// mélangent jamais (garde `spatial-fondation`).

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

/** V5 · A4a · la préférence de thème, lue AU RENDU SERVEUR dans le cookie
 *  `tt_theme` (règle du noyau · « clair » et « auto » exacts, le défaut est
 *  sombre). */
async function preferenceDemandee(): Promise<PreferenceTheme> {
  return preferenceDepuisCookie((await cookies()).get(THEME_COOKIE)?.value);
}

/** Spatial · la section d'accent posée par le middleware sur un écran porté (sinon `null`). */
async function sectionSpatiale(): Promise<SectionSpatiale | null> {
  return sectionValide((await headers()).get(ENTETE_SECTION));
}


// Sans `width`, un mobile rend la page à ~980px de large puis dézoome · rien ne
// s'adapte, tout est minuscule. C'est le socle de tout le responsive.
// La couleur de barre du navigateur suit le thème (`--bg` de chaque palette) ·
// en « auto », une couleur par réglage de l'appareil (`media`).
export async function generateViewport(): Promise<Viewport> {
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: couleurBarreViewport(await preferenceDemandee(), (await sectionSpatiale()) ? COULEUR_BARRE_SPATIALE : COULEUR_BARRE),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // L'attribut part avec le PREMIER octet du document · les jetons de
  // `tokens.css` s'appliquent avant toute peinture, aucun flash de thème.
  // En « auto », `data-theme="auto"` est résolu en `clair` / `sombre` par le
  // script de `<head>` (`scriptThemeAuto`), exécuté avant la peinture du corps ;
  // le script est toujours posé (il suit l'appareil si la personne passe en
  // « auto » sans recharger). `suppressHydrationWarning` · le script a changé
  // `data-theme` avant l'hydratation, c'est voulu.
  const preference = await preferenceDemandee();
  // Spatial · section d'accent et rail déplié posés dès le premier octet
  // (`body[data-sec]`, `body.rail-open` de la maquette) · aucun saut visuel.
  const section = await sectionSpatiale();
  const railOuvert = section ? !railCollapsedFromCookie((await cookies()).get(RAIL_COOKIE)?.value) : false;
  return (
    <html lang="fr" data-theme={preference} data-theme-pref={preference} suppressHydrationWarning>
      <head>
        <script id="tt-theme-auto" dangerouslySetInnerHTML={{ __html: scriptThemeAuto(section ? COULEUR_BARRE_SPATIALE : COULEUR_BARRE) }} />
      </head>
      <body data-sec={section ?? undefined} className={railOuvert ? 'rail-open' : undefined}>{children}</body>
    </html>
  );
}
