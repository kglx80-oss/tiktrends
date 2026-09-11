import { redirect } from 'next/navigation';
import { getSession } from '../lib/auth';
import { Landing } from './Landing';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  if (s) redirect('/dashboard');
  return <Landing />;
}
