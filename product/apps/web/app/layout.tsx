import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TikTrends Creative Intelligence',
  description: 'Creative intelligence TikTok-first pour agences et marques.',
};

// Sans ça, un mobile rend la page à ~980px de large puis dézoome · rien ne
// s'adapte, tout est minuscule. C'est le socle de tout le responsive.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
