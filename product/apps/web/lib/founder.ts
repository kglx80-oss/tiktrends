import 'server-only';

/**
 * Fondateur = accès à la vue plateforme d'ADMIN+ (MRR, churn, tous les espaces).
 * Défini par FOUNDER_EMAILS (liste séparée par des virgules). Réservé au niveau
 * plateforme : un admin d'espace client ne doit jamais voir les données globales.
 */
export function founderEmails(): string[] {
  return (process.env.FOUNDER_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isFounder(email?: string | null): boolean {
  if (!email) return false;
  const list = founderEmails();
  // Si aucune liste n'est configurée, on n'accorde la vue plateforme à personne
  // par défaut (sécurité) · à définir via FOUNDER_EMAILS.
  return list.includes(email.trim().toLowerCase());
}
