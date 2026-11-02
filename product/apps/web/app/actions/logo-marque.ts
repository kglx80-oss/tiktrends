'use server';

import { empreinteDuLogo, logoParDefautAffiche, type LogoParDefautAffiche } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { roleAtLeast } from '../../lib/rbac';
import { etatLogoParDefaut } from '../../lib/logos-charte-etat';

/**
 * Coquille · le logo de la marque active n'a pas pu s'afficher · pourquoi ?
 * Même bilan que la fiche Identité (`etatLogoParDefaut`, mêmes bornes) · un
 * `HEAD` signé (If-Match) au plus, aucun pour un logo sans empreinte. Lecture
 * seule · rien n'est écrit. `null` sans session, ou pour une marque qui n'est
 * pas la marque active de l'espace.
 */
export async function etatLogoMarqueActive(entree: { brandId: unknown }): Promise<LogoParDefautAffiche | null> {
  const s = await getSession();
  if (!s) return null;
  // La marque active, relue dans l'espace de la session (logo et empreintes compris).
  const active = await getActiveBrand(s.workspaceId);
  if (!active || typeof entree?.brandId !== 'string' || active.id !== entree.brandId) return null;
  if (!active.logoUrl || !empreinteDuLogo(active.logoEmpreintes, active.logoUrl)) return { image: true, signal: null };
  const bilan = await etatLogoParDefaut({ workspaceId: s.workspaceId, logoUrl: active.logoUrl, logoEmpreintes: active.logoEmpreintes });
  return logoParDefautAffiche({ bilan, brandId: active.id, peutGerer: roleAtLeast(s.role, 'admin') });
}
