'use server';

import type { ErreurStudio } from '@tiktrends/core';
import { gardeSources } from '../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import { lireNotesLigneePour, modifierNoteLigneePour, noterNoeudPour, resoudreNoteLigneePour } from '../../../lib/studios/notes-lignee';
import type { NotesLignee } from '../../../spatial/vues/projet/types';

/**
 * Lot 11 V5 (PC E11) · les notes du canvas de lignée.
 *
 * Chaque commande · la garde des Studios relue (session, rôle, portée de
 * marque) puis les capacités « projets » et « canvas » de l'espace (les notes
 * vivent sur le canvas de lignée), puis le module, qui relit la portée dans
 * chaque requête. Lire = `studio.read` · poser, modifier la sienne, résoudre /
 * rouvrir = `studio.propose` · aucune permission nouvelle. Entrées `unknown`
 * · une action serveur est appelable directement.
 *
 * Gratuit · aucun appel IA, aucune génération, aucune dépense.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

async function garde(permission: 'studio.read' | 'studio.propose') {
  const g = await gardeSources(permission);
  if (!g.ok) return g;
  const refus = await refusCapacite(g.ctx, ['projets', 'canvas']);
  return refus ?? g;
}

/** Les notes de la lignée du projet. Lecture seule. */
export async function lireNotesLignee(entree: { projectId: unknown }): Promise<Reponse<NotesLignee>> {
  const g = await garde('studio.read');
  if (!g.ok) return g;
  return lireNotesLigneePour(g.ctx, { projectId: entree?.projectId });
}

/** Pose une note sur un nœud de la lignée (`noeud` · l'identifiant de lignée du nœud). */
export async function noterNoeudLignee(entree: { projectId: unknown; noeud: unknown; texte: unknown }): Promise<Reponse<NotesLignee>> {
  const g = await garde('studio.propose');
  if (!g.ok) return g;
  return noterNoeudPour(g.ctx, { projectId: entree?.projectId, noeud: entree?.noeud, texte: entree?.texte }, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
}

/** Modifie SA note, encore ouverte · l'ancien texte est gardé. */
export async function modifierNoteLignee(entree: { noteId: unknown; rowVersion: unknown; texte: unknown }): Promise<Reponse<NotesLignee>> {
  const g = await garde('studio.propose');
  if (!g.ok) return g;
  return modifierNoteLigneePour(g.ctx, { noteId: entree?.noteId, rowVersion: entree?.rowVersion, texte: entree?.texte });
}

/** Résout (`resolue: true`) ou rouvre (`false`) une note · jamais de suppression. */
export async function resoudreNoteLignee(entree: { noteId: unknown; rowVersion: unknown; resolue: unknown }): Promise<Reponse<NotesLignee>> {
  const g = await garde('studio.propose');
  if (!g.ok) return g;
  return resoudreNoteLigneePour(g.ctx, { noteId: entree?.noteId, rowVersion: entree?.rowVersion, resolue: entree?.resolue });
}
