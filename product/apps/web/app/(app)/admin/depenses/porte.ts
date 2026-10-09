import 'server-only';
import { getSession, type Session } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';

/**
 * La porte de `/admin/depenses` · UNE règle pour la page (lecture) et pour le
 * geste de réconciliation (R5, écriture) : admin de l'espace ET fondateur
 * (plateforme). Un admin d'espace seul n'obtient aucun pouvoir de plateforme ;
 * il est arrêté ici, AVANT toute lecture ou écriture en base.
 */
export type PorteDepenses =
  | { ok: true; session: Session }
  | { ok: false; vers: '/login' | '/dashboard' | '/admin' };

export async function porteDepenses(): Promise<PorteDepenses> {
  const s = await getSession();
  if (!s) return { ok: false, vers: '/login' };
  if (!roleAtLeast(s.role, 'admin')) return { ok: false, vers: '/dashboard' };
  if (!isFounder(s.user.email)) return { ok: false, vers: '/admin' };
  return { ok: true, session: s };
}
