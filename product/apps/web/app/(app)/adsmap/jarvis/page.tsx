import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Cet écran a déménagé vers `/jarvis`.
 *
 * Il portait toute la substance — mémoire mesurée, accroches, marché,
 * attribution — sous la navigation d'ADSMAP, pendant que l'écran qui portait le
 * nom de Jarvis n'était qu'une brochure. Les deux sont réunis là-bas.
 *
 * On garde une redirection plutôt que de supprimer la route : le lien a pu être
 * mis en favori, et un 404 sur un écran qui existait la veille se lit comme une
 * régression, pas comme un rangement.
 */
export default function LegacyJarvisPage() {
  redirect('/jarvis');
}
