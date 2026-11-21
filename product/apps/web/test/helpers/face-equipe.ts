import { effectiveAccess } from '../../lib/access';
import type { FaceEquipe } from '../../lib/rbac';
import type { MatriceDroits, RolePlateforme } from '@tiktrends/core';

/**
 * Une face « équipe » pour éprouver `rbac` · RECONNUE, parce qu'elle sort de
 * `effectiveAccess` lui-même, pour un compte d'équipe admissible (le même
 * chemin que la production · `privilegesEquipe`, gel, inscription au
 * registre). Aucun cast · une face forgée ici vaudrait face client, comme en
 * production (suite de #1122).
 */
export function faceEquipeTest(role: RolePlateforme, matrice: MatriceDroits = {}): FaceEquipe {
  const acces = effectiveAccess({ role: 'member', plan: 'starter', user: { email: 'equipe-de-test@tiktrends.invalid' }, equipe: { role, matrice, plateformeAdmissible: true } });
  if (!acces.equipe) throw new Error(`faceEquipeTest · effectiveAccess n’a pas posé de face équipe pour « ${role} » · la règle d’admissibilité a changé`);
  return acces.equipe;
}
