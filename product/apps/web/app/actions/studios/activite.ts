'use server';

import type { ErreurStudio, JournalProjet } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { commenterPour, lireJournalPour, listerCommentairesPour, modifierCommentairePour, resoudreCommentairePour } from '../../../lib/studios/activite';
import type { CommentairesProjet } from '../../../spatial/vues/projet/types';

/**
 * Lot 10 V5 · l'activité d'un projet (journal et commentaires).
 *
 * Chaque commande · `gardeStudio(permission, 'projets')` (session relue,
 * contexte serveur, capacité « projets » de l'espace) puis le module, qui
 * relit la portée dans chaque requête. Lire = `studio.read` (qui voit le
 * projet) · écrire, modifier le sien, résoudre / rouvrir = `studio.propose`
 * (la permission qui édite le projet) · aucune permission nouvelle. Entrées
 * `unknown` · une action serveur est appelable directement.
 *
 * Gratuit · aucun appel IA, aucune génération.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Une page du journal · filtre par type, page bornée. Lecture seule. */
export async function lireActiviteProjet(entree: { projectId: unknown; type?: unknown; page?: unknown }): Promise<Reponse<{ journal: JournalProjet; tronque: boolean }>> {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  return lireJournalPour(g.ctx, { projectId: entree?.projectId, type: entree?.type, page: entree?.page });
}

/** Les commentaires du projet et ce qu'on peut commenter. Lecture seule. */
export async function listerCommentairesProjet(entree: { projectId: unknown }): Promise<Reponse<CommentairesProjet>> {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  return listerCommentairesPour(g.ctx, { projectId: entree?.projectId });
}

/** Commente une version ou une création du projet. */
export async function commenterProjet(entree: { projectId: unknown; cible: unknown; cibleId: unknown; texte: unknown }): Promise<Reponse<CommentairesProjet>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return commenterPour(g.ctx, { projectId: entree?.projectId, cible: entree?.cible, cibleId: entree?.cibleId, texte: entree?.texte });
}

/** Modifie SON commentaire, encore ouvert · l'ancien texte est gardé. */
export async function modifierCommentaire(entree: { commentId: unknown; rowVersion: unknown; texte: unknown }): Promise<Reponse<CommentairesProjet>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return modifierCommentairePour(g.ctx, { commentId: entree?.commentId, rowVersion: entree?.rowVersion, texte: entree?.texte });
}

/** Résout (`resolu: true`) ou rouvre (`false`) un commentaire · jamais de suppression. */
export async function resoudreCommentaire(entree: { commentId: unknown; rowVersion: unknown; resolu: unknown }): Promise<Reponse<CommentairesProjet>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return resoudreCommentairePour(g.ctx, { commentId: entree?.commentId, rowVersion: entree?.rowVersion, resolu: entree?.resolu });
}
