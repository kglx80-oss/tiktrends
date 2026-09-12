import type { Metadata, Viewport } from 'next';
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
};

// Sans ça, un mobile rend la page à ~980px de large puis dézoome · rien ne
// s'adapte, tout est minuscule. C'est le socle de tout le responsive.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#120810',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
