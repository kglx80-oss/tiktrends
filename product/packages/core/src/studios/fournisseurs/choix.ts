/**
 * Studios · F-A · QUAND le worker branche le fournisseur réel, et à quel rythme il le sonde.
 *
 * Pur : décision sur les variables d'environnement reçues, sans les lire.
 *
 * Le fournisseur fal RÉEL n'est branché que si TOUT est vrai :
 *  · `FAL_KEY` est posée et n'est pas la clé de simulation locale
 *    (`simule-…`, posée en développement pour qu'aucun appel ne parte) ;
 *  · on est en production (`NODE_ENV=production`) OU l'exploitant l'a
 *    EXPLICITEMENT autorisé (`STUDIO_FOURNISSEUR_REEL=autorise`) : un poste de
 *    développement avec une vraie clé ne dépense rien par accident ;
 *  · le stockage objet est configuré (`S3_*`) : sans lui, aucun résultat ne
 *    pourrait être déposé ni relu, et on paierait des images perdues.
 * Sinon le worker studio ne démarre pas : jobs laissés en file, réserve intacte,
 * rien facturé (comportement L3). Le fournisseur SIMULÉ n'est jamais un choix
 * ici : il vit dans un module que la production n'importe pas.
 */

export type DecisionFournisseur =
  | { ok: true; apiKey: string; queueUrl: string | null; modeles: { generation: string; edition: string } }
  | { ok: false; raison: string };

/** Défauts de `falFromEnv()` (`packages/integrations/src/fal.ts`) · mêmes variables, mêmes modèles. */
export const MODELE_FAL_GENERATION_DEFAUT = 'fal-ai/nano-banana-2';
export const MODELE_FAL_EDITION_DEFAUT = 'fal-ai/nano-banana-2/edit';
export const AUTORISATION_FOURNISSEUR_REEL = 'autorise';

export function decisionFournisseurStudio(env: Readonly<Record<string, string | undefined>>): DecisionFournisseur {
  const cle = (env.FAL_KEY ?? '').trim();
  if (!cle) return { ok: false, raison: 'aucun fournisseur de génération branché (FAL_KEY absente)' };
  if (/^simule/i.test(cle) || /\s/.test(cle)) return { ok: false, raison: 'FAL_KEY de simulation locale · aucun appel réel' };
  if (env.NODE_ENV !== 'production' && env.STUDIO_FOURNISSEUR_REEL !== AUTORISATION_FOURNISSEUR_REEL) {
    return { ok: false, raison: 'fournisseur réel refusé hors production sans STUDIO_FOURNISSEUR_REEL=autorise' };
  }
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return { ok: false, raison: 'stockage objet non configuré (S3_*) · aucun résultat ne pourrait être conservé' };
  }
  return {
    ok: true,
    apiKey: cle,
    queueUrl: env.FAL_QUEUE_URL || null,
    modeles: {
      generation: env.FAL_IMAGE_MODEL || MODELE_FAL_GENERATION_DEFAUT,
      edition: env.FAL_IMAGE_MODEL_EDIT || MODELE_FAL_EDITION_DEFAUT,
    },
  };
}

/**
 * Recul du sondage d'une requête fal · politique, pas une mesure : le premier
 * sondage au rythme de la boucle (2 s), puis doublé à chaque lecture « en
 * cours », plafonné à 15 s. Un job long coûte au plus une lecture toutes les
 * 15 s ; un job court n'attend jamais plus de 15 s après sa fin.
 */
export const SONDAGE_INITIAL_MS = 2_000;
export const SONDAGE_MAX_MS = 15_000;
export function delaiSondageMs(lecturesEnCours: number): number {
  return Math.min(SONDAGE_MAX_MS, SONDAGE_INITIAL_MS * 2 ** Math.max(0, Math.min(10, lecturesEnCours)));
}
