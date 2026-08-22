import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TikTrends Creative Intelligence',
  description: 'Creative intelligence TikTok-first pour agences et marques.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
