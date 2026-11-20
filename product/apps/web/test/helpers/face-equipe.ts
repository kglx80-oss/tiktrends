import type { FaceEquipe } from '../../lib/rbac';
import type { MatriceDroits, RolePlateforme } from '@tiktrends/core';

/**
 * Une face « équipe » pour éprouver `rbac` SEUL (matrice, verrous) · en
 * production, seul `effectiveAccess` la construit (marque de type
 * `FaceEquipe`), sous `privilegesEquipe`.
 */
export function faceEquipeTest(role: RolePlateforme, matrice: MatriceDroits = {}): FaceEquipe {
  return { role, matrice } as FaceEquipe;
}
