'use server';

import { revalidatePath } from 'next/cache';
import { db, schema } from '@tiktrends/db';
import { signatureFait, versionFait } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { GUARD } from '../../lib/guard-error';
import { contenuFait, renduDeLaMarque } from '../../lib/faits-preuve';

/**
 * Vérifier un fait porté par une pub · N04-suite.
 *
 * Enregistre une preuve · une SOURCE consultable, la signature du contenu
 * validé, sa version, le validateur et la date. Append-only · on ne remplace
 * jamais, l'historique approuvé reste. Une case cochée ne suffit pas · sans
 * source, rien n'est enregistré.
 *
 * La véracité elle-même n'est pas dépensée en IA · c'est une personne qui
 * atteste, contre une source qu'elle fournit. Aucun appel modèle, aucun coût.
 */
export async function verifierFaitAction(input: { adId: string; factCle: string; source: string }): Promise<{ ok?: true; version?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const source = (input.source ?? '').trim();
  // Une case cochée seule ne vaut rien · la preuve EXIGE une source consultable.
  if (!source) return { error: 'Une source consultable est requise · une case cochée ne suffit pas à vérifier un fait.' };
  if (source.length > 2000) return { error: 'Source trop longue.' };

  // Isolation · le rendu doit appartenir à la marque active de l'utilisateur.
  const rec = await renduDeLaMarque(input.adId, brand.id);
  if (!rec) return { error: GUARD.notFound('ce rendu') };

  // Le contenu EXACT du fait au moment où on valide · c'est lui qu'on signe.
  const contenu = contenuFait(rec, input.factCle);
  if (contenu == null) return { error: 'Ce fait n’existe pas sur cette pub.' };

  const signature = signatureFait(contenu);
  const version = versionFait(signature);
  await db.insert(schema.factValidations).values({
    workspaceId: s.workspaceId,
    generationId: input.adId,
    factCle: input.factCle,
    source,
    signature,
    version,
    validatedBy: s.user.id,
  });
  // Le studio relit alors l'état réel des faits · pas de rafraîchissement piloté
  // par le navigateur, donc rien à monter côté client.
  revalidatePath('/studio/ads');
  return { ok: true, version };
}
