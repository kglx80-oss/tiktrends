import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '../lib/auth';
import { Landing } from './Landing';

export const dynamic = 'force-dynamic';

const TITLE = 'TikTrends · Trouve tes créatives gagnantes plus vite';
const DESCRIPTION =
  'Génère des publicités statiques et vidéo, teste par lots et laisse la donnée trancher. La création publicitaire en boucle fermée · tu ne scales que les gagnantes.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://app.tiktrends.co/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'TikTrends',
    url: 'https://app.tiktrends.co/',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const s = await getSession();
  if (s) redirect('/dashboard');
  return <Landing />;
}
