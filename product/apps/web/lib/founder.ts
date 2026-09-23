import 'server-only';

/**
 * Fondateur = accès à la vue plateforme d'ADMIN+ (MRR, churn, tous les espaces),
 * et — via `effectiveAccess` — l'usage de TOUT le produit quel que soit le plan
 * de son espace. Réservé au niveau plateforme : un admin d'espace client ne doit
 * jamais voir les données globales.
 *
 * ── Les fondateurs sont inscrits ICI, dans le code ───────────────────────────
 *
 * Sur autorisation explicite du propriétaire · c'est le moyen robuste de les
 * activer : un simple déploiement suffit (le dépôt est tiré et redéployé), sans
 * éditer l'environnement du VPS ni redémarrer le service à la main — ce qu'un
 * `.env.deploy` exige et qui, en pratique, ne prenait pas. `FOUNDER_EMAILS`
 * reste utilisable pour AJOUTER des fondateurs sans redéployer · les deux sources
 * sont UNIES. La liste est EXACTE et volontairement courte · chaque entrée voit
 * les données de tous les espaces clients.
 */
const FONDATEURS = [
  'kguilbaux@agence-glx.fr',
  'marine@agence-melie.fr',
].map((e) => e.toLowerCase());

export function founderEmails(): string[] {
  const env = (process.env.FOUNDER_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...FONDATEURS, ...env])];
}

export function isFounder(email?: string | null): boolean {
  if (!email) return false;
  return founderEmails().includes(email.trim().toLowerCase());
}
