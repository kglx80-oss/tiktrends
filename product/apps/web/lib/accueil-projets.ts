import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, apercuReprise, capacitesDuRefus, doitLireProjetsAccueil, lotsLivreurs, objetDansPortee, resoudreAccueilProjets,
  ORIGINES_SORTIE_STUDIO, type EtatAccueilProjets, type LectureProjetsAccueil,
} from '@tiktrends/core';
import type { Session } from './auth';
import { listerProjetsCartes } from '../app/actions/studios/sources';
import type { CarteProjet } from './studios/sources/projet';
import { contexteDepuisSession, gardeStudio } from './studios/garde';

/**
 * UX V2 · lot 5 · la tête de l'Accueil · LECTURE SEULE.
 *
 * Les projets viennent de l'action de la liste des projets
 * (`listerProjetsCartes` · garde studio, capacité « projets », portée espace +
 * marques + restrictions de marque), sans rien y ajouter. L'état affiché est
 * décidé par le noyau (`resoudreAccueilProjets`). Rien n'est écrit, rien n'est
 * généré, rien n'est débité · une visite de l'Accueil ne fait que lire.
 *
 * L'aperçu du projet repris est une SORTIE LIVRÉE réelle (`apercuReprise`),
 * lue sous la MÊME garde que la route qui la sert (`/api/studios/media/:id` ·
 * `gardeStudio('studio.read', 'projets')`) · hors portée ⇒ pas d'aperçu.
 */

export interface TeteAccueilProjets {
  etat: EtatAccueilProjets<CarteProjet>;
  /** Adresse gardée de l'aperçu du projet repris · `null` sans sortie livrée. */
  apercu: string | null;
}

export async function chargerTeteAccueilProjets(s: Session, ouvert: (href: string) => boolean): Promise<TeteAccueilProjets> {
  // Le rôle n'ouvre pas les Studios · on ne lit rien.
  if (!doitLireProjetsAccueil(ouvert)) return { etat: { etat: 'ferme' }, apercu: null };

  let lecture: LectureProjetsAccueil<CarteProjet>;
  try {
    const r = await listerProjetsCartes();
    lecture = r.ok
      ? { ok: true, cartes: r.cartes }
      : { ok: false, code: r.code, capacitesCoupees: capacitesDuRefus(r), traceId: r.traceId };
  } catch (e) {
    console.warn('[accueil] lecture des projets impossible', e instanceof Error ? e.message : e);
    lecture = { ok: false, code: 'INTERNAL', traceId: null };
  }

  // « Nouveau projet » · même règle que la liste des projets et que `creerProjet`.
  const peutCreer = aPermissionEspace(contexteDepuisSession(s, [], [], '').permissions, 'studio.propose');
  const etat = resoudreAccueilProjets({ ouvert, lecture, peutCreer });

  let apercu: string | null = null;
  if (etat.etat === 'liste') {
    try {
      apercu = await apercuDuProjet(etat.reprendre.id);
    } catch {
      apercu = null; // un aperçu manquant ne casse jamais l'Accueil
    }
  }
  return { etat, apercu };
}

/** L'aperçu d'un projet · ses sorties, relues dans la portée de la route qui les sert. */
async function apercuDuProjet(projectId: string): Promise<string | null> {
  if (!db) return null;
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return null;
  const ctx = g.ctx;
  if (ctx.marques.length === 0) return null;

  const S = schema.studioAssets;
  const lignes = await db.select({
    id: S.id, workspaceId: S.workspaceId, brandId: S.brandId, projectId: S.projectId,
    origin: S.origin, mime: S.mime, storageState: S.storageState, createdAt: S.createdAt,
    simule: sql<boolean>`(coalesce(${S.rights}->>'simule', '') = 'true' or ${S.storageKey} like 'simule/%')`,
  }).from(S).where(and(
    eq(S.workspaceId, ctx.workspaceId), inArray(S.brandId, ctx.marques), eq(S.projectId, projectId),
    eq(S.storageState, 'stored'), inArray(S.origin, ORIGINES_SORTIE_STUDIO as Array<'generated' | 'render'>),
  )).orderBy(desc(S.createdAt)).limit(12);

  const dansPortee = lignes.filter((l) => objetDansPortee(
    { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque },
    l,
  ));
  if (dansPortee.length === 0) return null;

  const J = schema.studioJobs;
  const lots = lotsLivreurs(await db.select({ state: J.state, qualityStatus: J.qualityStatus, result: J.result }).from(J)
    .where(and(eq(J.workspaceId, ctx.workspaceId), inArray(J.brandId, ctx.marques), eq(J.projectId, projectId))));

  return apercuReprise(projectId, dansPortee.map((l) => ({
    ...l, createdAt: l.createdAt.toISOString(), simule: !!l.simule, lot: lots.get(l.id) ?? null,
  })));
}
