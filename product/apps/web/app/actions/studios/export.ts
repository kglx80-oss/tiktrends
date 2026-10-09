'use server';

import { gardeStudio } from '../../../lib/studios/garde';
import { exporterVersionPour, lireVueExportPour, type ExportRealise, type RefusExport, type Resultat, type VueExport } from '../../../lib/studios/export/export';

/**
 * Studios · L7-A · export image d'une version.
 *
 *  · lire l'écran (préflight compris) · `studio.read`, LECTURE : rien n'est
 *    écrit à la visite ;
 *  · exporter · `studio.export`, droits RELUS à cet instant (garde neuve :
 *    session, rôle, marques, restrictions ; médias relus). Une seule écriture,
 *    l'audit `project.export`. Calcul local, 0 $, aucun appel fournisseur.
 *
 * Les octets ne transitent pas par l'action : elle renvoie l'adresse de
 * téléchargement (version + empreinte), servie par la route GET de lecture.
 */

export async function lireExportProjet(entree: { projectId: unknown; versionId?: unknown }): Promise<Resultat<{ vue: VueExport }>> {
  const g = await gardeStudio('studio.read', 'export');
  if (!g.ok) return g;
  return lireVueExportPour(g.ctx, { projectId: entree?.projectId, versionId: entree?.versionId });
}

export async function exporterVersion(entree: { projectId: unknown; versionId?: unknown; format: unknown }): Promise<Resultat<{ export: ExportRealise }> | RefusExport> {
  const g = await gardeStudio('studio.export', 'export');
  if (!g.ok) return g;
  return exporterVersionPour(g.ctx, { projectId: entree?.projectId, versionId: entree?.versionId, format: entree?.format });
}
