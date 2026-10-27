import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * L'ancien écran « Jarvis » d'Adsmap a déménagé vers `/jarvis` · comme la page
 * V5, une redirection plutôt qu'un 404 (le lien a pu être mis en favori).
 */
export default function JarvisAdsmapSpatial() {
  redirect('/jarvis');
}
