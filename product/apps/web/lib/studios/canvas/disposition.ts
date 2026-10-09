import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  deriverCanvas, dispositionVide, erreurStudio, validerContenuVersion, validerDispositionCanvas,
  type ContenuVersion, type DispositionCanvas, type ErreurStudio, type ModeleCanvas,
} from '@tiktrends/core';
import { lireProjet, lireVersion } from '../depot';
import type { ContexteStudio } from '../garde';

/**
 * Persistance de la disposition du canvas · PAR PERSONNE ET PAR PROJET.
 *
 * Stockage réutilisé : `app_settings` (clé/valeur jsonb déjà en base), une clé
 * par personne et par projet. Aucune migration. `studio_layouts` (0054) existe
 * mais porte UNE disposition par projet (`studio_layouts_projet_uq`) partagée
 * par toute l'équipe : y écrire ferait bouger les cartes des autres, et
 * l'adapter « par personne » demanderait une migration. Les positions restent
 * ainsi séparées du projet ET des versions : rien ici ne touche
 * `studio_projects`, `studio_project_versions` ni `studio_layouts`.
 *
 * Portée · la clé contient l'identifiant de la personne lu du CONTEXTE serveur
 * (jamais du client), et chaque lecture comme chaque écriture relit d'abord le
 * projet dans la portée (`lireProjet`) : hors portée, la même réponse
 * « introuvable » que partout ailleurs.
 *
 * Écriture · uniquement par un geste explicite (déplacer une carte,
 * réinitialiser). La lecture n'écrit jamais, même pour « nettoyer ».
 * Concurrence optimiste sur `rev` (deux onglets de la même personne).
 */

const PREFIXE = 'studios.canvas.disposition:';
export const cleDispositionCanvas = (userId: string, projectId: string) => `${PREFIXE}${userId}:${projectId}`;

type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

interface ValeurStockee {
  v: 1;
  rev: number;
  workspaceId: string;
  brandId: string;
  projectId: string;
  positions: DispositionCanvas['positions'];
}

function echec(ctx: ContexteStudio, e: unknown): ErreurStudio {
  console.error(`[studios] ${ctx.traceId} canvas`, e instanceof Error ? e.message : e);
  return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
}

/** Lecture PURE · la disposition de CETTE personne pour ce projet (vide si jamais déplacée). */
export async function lireDispositionCanvasPour(ctx: ContexteStudio, projectId: unknown): Promise<Resultat<{ disposition: DispositionCanvas; rev: number }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const A = schema.appSettings;
  try {
    const [l] = await db.select({ value: A.value }).from(A).where(eq(A.key, cleDispositionCanvas(ctx.userId, p.projet.id))).limit(1);
    const v = l?.value as Partial<ValeurStockee> | undefined;
    // Une ligne qui ne décrit pas CE projet dans CET espace est ignorée (jamais servie).
    if (!v || v.projectId !== p.projet.id || v.workspaceId !== p.projet.workspaceId || !Number.isInteger(v.rev)) {
      return { ok: true, disposition: dispositionVide(), rev: v && Number.isInteger(v.rev) ? (v.rev as number) : 0 };
    }
    const d = validerDispositionCanvas({ positions: v.positions });
    return { ok: true, disposition: d.ok ? d.disposition : dispositionVide(), rev: v.rev as number };
  } catch (err) {
    return echec(ctx, err);
  }
}

/**
 * Enregistre la disposition de CETTE personne · geste explicite seulement.
 * `rev` attendu : 0 pour une première écriture. Périmé ⇒ 409, rien d'écrasé.
 */
export async function enregistrerDispositionCanvasPour(
  ctx: ContexteStudio,
  e: { projectId: unknown; disposition: unknown; rev: unknown },
): Promise<Resultat<{ disposition: DispositionCanvas; rev: number }>> {
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const d = validerDispositionCanvas(e.disposition);
  if (!d.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'disposition', raison: d.raison }] });
  if (typeof e.rev !== 'number' || !Number.isInteger(e.rev) || e.rev < 0) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'rev', raison: 'révision de disposition attendue' }] });
  }
  const attendue = e.rev;
  const projet = p.projet;
  const valeur: ValeurStockee = {
    v: 1, rev: attendue + 1, workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id, positions: d.disposition.positions,
  };
  const A = schema.appSettings;
  const cle = cleDispositionCanvas(ctx.userId, projet.id);
  try {
    if (attendue === 0) {
      const ins = await db.insert(A).values({ key: cle, value: valeur }).onConflictDoNothing({ target: A.key }).returning({ key: A.key });
      if (ins[0]) return { ok: true, disposition: d.disposition, rev: valeur.rev };
    } else {
      const maj = await db.update(A)
        .set({ value: valeur, updatedAt: new Date() })
        .where(and(eq(A.key, cle), sql`(${A.value}->>'rev')::int = ${attendue}`))
        .returning({ key: A.key });
      if (maj[0]) return { ok: true, disposition: d.disposition, rev: valeur.rev };
    }
    const [l] = await db.select({ value: A.value }).from(A).where(eq(A.key, cle)).limit(1);
    const actuelle = (l?.value as Partial<ValeurStockee> | undefined)?.rev ?? 0;
    return erreurStudio('VERSION_CONFLICT', {
      traceId: ctx.traceId,
      targetIds: [projet.id],
      message: `Ta disposition a changé dans un autre onglet (révision ${actuelle}) · recharge la page pour reprendre la plus récente.`,
    });
  } catch (err) {
    return echec(ctx, err);
  }
}

export interface CanvasProjetLu {
  projectId: string;
  version: { id: string; n: number; courante: boolean };
  modele: ModeleCanvas;
  disposition: DispositionCanvas;
  rev: number;
}

/**
 * Lecture PURE du canvas d'une version · modèle dérivé du contenu, disposition
 * de la personne. N'écrit rien. Une version d'un autre projet, ou hors portée :
 * introuvable. Un contenu invalide : refusé, jamais dessiné à moitié.
 */
export async function lireCanvasPour(ctx: ContexteStudio, projectId: unknown, versionId?: unknown): Promise<Resultat<{ canvas: CanvasProjetLu }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const vid = versionId ?? p.projet.currentVersionId;
  if (!vid) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, vid);
  if (!v.ok) return v;
  if (v.version.projectId !== p.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const violations = validerContenuVersion(v.version.content as ContenuVersion);
  if (violations.length) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'Le contenu de cette version n’a pas la forme attendue · le canvas n’est pas dessiné.', violations: violations.slice(0, 5) });
  }
  const modele = deriverCanvas(v.version.content as ContenuVersion);
  const d = await lireDispositionCanvasPour(ctx, p.projet.id);
  if (!d.ok) return d;
  return {
    ok: true,
    canvas: {
      projectId: p.projet.id,
      version: { id: v.version.id, n: v.version.n, courante: v.version.id === p.projet.currentVersionId },
      modele,
      // Entière · `composerCanvas` ignore les cartes absentes, un geste ne les efface pas.
      disposition: d.disposition,
      rev: d.rev,
    },
  };
}
