'use server';

import { revalidatePath } from 'next/cache';
import type { PermissionPlateforme } from '@tiktrends/core';
import { gardePlateforme } from '../../../lib/studios/prompts/garde-prompts';
import * as depot from '../../../lib/studios/prompts/depot-prompts';
import { environnementPrompts } from '../../../lib/studios/prompts/environnement';

/**
 * Commandes ADMIN du registre de prompts (« IA et Studios »).
 *
 * Chaque commande : `gardePlateforme(permission)` (session relue, accès total
 * d'équipe seulement) puis le dépôt, qui fait vérifier la règle par le noyau
 * et écrit dans une transaction avec son audit. Les entrées sont `unknown` :
 * une action serveur est appelable directement, le type n'est pas une
 * validation.
 *
 * Correspondance permission → geste (cahier §8.1) : import, brouillon,
 * validation et création de release · `prompt.draft` ; évaluation ·
 * `prompt.evaluate` ; publication et retrait · `prompt.publish` ; retour
 * arrière · `prompt.rollback`. Aucun appel de modèle, aucune dépense.
 */

export interface ConstatAffiche { code: string; cible: string; message: string }
export type ReponseAdmin<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; message: string; constats: ConstatAffiche[]; traceId?: string };

const CHEMIN = '/admin/ia-studios';

async function avec<T>(permission: PermissionPlateforme, faire: (acteur: Awaited<ReturnType<typeof gardePlateforme>> & { ok: true }) => Promise<depot.Res<T>>): Promise<ReponseAdmin<T>> {
  const g = await gardePlateforme(permission);
  if (!g.ok) return { ok: false, message: g.message, constats: [], traceId: g.traceId };
  try {
    const r = await faire(g);
    if (!r.ok) return { ok: false, message: 'Refusé · voir les motifs ci-dessous.', constats: r.constats, traceId: g.ctx.traceId };
    revalidatePath(CHEMIN);
    return r as ({ ok: true } & T);
  } catch (e) {
    console.error(`[ia-studios] ${g.ctx.traceId}`, (e as Error).message);
    return { ok: false, message: 'L’enregistrement a échoué · rien n’a été modifié. Réessaie.', constats: [], traceId: g.ctx.traceId };
  }
}

export async function importerPackAction(): Promise<ReponseAdmin<{ crees: number; dejaPresentes: number }>> {
  return avec('prompt.draft', (g) => depot.importerPack(g.acteur));
}

export async function enregistrerBrouillonAction(e: { baseId: unknown; champs: unknown; motif: unknown; empreinteAttendue?: unknown }): Promise<ReponseAdmin<{ id: string; version: string; nouvelle: boolean }>> {
  return avec('prompt.draft', (g) => depot.enregistrerBrouillon(g.acteur, { baseId: e?.baseId, champs: e?.champs, motif: e?.motif, empreinteAttendue: e?.empreinteAttendue }));
}

export async function validerVersionAction(e: { id: unknown }): Promise<ReponseAdmin<{ id: string }>> {
  return avec('prompt.draft', (g) => depot.validerVersion(g.acteur, { id: e?.id }));
}

export async function creerReleaseAction(e: { choix?: unknown; motif?: unknown }): Promise<ReponseAdmin<{ id: string; releaseHash: string; existante: boolean }>> {
  return avec('prompt.draft', (g) => depot.creerRelease(g.acteur, { choix: e?.choix, motif: e?.motif }));
}

export async function evaluerReleaseAction(e: { releaseId: unknown }): Promise<ReponseAdmin<{ evaluationId: string; testsStructurels: boolean }>> {
  return avec('prompt.evaluate', async (g) => {
    const r = await depot.evaluerRelease(g.acteur, { releaseId: e?.releaseId });
    return r.ok ? { ok: true, evaluationId: r.evaluationId, testsStructurels: r.testsStructurels } : r;
  });
}

export async function publierReleaseAction(e: { releaseId: unknown; attendue: unknown; confirme: unknown }): Promise<ReponseAdmin<{ releaseId: string }>> {
  if (e?.confirme !== true) return { ok: false, message: 'Confirme la publication avant de l’envoyer.', constats: [] };
  return avec('prompt.publish', (g) => depot.publierRelease(g.acteur, { releaseId: e.releaseId, attendue: e.attendue, environnement: environnementPrompts(process.env) }));
}

export async function rollbackReleaseAction(e: { releaseId: unknown; attendue: unknown; confirme: unknown }): Promise<ReponseAdmin<{ releaseId: string }>> {
  if (e?.confirme !== true) return { ok: false, message: 'Confirme le retour arrière avant de l’envoyer.', constats: [] };
  return avec('prompt.rollback', (g) => depot.rollbackRelease(g.acteur, { releaseId: e.releaseId, attendue: e.attendue, environnement: environnementPrompts(process.env) }));
}

export async function revoquerReleaseAction(e: { releaseId: unknown; motif: unknown; confirme: unknown }): Promise<ReponseAdmin<{ releaseId: string; deja: boolean }>> {
  if (e?.confirme !== true) return { ok: false, message: 'Confirme la révocation avant de l’envoyer.', constats: [] };
  return avec('prompt.rollback', (g) => depot.revoquerRelease(g.acteur, { releaseId: e.releaseId, motif: e.motif }));
}

export async function retirerReleaseAction(e: { releaseId: unknown; motif?: unknown }): Promise<ReponseAdmin<{ releaseId: string }>> {
  return avec('prompt.publish', (g) => depot.retirerRelease(g.acteur, { releaseId: e?.releaseId, motif: e?.motif }));
}
