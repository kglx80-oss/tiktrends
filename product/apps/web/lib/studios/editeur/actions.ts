'use server';

import { gardeStudio } from '../garde';
import { lireEditeurPour } from './lecture';
import { lireApercuVersion, listerVersionsEditeur, restaurerVersionEditeur } from './versions';
import type { ApercuVersion, DocumentRelu, ReponseEditeur, VersionListee, VersionRestauree } from './types';

/**
 * Relit la version COURANTE du document d'un projet · lecture pure, sous
 * `studio.read`. Sert à l'éditeur après un 409 : montrer ce qui a changé et
 * proposer « recharger » ou « recharger et réappliquer ». N'écrit rien.
 *
 * L'enregistrement, lui, passe par l'action existante `enregistrerDocument`
 * (`app/actions/studios/projets.ts` · `studio.propose`, base obligatoire, 409).
 */
export async function relireDocumentEditeur(projectId: unknown): Promise<ReponseEditeur<DocumentRelu>> {
  const g = await gardeStudio('studio.read', 'editeur');
  if (!g.ok) return g;
  const r = await lireEditeurPour(g.ctx, projectId);
  if (!r.ok) return r;
  return { ok: true, version: r.donnees.version, document: r.donnees.document };
}

/** Versions du projet (les plus récentes d'abord) · lecture pure, sous `studio.read`. */
export async function listerVersionsDocument(projectId: unknown): Promise<ReponseEditeur<{ versions: VersionListee[] }>> {
  const g = await gardeStudio('studio.read', 'editeur');
  if (!g.ok) return g;
  return listerVersionsEditeur(g.ctx, projectId);
}

/** Aperçu d'une version et comparaison avec la courante · lecture pure, sous `studio.read`. */
export async function apercuVersionDocument(entree: { projectId: unknown; versionId: unknown }): Promise<ReponseEditeur<{ apercu: ApercuVersion }>> {
  const g = await gardeStudio('studio.read', 'editeur');
  if (!g.ok) return g;
  return lireApercuVersion(g.ctx, entree?.projectId, entree?.versionId);
}

/**
 * Restaure une version · crée une NOUVELLE version au contenu de celle-ci.
 * Même garde que l'enregistrement (`studio.propose`), même chemin
 * (`enregistrerVersion`), même 409 si `baseVersionId` n'est plus la courante.
 */
export async function restaurerVersionDocument(entree: { projectId: unknown; versionId: unknown; baseVersionId: unknown }): Promise<ReponseEditeur<VersionRestauree>> {
  const g = await gardeStudio('studio.propose', 'editeur');
  if (!g.ok) return g;
  return restaurerVersionEditeur(g.ctx, { projectId: entree?.projectId, versionId: entree?.versionId, baseVersionId: entree?.baseVersionId });
}
