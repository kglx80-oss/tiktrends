import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `pollVideoAction` reçoit un `generationId` du CLIENT. Sans vérifier son
 * appartenance à l'espace du demandeur, un utilisateur connaissant le
 * generationId d'un AUTRE espace pouvait :
 *  - forcer `failAndRefund` · marquer la génération de la victime en échec ET
 *    créditer SON espace du coût de la victime (`refundCredits` crédite l'espace
 *    passé, celui de l'appelant) · vol de crédits + DoS ;
 *  - sur la branche `completed`, écraser l'`assetUrls` de la victime avec une
 *    URL vidéo de son choix.
 *
 * `generations` n'a pas de `workspaceId` direct · l'appartenance se vérifie en
 * joignant `brands` (`brands.workspaceId`). Le code serveur utilise le singleton
 * `db` (non injectable) · on vérifie la propriété sur la source. Le test tombe
 * si l'un des deux effets redevient non gardé.
 */
const SRC = readFileSync(join(process.cwd(), 'app/actions/video.ts'), 'utf8');

describe('pollVideoAction · isolation par espace du generationId', () => {
  it('failAndRefund ne touche qu’une génération de l’espace demandeur', () => {
    expect(
      /failAndRefund\(generationId: string[\s\S]*?innerJoin\(schema\.brands[\s\S]*?eq\(schema\.brands\.workspaceId, workspaceId\)/.test(SRC),
      'failAndRefund résout le generationId sans filtrer brands.workspaceId · vol de crédits / DoS inter-espaces',
    ).toBe(true);
  });

  it('la branche completed vérifie l’appartenance avant d’écrire l’URL', () => {
    expect(
      SRC.includes("job.status === 'completed'") && /eq\(schema\.brands\.workspaceId, s\.workspaceId\)/.test(SRC),
      'la branche completed écrit assetUrls sans vérifier l’appartenance · écrasement inter-espaces',
    ).toBe(true);
  });
});
