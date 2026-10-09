'use server';

import type { DispositionCanvas, ErreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { enregistrerDispositionCanvasPour, lireCanvasPour, type CanvasProjetLu } from '../../../lib/studios/canvas/disposition';

/**
 * Commandes du canvas métier (cahier 01 §127, UX-04).
 *
 * Lire n'écrit rien. Seuls deux gestes écrivent, et seulement la disposition
 * PERSONNELLE (positions des cartes) : déplacer une carte, réinitialiser. Ni le
 * projet, ni une version, ni l'ordre des plans, ni `studio_layouts` ne sont
 * touchés. Aucun appel IA, aucune dépense.
 *
 * Permission `studio.read` : ranger SA vue est une préférence de lecture, pas
 * une modification du projet · toute personne qui peut ouvrir le projet range
 * son canvas, sans pouvoir proposer quoi que ce soit.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export async function lireCanvasProjet(entree: { projectId: unknown; versionId?: unknown }): Promise<Reponse<{ canvas: CanvasProjetLu }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return lireCanvasPour(g.ctx, entree?.projectId, entree?.versionId);
}

/** Geste explicite · déplacer une carte (la disposition entière, révision attendue). */
export async function enregistrerDispositionCanvas(entree: { projectId: unknown; disposition: unknown; rev: unknown }): Promise<Reponse<{ disposition: DispositionCanvas; rev: number }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return enregistrerDispositionCanvasPour(g.ctx, { projectId: entree?.projectId, disposition: entree?.disposition, rev: entree?.rev });
}

/** Geste explicite · réinitialiser la disposition (toutes les cartes reprennent leur place automatique). */
export async function reinitialiserDispositionCanvas(entree: { projectId: unknown; rev: unknown }): Promise<Reponse<{ disposition: DispositionCanvas; rev: number }>> {
  const g = await gardeStudio('studio.read');
  if (!g.ok) return g;
  return enregistrerDispositionCanvasPour(g.ctx, { projectId: entree?.projectId, disposition: { positions: {} }, rev: entree?.rev });
}
