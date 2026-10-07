import 'server-only';
import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import type { EpinglageDevis } from '@tiktrends/core';
// Le noyau L2 n'est pas exporté par `@tiktrends/core` (Ajv au chargement) : son seul point d'entrée serveur.
import { epinglerAuDevis, type Pointeur, type Portee, type Release } from '../prompts/noyau';
import type { ExecStudio } from './types';

/**
 * Release de prompt épinglée AU DEVIS (cahier 01 §8.2, contrat L2 `epinglerAuDevis`).
 *
 * Résolution de portée explicite : pointeur de la marque, sinon de l'espace,
 * sinon de la plateforme. Aucun pointeur ⇒ `null` (aucun repli inventé : le
 * devis porte alors `prompt_release_id = null`, champ prévu pour L2).
 * Un pointeur vers une release non active ou révoquée ⇒ refus avec motif.
 */
export type ResultatEpinglage = { ok: true; epinglage: EpinglageDevis | null } | { ok: false; motif: string };

export async function epinglerReleaseDuDevis(ex: ExecStudio, workspaceId: string, brandId: string): Promise<ResultatEpinglage> {
  const P = schema.studioPromptActive;
  const pointeurs = await ex.select().from(P).where(or(
    and(eq(P.scope, 'brand'), eq(P.workspaceId, workspaceId), eq(P.brandId, brandId)),
    and(eq(P.scope, 'workspace'), eq(P.workspaceId, workspaceId), isNull(P.brandId)),
    and(eq(P.scope, 'platform'), isNull(P.workspaceId), isNull(P.brandId)),
  ));
  const rang = { brand: 0, workspace: 1, platform: 2 } as const;
  const p = pointeurs.sort((a, b) => rang[a.scope as keyof typeof rang] - rang[b.scope as keyof typeof rang])[0];
  if (!p) return { ok: true, epinglage: null };

  const [r] = await ex.select().from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, p.releaseId)).limit(1);
  const portee: Portee = p.scope === 'brand' ? { niveau: 'marque', espaceId: workspaceId, marqueId: brandId }
    : p.scope === 'workspace' ? { niveau: 'espace', espaceId: workspaceId } : { niveau: 'plateforme' };
  const pointeur: Pointeur = { portee, releaseId: p.releaseId };
  const releases: Release[] = r ? [{
    id: r.id, portee, statut: r.status as Release['statut'], hash: r.releaseHash,
    templates: [], recettes: [], socle: { cle: 'socle', version: '0.0.0', contentHash: '' }, rendu: { cle: 'rendu', version: '0.0.0', contentHash: '' },
    // Révocation : pas de colonne dédiée en L1 · lue dans l'évaluation si L2 l'y range.
    ...(revocationDe(r.evaluation) ? { revocation: { motif: revocationDe(r.evaluation)! } } : {}),
  }] : [];
  const e = epinglerAuDevis(pointeur, releases);
  if (!e.ok) return { ok: false, motif: e.constats.map((c) => c.message).join(' ') };
  return { ok: true, epinglage: e.epinglage };
}

export function revocationDe(evaluation: unknown): string | null {
  const m = (evaluation as { revocation?: { motif?: unknown } } | null)?.revocation?.motif;
  return typeof m === 'string' && m ? m : null;
}
