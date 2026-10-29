'use server';

import { randomUUID } from 'node:crypto';
import { ajouterVueVeille, renommerVueVeille, retirerVueVeille, type VueVeilleEnregistree } from '@tiktrends/core';
import { gardeVeille } from '../../lib/veille-garde';
import { modifierVuesVeille } from '../../lib/veille-vues';

/**
 * Les vues enregistrées de l'explorateur de la Veille · garder, renommer,
 * supprimer. Même garde que les autres gestes de la Veille (`gardeVeille` ·
 * rôle ET offre de `inspo`). `workspaceId` et `userId` sont pris à la SESSION,
 * jamais à l'entrée · une personne ne touche que ses vues, dans l'espace
 * courant. Les règles (nom, liste blanche, plafond, doublons) sont celles du
 * noyau (`spatial/veille/vues`). Le refus se dit par une valeur · l'écran ne
 * change qu'après le oui du serveur, avec la liste qu'il renvoie.
 */
export type ResultatVues = { ok: true; vues: VueVeilleEnregistree[]; id?: string } | { ok: false; error: string };

export async function garderVueVeille(input: { nom: unknown; params: unknown }): Promise<ResultatVues> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
  const id = randomUUID();
  const r = await modifierVuesVeille(s.workspaceId, s.user.id, (vues) =>
    ajouterVueVeille(vues, { id, nom: input?.nom, params: input?.params, creeLe: new Date().toISOString() }));
  return r.ok ? { ok: true, vues: r.vues, id } : { ok: false, error: r.raison };
}

export async function renommerVueVeilleAction(input: { id: unknown; nom: unknown }): Promise<ResultatVues> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
  const r = await modifierVuesVeille(s.workspaceId, s.user.id, (vues) => renommerVueVeille(vues, input?.id, input?.nom));
  return r.ok ? { ok: true, vues: r.vues } : { ok: false, error: r.raison };
}

export async function supprimerVueVeille(input: { id: unknown }): Promise<ResultatVues> {
  const g = await gardeVeille();
  if ('error' in g) return { ok: false, error: g.error };
  const { s } = g;
  const r = await modifierVuesVeille(s.workspaceId, s.user.id, (vues) => retirerVueVeille(vues, input?.id));
  return r.ok ? { ok: true, vues: r.vues } : { ok: false, error: r.raison };
}
