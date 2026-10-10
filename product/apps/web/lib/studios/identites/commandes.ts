import 'server-only';
import { randomBytes } from 'node:crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import {
  lireIdentites, detecterContradictions, construireFiche, changementFiche, changementsLiaison, changementsResolution, libelleAttribut,
  erreurStudio, aPermissionEspace, estIdentiteStructuree, cheminFiche, LIBELLES_CATEGORIE, LISTE_FORMES_COULEUR,
  type ContenuVersion, type ErreurStudio, type IdentiteLue, type Contradiction, type ModeParole, type CategorieAttribut, type VueIdentite,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, lireProjet, lireVersion, type VersionStudio } from '../depot';
import { lireVueVoix, versionDeBase, type VueVoix } from '../voix/voix';
import type { LecteurMedias } from '../rendu/medias';

/**
 * Identités de personnages d'un projet (cahier 01 §4.5, §4.6 · recette VIDEO-02).
 *
 *  · lire · la page « Identités » : fiches, plans, liaisons, contradictions
 *    avec leurs deux résolutions, voix (capacités, modes, prises mesurées).
 *    La visite n'écrit rien et n'appelle aucun modèle.
 *  · enregistrer une fiche, lier une fiche à des plans, résoudre une
 *    contradiction · `studio.propose`, nouvelle version par la commande L1
 *    (base obligatoire, 409 avec différences, audit). Les chemins autorisés
 *    sont calculés ICI (la fiche, ou les références des plans touchés, ou le
 *    seul champ corrigé), jamais reçus du client.
 *  · Une résolution est RECALCULÉE sur la version de base relue en base : le
 *    client n'envoie que l'identifiant de la contradiction et le choix.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;
type Ecriture = Resultat<{ version: VersionStudio; inchange: boolean }>;

export interface PlanVue {
  shotId: string;
  rang: number;
  sujet: string;
  action: string;
  narration: string;
  mode: ModeParole;
  estimeMs: number;
  identites: string[];
}

export interface IdentiteVue {
  identityId: string;
  nom: string;
  structuree: boolean;
  version: number | null;
  description: string;
  vues: VueIdentite[];
  attributs: Array<{ id: string; categorie: CategorieAttribut; libelleCategorie: string; element: string; couleur: string | null; detail: string; libelle: string }>;
  plans: string[];
}

export interface VueIdentites {
  projet: { id: string; title: string; marque: string; kind: string };
  version: { id: string; n: number };
  identites: IdentiteVue[];
  plans: PlanVue[];
  contradictions: Contradiction[];
  voix: VueVoix;
  couleurs: readonly string[];
  peutProposer: boolean;
}

function vueIdentite(i: IdentiteLue): IdentiteVue {
  return {
    identityId: i.identityId, nom: i.nom, structuree: i.structuree, version: i.fiche?.version ?? null, description: i.fiche?.description ?? '', vues: i.fiche?.vues ?? [],
    attributs: i.attributs.map((a) => ({ ...a, libelleCategorie: LIBELLES_CATEGORIE[a.categorie], libelle: libelleAttribut(a) })),
    plans: i.plans,
  };
}

export async function lireVueIdentitesPour(ctx: ContexteStudio, projectId: unknown, o: { lecteur?: LecteurMedias } = {}): Promise<Resultat<{ vue: VueIdentites }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, p.projet.currentVersionId);
  if (!v.ok) return v;
  const c = v.version.content as ContenuVersion;
  const [m] = await db.select({ nom: schema.brands.name }).from(schema.brands).where(and(eq(schema.brands.id, p.projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);
  const identites = lireIdentites(c);
  return {
    ok: true,
    vue: {
      projet: { id: p.projet.id, title: p.projet.title, marque: m?.nom ?? '', kind: p.projet.kind },
      version: { id: v.version.id, n: v.version.n },
      identites: identites.map(vueIdentite),
      plans: c.shots.order.filter((s) => c.shots.byId[s]).map((s, i) => {
        const x = c.shots.byId[s]!;
        return { shotId: s, rang: i + 1, sujet: x.subject, action: x.action, narration: x.narration, mode: x.speechMode, estimeMs: x.estimatedDurationMs, identites: identites.filter((k) => x.referenceIds.includes(k.identityId)).map((k) => k.identityId) };
      }),
      contradictions: detecterContradictions(c),
      voix: await lireVueVoix(ctx, p.projet, c, o.lecteur),
      couleurs: LISTE_FORMES_COULEUR,
      peutProposer: aPermissionEspace(ctx.permissions, 'studio.propose'),
    },
  };
}

/**
 * Crée ou modifie une fiche · `identityId` absent ⇒ nouvelle fiche, identifiant
 * alloué par le serveur. Une fiche ancienne (non structurée) n'est remplacée
 * que par une fiche structurée complète, jamais fusionnée en silence.
 */
export async function enregistrerIdentitePour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; identityId?: unknown; nom: unknown; attributs: unknown; vues?: unknown; description?: unknown }): Promise<Ecriture> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const base = await versionDeBase(ctx, e.projectId, e.baseVersionId);
  if (!base.ok) return base;
  const c = base.version.content as ContenuVersion;
  let identityId: string;
  if (e.identityId === undefined || e.identityId === null || e.identityId === '') {
    do identityId = `perso_${randomBytes(4).toString('hex')}`; while (Object.prototype.hasOwnProperty.call(c.characterRefs, identityId));
  } else if (typeof e.identityId === 'string' && Object.prototype.hasOwnProperty.call(c.characterRefs, e.identityId)) {
    identityId = e.identityId;
  } else {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'identityId', raison: 'identité inconnue dans cette version' }] });
  }
  const precedente = c.characterRefs[identityId];
  const r = construireFiche(identityId, { nom: e.nom, attributs: e.attributs, vues: e.vues, description: e.description }, estIdentiteStructuree(precedente) ? precedente : null);
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations });
  if (r.inchangee) return { ok: true, version: base.version, inchange: true };
  const ch = changementFiche(c, r.fiche, `Fiche « ${r.fiche.nom} » · version ${r.fiche.version}`);
  return enregistrerVersion(ctx, {
    projectId: base.projet.id, baseVersionId: base.version.id, changes: [ch], allowedPaths: [cheminFiche(identityId)],
    raison: precedente ? `Fiche d’identité « ${r.fiche.nom} » · version ${r.fiche.version}` : `Fiche d’identité « ${r.fiche.nom} » créée`,
  });
}

/** Lie une fiche à exactement ces plans · seules les références des plans qui changent sont réécrites. */
export async function lierIdentitePour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; identityId: unknown; shotIds: unknown }): Promise<Ecriture> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const base = await versionDeBase(ctx, e.projectId, e.baseVersionId);
  if (!base.ok) return base;
  if (typeof e.identityId !== 'string' || !Array.isArray(e.shotIds) || e.shotIds.length > 100 || !e.shotIds.every((s) => typeof s === 'string')) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotIds', raison: 'identité et liste de plans attendues' }] });
  }
  const r = changementsLiaison(base.version.content as ContenuVersion, e.identityId, e.shotIds as string[]);
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations });
  if (r.changes.length === 0) return { ok: true, version: base.version, inchange: true };
  const nom = lireIdentites(base.version.content as ContenuVersion).find((i) => i.identityId === e.identityId)?.nom ?? e.identityId;
  return enregistrerVersion(ctx, { projectId: base.projet.id, baseVersionId: base.version.id, changes: r.changes, allowedPaths: r.allowedPaths, raison: `Liaison de « ${nom} » aux plans · ${(e.shotIds as string[]).join(', ') || 'aucun'}` });
}

/** Applique UNE des deux résolutions proposées, recalculée sur la version de base relue en base. */
export async function resoudreContradictionPour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; contradictionId: unknown; choix: unknown }): Promise<Ecriture> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (typeof e.contradictionId !== 'string' || (e.choix !== 'plan' && e.choix !== 'identite')) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'choix', raison: 'corriger le plan ou changer la fiche' }] });
  }
  const base = await versionDeBase(ctx, e.projectId, e.baseVersionId);
  if (!base.ok) return base;
  const r = changementsResolution(base.version.content as ContenuVersion, e.contradictionId, e.choix);
  if (!r.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'contradictionId', raison: r.raison }] });
  return enregistrerVersion(ctx, { projectId: base.projet.id, baseVersionId: base.version.id, changes: r.changes, allowedPaths: r.allowedPaths, raison: r.raison });
}
