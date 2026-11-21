import { effectiveAccess } from '../../lib/access';
import { authentifierEquipeSession, type JetonEquipe } from '../../lib/registre-equipe-session';
import type { EquipeSession } from '../../lib/equipe-plateforme';
import type { FaceEquipe } from '../../lib/rbac';
import type { MatriceDroits, RolePlateforme } from '@tiktrends/core';

/**
 * Une session d'équipe AUTHENTIFIÉE, comme `equipeDeSession` la rend (gelée,
 * inscrite au registre des sessions) · pour poser `Session.equipe` dans un test
 * sans base. Une `equipe` littérale vaut absente pour `effectiveAccess` (face
 * client), comme en production (suite de #1122). Le vrai chemin, pglite et
 * `getSession`, est éprouvé par `secu-face-equipe-session-rendu.test.tsx`.
 *
 * Réservé aux tests · `authentifierEquipeSession` est refusée hors de
 * lib/equipe-plateforme.ts et de ce fichier (règle
 * `tiktrends/authentification-equipe-session`, recensement
 * `secu-fondateurs-codes-sources`), et ce fichier n'est importable que depuis
 * test/ (`tiktrends/pas-de-test-en-production`).
 */
export function sessionEquipeTest(e: EquipeSession): JetonEquipe {
  // Le jeton OPAQUE de la copie gelée, inscrite · `Session.equipe` ne se lit que par equipeAuthentique, ici comme en production.
  return authentifierEquipeSession(e);
}

/**
 * Une équipe RECONSTRUITE À LA MAIN, posée là où `Session.equipe` attend son
 * jeton · NON inscrite au registre. Le type l'interdit en production (suite de
 * #1125, `JetonEquipe`) · seul un cast la pose, et ce cast vit ici, nommé, pour
 * que les tests qui éprouvent la forge disent ce qu'ils font. Chaque lecteur
 * doit la valoir ABSENTE (`equipeAuthentique` → null).
 */
export function jetonForgeTest(e: EquipeSession): JetonEquipe {
  return e as unknown as JetonEquipe;
}

/**
 * Une face « équipe » pour éprouver `rbac` · RECONNUE, parce qu'elle sort de
 * `effectiveAccess` lui-même, pour une session d'équipe authentifiée et
 * admissible (le même chemin que la production · `privilegesEquipe`, gel,
 * inscription au registre). Aucun cast · une face forgée ici vaudrait face
 * client, comme en production (suite de #1122).
 */
export function faceEquipeTest(role: RolePlateforme, matrice: MatriceDroits = {}): FaceEquipe {
  const acces = effectiveAccess({ role: 'member', plan: 'starter', user: { email: 'equipe-de-test@tiktrends.invalid' }, equipe: sessionEquipeTest({ role, matrice, plateformeAdmissible: true }) });
  if (!acces.equipe) throw new Error(`faceEquipeTest · effectiveAccess n’a pas posé de face équipe pour « ${role} » · la règle d’admissibilité a changé`);
  return acces.equipe;
}
