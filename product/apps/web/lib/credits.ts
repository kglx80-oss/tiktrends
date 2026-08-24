import 'server-only';
import { isFounder } from './founder';

/**
 * Crédits illimités pour les comptes fondateur/créateur (FOUNDER_EMAILS).
 * Quand vrai : on ne vérifie pas le solde et on ne débite pas.
 * (Les espaces clients restent soumis au barème normal.)
 */
export function unlimitedCredits(email?: string | null): boolean {
  return isFounder(email);
}
