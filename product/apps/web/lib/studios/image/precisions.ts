import 'server-only';
import { aPermissionEspace, erreurStudio } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion } from '../depot';
import { projetEtBrief } from '../textes/ecrire';

/** Réponse manuelle gratuite. Version immuable et conflits gérés par le dépôt. */
export async function enregistrerPrecisionsImagePour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; precisions: unknown }) {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (typeof e.precisions !== 'string' || !e.precisions.trim() || e.precisions.length > 2000) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'Saisissez vos précisions (2 000 caractères maximum).' });
  const p = await projetEtBrief(ctx, e.projectId);
  if (!p.ok) return p;
  if (!p.brief) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'Le brief doit être renseigné avant d’ajouter des précisions.' });
  // Append explicite : aucun remplacement de la composition, photo ou références.
  const composition = [p.brief.composition, `Précisions confirmées : ${e.precisions.trim()}`].filter(Boolean).join('\n\n');
  if (composition.length > 12000) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'La composition est trop longue. Raccourcissez vos précisions.' });
  // Nouvelle version => empreinte du brief modifiée, anciennes consignes périmées,
  // anciens devis non réutilisables. Aucun fournisseur ni job appelé ici.
  return enregistrerVersion(ctx, { projectId: p.projet.id, baseVersionId: e.baseVersionId,
    changes: [{ op: 'replace', path: '/brief/composition', newValue: composition, reason: 'Précisions manuelles pour préparer le visuel' }],
    allowedPaths: ['/brief/composition'],
  });
}
