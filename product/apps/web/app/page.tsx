import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '../lib/auth';
import { Landing } from './Landing';

export const dynamic = 'force-dynamic';

const TITLE = 'TikTrends · Trouve tes créatives gagnantes plus vite';
const DESCRIPTION =
  'Génère des publicités statiques et vidéo, teste par lots et laisse la donnée trancher. La création publicitaire en boucle fermée · tu ne scales que les gagnantes.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    'créatives publicitaires',
    'publicité IA',
    'création vidéo IA',
    'test créatives',
    'A/B testing créatives',
    'veille publicitaire',
    'Adsmap',
    'UGC',
    'TikTok Ads',
    'Meta Ads',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'TikTrends',
    url: '/',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const s = await getSession();
  if (s) redirect('/dashboard');
  return <Landing />;
}
