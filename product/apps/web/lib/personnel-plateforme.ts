import { voitDepensePlateforme } from '@tiktrends/core';
import type { Session } from './auth';
import { isFounder } from './founder';

/**
 * La session est-elle celle du PERSONNEL de la plateforme (fondateur, ou équipe
 * à accès total) ? Seul ce lecteur voit la dépense IA de la plateforme et le
 * plafond en dollars (règle `voitDepensePlateforme` du noyau).
 */
export function personnelPlateforme(s: Pick<Session, 'user' | 'equipe'> | null | undefined): boolean {
  if (!s) return false;
  return voitDepensePlateforme({ fondateur: isFounder(s.user.email), roleEquipe: s.equipe?.role ?? null });
}
