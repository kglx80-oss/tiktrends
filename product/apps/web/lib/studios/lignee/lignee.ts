import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  projeterLignee, lireReferencesSources, traceDuBrief, presentationSource, titreSource, erreurStudio,
  type ModeleLignee, type EntreeLignee, type BriefLignee, type SourceLignee, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { listerVariantes } from '../variantes/variantes';
import { etatSources } from '../sources/sources';

/**
 * Projection de LIGNÉE d'un projet (V5, lecture seule) · le serveur LIT, le
 * noyau PROJETTE (`projeterLignee`).
 *
 * N'écrit rien, ne déclenche aucune génération, n'annonce aucune dépense. Tout
 * vient de données existantes, relues dans la portée (espace + marque) :
 *  · `listerVariantes` fournit versions (`parentId`), variantes, lots, tests,
 *    verdicts et apprentissages ;
 *  · le brief de chaque version est lu dans `content->'brief'` (hypothèse,
 *    variable, intention de style, objectif) ;
 *  · `sourceRefs` donne les références Veille, présentées comme ailleurs.
 *
 * Les seules vraies données nouvelles de la lignée V5 (note, fiche marque) ne
 * sont pas lues ici : elles demandent une migration (lot ultérieur).
 */

type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface LigneeProjetLue {
  projet: { id: string; titre: string; marque: string };
  lignee: ModeleLignee;
  versionCouranteId: string | null;
}

const P = schema.studioProjects;
const V = schema.studioProjectVersions;

const texte = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

/** Trace du brief d'une version · hypothèse, variable, intention de style, objectif. */
function briefDeContenu(brief: unknown): BriefLignee {
  const t = traceDuBrief(brief);
  const b = (typeof brief === 'object' && brief !== null && !Array.isArray(brief)) ? brief as Record<string, unknown> : null;
  return {
    objectif: b ? texte(b.objective) : null,
    hypothese: t.hypothese,
    hypotheseId: t.hypotheseId,
    variable: t.variable,
    direction: b ? texte(b.styleIntent) : null,
  };
}

export async function lireLigneeProjetPour(
  ctx: ContexteStudio,
  projectId: unknown,
  o: { veilleOuverte: boolean; maintenant: Date },
): Promise<Resultat<{ lignee: LigneeProjetLue }>> {
  // Variantes, lots, tests, verdicts, apprentissages · la lecture relit sa portée.
  // `adsmapAcces` false : la lignée n'a pas besoin des offres/pages du rattachement ;
  // les verdicts sont lus dans tous les cas (`liensEtVerdicts`).
  const rv = await listerVariantes(ctx, { projectId }, { adsmapAcces: false, relecture: { disponible: false, raison: null, coutMaxUsd: null } });
  if (!rv.ok) return rv;
  const donnees = rv.donnees;

  // Projet (titre, marque, sources) · déjà filtré par `listerVariantes`, relu pour la portée.
  if (typeof projectId !== 'string') return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const [projet] = await db.select({ id: P.id, title: P.title, brandId: P.brandId, sourceRefs: P.sourceRefs, workspaceId: P.workspaceId })
    .from(P).where(and(eq(P.id, projectId), eq(P.workspaceId, ctx.workspaceId))).limit(1);
  if (!projet || !ctx.marques.includes(projet.brandId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

  const [marque] = await db.select({ nom: schema.brands.name }).from(schema.brands)
    .where(and(eq(schema.brands.id, projet.brandId), eq(schema.brands.workspaceId, ctx.workspaceId))).limit(1);

  // Brief de chaque version · seul le sous-champ `brief`, pas tout le contenu.
  const lignesBrief = await db.select({ id: V.id, brief: V.content }).from(V)
    .where(and(eq(V.projectId, projet.id), eq(V.workspaceId, ctx.workspaceId)));
  const briefs: Record<string, BriefLignee> = {};
  for (const l of lignesBrief) {
    const b = (l.brief as { brief?: unknown } | null)?.brief ?? null;
    if (b !== null) briefs[l.id] = briefDeContenu(b);
  }

  // Références Veille, présentées comme ailleurs (lien de retour réel quand il existe).
  const { sources: refs } = lireReferencesSources(projet.sourceRefs);
  const vues = await etatSources(ctx, refs, o);
  const sources: SourceLignee[] = vues.map((s) => ({
    sourceId: s.sourceId,
    titre: titreSource(s),
    presentation: presentationSource(s),
    lien: s.lienSource,
  }));

  const entree: EntreeLignee = {
    projet: { id: projet.id, titre: projet.title, marque: marque?.nom ?? '' },
    sources,
    briefs,
    donnees,
  };
  return {
    ok: true,
    lignee: {
      projet: entree.projet,
      lignee: projeterLignee(entree),
      versionCouranteId: donnees.projet.versionCouranteId,
    },
  };
}
