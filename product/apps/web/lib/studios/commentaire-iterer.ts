import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { aPermissionEspace, objetDansPortee } from '@tiktrends/core';
import type { Session } from '../auth';
import { effectiveAccess } from '../access';
import { canAccess, FEATURES } from '../rbac';
import { gardeStudio } from './garde';
import { listerVariantes } from './variantes/variantes';

/**
 * « Itérer depuis ce commentaire » · le côté serveur · une LECTURE, jamais une
 * écriture, aucun modèle. Les règles vivent au noyau
 * (`C/studios/activite/iterer-commentaire.ts`, `provenanceCommentaireAdmise`).
 *
 * Le commentaire désigné par l'adresse (`?commentaire=<uuid>&projet=<uuid>`)
 * est relu dans la portée de la session :
 *  · Résultats ouvert (la fonction `adsmap` · l'itération part d'un verdict) ;
 *  · la garde des Studios (`studio.read`) · même espace, marque ACTIVE parmi
 *    les marques visibles (restrictions comprises) ;
 *  · le PROJET de l'adresse, dans l'espace et la marque active ;
 *  · le commentaire DE CE projet, de cette marque, sur une CRÉATION ;
 *  · la variante de cette création et son lien de test (`listerVariantes`,
 *    la même lecture que la fiche) · la pub de départ.
 * Un commentaire d'un autre projet, d'une autre marque, d'un autre espace,
 * sur une version, d'une création non testée, inconnu · `null` · l'appelant dit
 * la même phrase (`REFUS_GESTE_COMMENTAIRE`), rien ne dit s'il existe ailleurs.
 */

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLue = Pick<Session, 'workspaceId' | 'role' | 'plan' | 'user' | 'equipe'>;

export interface CommentaireLuPourIterer { commentaireId: string; projetId: string; texte: string; adsmapAdId: string }

export async function lireCommentairePourIterer(s: SessionLue, brandId: string, d: { commentaireId: string; projetId: string }): Promise<CommentaireLuPourIterer | null> {
  if (!db || !UUID.test(d.commentaireId) || !UUID.test(d.projetId)) return null;
  if (!canAccess(effectiveAccess(s), ADSMAP)) return null;
  try {
    const g = await gardeStudio('studio.read');
    if (!g.ok || g.ctx.workspaceId !== s.workspaceId || !g.ctx.marques.includes(brandId) || !aPermissionEspace(g.ctx.permissions, 'studio.read')) return null;
    const portee = { workspaceId: g.ctx.workspaceId, marquesDuWorkspace: g.ctx.marquesDuWorkspace, restrictionsMarque: g.ctx.restrictionsMarque };
    const P = schema.studioProjects;
    const [p] = await db.select({ id: P.id, workspaceId: P.workspaceId, brandId: P.brandId }).from(P)
      .where(and(eq(P.id, d.projetId), eq(P.workspaceId, s.workspaceId), eq(P.brandId, brandId))).limit(1);
    if (!p || !objetDansPortee(portee, p)) return null;
    const C = schema.studioComments;
    const [k] = await db.select({ id: C.id, body: C.body, targetType: C.targetType, assetId: C.assetId, workspaceId: C.workspaceId, brandId: C.brandId }).from(C)
      .where(and(eq(C.id, d.commentaireId), eq(C.projectId, p.id), eq(C.workspaceId, s.workspaceId), eq(C.brandId, brandId))).limit(1);
    if (!k || k.targetType !== 'creation' || !k.assetId || !objetDansPortee(portee, k)) return null;
    const r = await listerVariantes(g.ctx, { projectId: p.id }, { adsmapAcces: false, relecture: { disponible: false, raison: null, coutMaxUsd: null } });
    if (!r.ok) return null;
    const v = r.donnees.variantes.find((x) => x.assetId === k.assetId && x.test);
    if (!v?.test) return null;
    return { commentaireId: k.id, projetId: p.id, texte: k.body, adsmapAdId: v.test.adsmapAdId.toLowerCase() };
  } catch {
    return null;
  }
}
