import { roleAtLeast, type Role } from './rbac';

/**
 * Qui branche un connecteur (Meta, Shopify, Google Drive) · un ADMINISTRATEUR
 * de l'espace, comme la page Connexions (`roleAtLeast admin`) et les actions
 * de connexion (`app/actions/connections.ts`, `app/actions/drive.ts`).
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Les routes OAuth (`app/api/oauth/{meta,google,shopify}` et leurs callbacks)
 * ne vérifiaient que la session et l'espace de l'état signé · un `member` ou
 * un `client_viewer` pouvait les appeler directement et écraser les jetons de
 * la marque. Cacher le bouton ne protège rien. La règle est UNE, lue par les
 * routes ET les actions · elle n'élargit rien (le seuil reste `admin`).
 *
 * Pur · aucune base, aucun réseau.
 */
export const ROLE_MIN_CONNEXION: Role = 'admin';

export function peutBrancherConnecteur(role: Role): boolean {
  return roleAtLeast(role, ROLE_MIN_CONNEXION);
}

/** Le retour d'une route OAuth refusée · avant de signer l'état, et dans chaque callback avant l'échange du code. */
export const RETOUR_CONNEXION_REFUSEE = '/connections?e=forbidden';
