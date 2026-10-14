import 'server-only';
import {
  accesTotal, permissionsStudio, restreindrePlateforme, aPermissionPlateforme, estRoleEspace,
  type DroitsAdministration,
} from '@tiktrends/core';
import { roleAtLeast, sectionsCompteOuvertes } from './rbac';
import { effectiveAccess } from './access';
import { isFounder } from './founder';
import { refusJarvis } from './jarvis-acces';
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
 * Les clés du menu de compte que la garde réelle ouvre (`sectionsCompteOuvertes`,
 * lot 12) · un membre ou un lecteur n'en a aucune de la section « Espace ».
 */
export function menuCompteOuvert(s: SessionDroits): Set<string> {
  return new Set(sectionsCompteOuvertes(effectiveAccess(s)).flatMap((g) => g.items.map((i) => i.key)));
}

export function droitsAdministration(s: SessionDroits): DroitsAdministration {
  const adminEspace = roleAtLeast(s.role, 'admin');
  const roleEquipe = s.equipe?.role ?? null;
  // Même calcul que `gardePlateforme` (lib/studios/prompts/garde-prompts) via
  // `contexteDepuisSession` · les permissions de portée plateforme ne
  // dépendent ni des marques ni de l'ouverture du studio.
  const plateforme = restreindrePlateforme(
    permissionsStudio({ roleEspace: estRoleEspace(s.role) ? s.role : 'client_viewer', studioOuvert: false, roleEquipe }),
    s.equipe?.plateformeAdmissible === true,
  );
  return {
    fondateur: adminEspace && isFounder(s.user.email),
    adminEspace,
    accesTotalEquipe: !!s.equipe && accesTotal(s.equipe.role),
    plateforme: aPermissionPlateforme(plateforme, 'prompt.read') && aPermissionPlateforme(plateforme, 'provider.configure'),
    jarvis: refusJarvis(s) === null,
  };
}
