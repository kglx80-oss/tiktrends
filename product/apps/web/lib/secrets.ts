// Ré-export du chiffrement partagé (packages/integrations) · même clé web + workers.
export { encryptSecret, decryptSecret } from '@tiktrends/integrations';

/** Masque un secret pour l'affichage (jamais la valeur complète). */
export function maskSecret(enc: string | null | undefined): string {
  return enc ? '••••••••' : '';
}
