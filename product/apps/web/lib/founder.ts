import 'server-only';
import { pouvoirFondateur } from '@tiktrends/core';

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
 * éditer l'environnement du VPS ni redémarrer le service à la main. La liste
 * est EXACTE et volontairement courte · chaque entrée voit les données de tous
 * les espaces clients.
 *
 * ── `FOUNDER_EMAILS` n'ouvre plus rien (« Codé seul ») ───────────────────────
 *
 * Décision du propriétaire, suivi de #1115 (règle `pouvoirFondateur` du noyau) ·
 * une adresse de la variable sans compte pouvait être créée par n'importe qui
 * (aucun e-mail n'est vérifié), qui recevait tous les pouvoirs fondateur. Elle
 * ne sert plus qu'à dire à ce compte pourquoi il n'a rien
 * (`equipeDepuisLignes` → `messageNonAdmissible`). Pour ajouter un fondateur :
 * l'inscrire ci-dessous, ou l'inscrire dans l'équipe (`/admin/equipe`), ce qui
 * donne l'accès total d'équipe sans les pouvoirs fondateur.
 */
const FONDATEURS = [
  'kguilbaux@agence-glx.fr',
  'marine@agence-melie.fr',
].map((e) => e.toLowerCase());

const norm = (email?: string | null) => (email ?? '').trim().toLowerCase();

/** La liste CODÉE, telle quelle · lue par les tests, jamais recopiée. */
export function fondateursCodes(): readonly string[] {
  return FONDATEURS;
}

/**
 * Fondateur de la liste CODÉE · SEC-10. Seule exemption à la règle
 * d'antériorité des permissions plateforme (`equipeDeSession`), seule source
 * des pouvoirs fondateur (`aPouvoirsFondateur`).
 */
export function estFondateurCode(email?: string | null): boolean {
  const e = norm(email);
  return !!e && FONDATEURS.includes(e);
}

/**
 * Adresse de `FOUNDER_EMAILS` qui n'est PAS de la liste codée · SANS POUVOIR.
 * Lue par `equipeDepuisLignes` seul, pour poser le message qui dit à ce compte
 * pourquoi il n'a rien · un test (`secu-fondateurs-codes-sources`) refuse
 * qu'un autre fichier la lise.
 */
export function estFondateurEnvironnement(email?: string | null): boolean {
  const e = norm(email);
  if (!e || FONDATEURS.includes(e)) return false;
  return (process.env.FOUNDER_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(e);
}

/**
 * Les pouvoirs FONDATEUR (Tour de contrôle, dépenses IA, barème des crédits,
 * leviers sans paiement, bêta, stockage, diagnostic Stripe, exploitation de
 * Jarvis, crédits illimités de fondateur) · règle `pouvoirFondateur` du noyau ·
 * la liste CODÉE seule.
 */
export function aPouvoirsFondateur(email?: string | null): boolean {
  return pouvoirFondateur({ fondateurCode: estFondateurCode(email), fondateurEnvironnement: estFondateurEnvironnement(email) });
}
