'use server';

import { erreurStudio, type ErreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import {
  listerProjets as listerDepot, lireProjet, lireVersion, lireDisposition, creerProjet as creerDepot,
  enregistrerVersion, enregistrerDisposition as enregistrerDispositionDepot,
  type ProjetStudio, type VersionStudio, type DispositionStudio,
} from '../../../lib/studios/depot';

/**
 * Commandes « projet » des studios (plan 06 §3 · inspectProject, saveDocument).
 *
 * Chaque commande : `gardeStudio(permission)` (session relue, contexte serveur,
 * jamais un espace ni une marque pris du client) puis le dépôt, qui filtre la
 * portée dans chaque requête. Les entrées sont `unknown` : une action serveur
 * est appelable directement, le type TypeScript n'est pas une validation.
 *
 * Aucun appel IA, aucune dépense, aucun média produit ici.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Liste les projets visibles · filtre de marque optionnel (ignoré s'il est hors portée). */
export async function listerProjets(entree?: { brandId?: unknown; limite?: unknown }): Promise<Reponse<{ projets: ProjetStudio[] }>> {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  const brandId = typeof entree?.brandId === 'string' ? entree.brandId : null;
  const limite = typeof entree?.limite === 'number' ? entree.limite : undefined;
  return { ok: true, projets: await listerDepot(g.ctx, { brandId, limite }) };
}

/** Lecture PURE · projet, version courante, disposition. N'écrit rien, ne prépare rien. */
export async function inspecterProjet(projectId: unknown): Promise<Reponse<{ projet: ProjetStudio; version: VersionStudio; disposition: DispositionStudio | null }>> {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  const p = await lireProjet(g.ctx, projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: g.ctx.traceId });
  const v = await lireVersion(g.ctx, p.projet.currentVersionId);
  if (!v.ok) return v;
  const d = await lireDisposition(g.ctx, p.projet.id);
  if (!d.ok) return d;
  return { ok: true, projet: p.projet, version: v.version, disposition: d.disposition };
}

export async function creerProjet(entree: { brandId: unknown; kind: unknown; title: unknown; contenu?: unknown }): Promise<Reponse<{ projet: ProjetStudio; version: VersionStudio }>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return creerDepot(g.ctx, { brandId: entree?.brandId, kind: entree?.kind, title: entree?.title, contenu: entree?.contenu });
}

/**
 * Enregistre une modification du document · `baseVersionId` OBLIGATOIRE.
 * Résultat : une nouvelle version immuable, ou 409 `VERSION_CONFLICT` avec le
 * diff si la base est périmée · jamais d'écrasement.
 */
export async function enregistrerDocument(entree: { projectId: unknown; baseVersionId: unknown; changes: unknown; raison?: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean }>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  // `allowedPaths` n'est PAS lu du client : l'éditeur a le contenu entier, défini côté serveur.
  return enregistrerVersion(g.ctx, { projectId: entree?.projectId, baseVersionId: entree?.baseVersionId, changes: entree?.changes, raison: entree?.raison });
}

/** Positions du canvas · ne crée aucune version, ne touche pas l'ordre des plans. */
export async function enregistrerDisposition(entree: { projectId: unknown; positions: unknown; viewport?: unknown; rowVersion: unknown }): Promise<Reponse<{ disposition: DispositionStudio }>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return enregistrerDispositionDepot(g.ctx, { projectId: entree?.projectId, positions: entree?.positions, viewport: entree?.viewport, rowVersion: entree?.rowVersion });
}
