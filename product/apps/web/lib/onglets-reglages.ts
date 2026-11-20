import 'server-only';
import {
  permissionsStudio, vueEquipeAdmin, restreindrePlateforme, aPermissionPlateforme, estRoleEspace, peutGererConnaissances,
  type DroitsSousNavAdmin,
} from '@tiktrends/core';
import { roleAtLeast } from './rbac';
import { aPouvoirsFondateur } from './founder';
import type { Session } from './auth';

/**
 * Les droits que lisent les onglets de Réglages et d'Administration (lot 4c).
 *
 * Chaque valeur est le contrôle d'une page, LU tel qu'il est écrit dans la page
 * (ou dans la garde qu'elle appelle) · rien n'est élargi, rien n'est protégé
 * ici. Les pages gardent leurs redirections et leurs écrans de refus.
 */
type SessionDroits = Pick<Session, 'role' | 'plan' | 'user' | 'equipe'>;

/**
 * Les permissions de portée plateforme de la session · même calcul que
 * `gardePlateforme` (lib/studios/prompts/garde-prompts) via
 * `contexteDepuisSession` · elles ne dépendent ni des marques ni de
 * l'ouverture du studio.
 */
function permissionsPlateforme(s: SessionDroits) {
  return restreindrePlateforme(
    permissionsStudio({ roleEspace: estRoleEspace(s.role) ? s.role : 'client_viewer', studioOuvert: false, roleEquipe: s.equipe?.role ?? null }),
    s.equipe?.plateformeAdmissible === true,
  );
}

/** Les portes que lit la sous-navigation du Tour de contrôle Spatial (SEC-10) · celles des pages, telles quelles. */
export function droitsSousNavAdmin(s: SessionDroits): DroitsSousNavAdmin {
  const plateforme = permissionsPlateforme(s);
  return {
    tour: roleAtLeast(s.role, 'admin') && aPouvoirsFondateur(s.user.email),
    promptRead: aPermissionPlateforme(plateforme, 'prompt.read'),
    providerConfigure: aPermissionPlateforme(plateforme, 'provider.configure'),
    connaissances: peutGererConnaissances(s.equipe),
    // La porte de `/admin/equipe` (`vueEquipeAdmin`) · l'écran complet seul · un compte non admissible n'y lit que son message.
    equipe: vueEquipeAdmin(s.equipe) === 'complete',
  };
}
