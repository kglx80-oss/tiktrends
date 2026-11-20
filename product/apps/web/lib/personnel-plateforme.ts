import { voitDepensePlateforme } from '@tiktrends/core';
import type { Session } from './auth';
import { estFondateurCode } from './founder';

/**
 * La session est-elle celle du PERSONNEL de la plateforme (fondateur de la
 * liste codée, ou équipe à accès total ADMISSIBLE) ? Seul ce lecteur voit la
 * dépense IA de la plateforme et le plafond en dollars (règle
 * `voitDepensePlateforme` → `privilegesEquipe` du noyau, la même que
 * `effectiveAccess`). Un compte qui a capté un e-mail staff préinscrit (non
 * admissible) ne la voit pas.
 */
export function personnelPlateforme(s: Pick<Session, 'user' | 'equipe'> | null | undefined): boolean {
  if (!s) return false;
  return voitDepensePlateforme({ fondateurCode: estFondateurCode(s.user.email), equipe: s.equipe });
}
