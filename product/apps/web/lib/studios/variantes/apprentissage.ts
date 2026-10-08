import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  lireResultat, arbitrerRelecture, briefIteration, lireRegistre, testDuLien, ajouterAuRegistre, coutMaxRelectureUsd, traceDuBrief,
  validerContenuVersion, empreinteContenu, differencesDetaillees, erreurStudio, VARIABLES_TEST, SCHEMA_VERSION_CONTENU,
  type Lecture, type VerdictLu, type TestedVariable, type StatutIsolation, type RelectureApprentissage, type EntreeRegistreIteration,
  type ContenuVersion, type VerdictRelecture, type EntreeRegistreTest,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import type { BaseStudio, ExecStudio } from '../execution/types';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import { porteeSql, horsPortee, introuvable, echecPersistance, Refus, estUuid, iso, type Resultat } from './commun';

/**
 * Boucle d'apprentissage (cahier 01 §4.8, FLOW-09).
 *
 *  · `lireApprentissage` · LECTURE PURE : le résultat du test lu par les règles
 *    Adsmap existantes (`lireResultat`), sans appel ni coût ;
 *  · `relireApprentissage` · la tâche `learning.review` du registre, par
 *    `executerTache` (release, traces, barrière de dépense en production,
 *    adaptateur simulé en test seulement). Coût annoncé avant le clic et
 *    revérifié ici. Sans release publiée : refus honnête, et la lecture pure
 *    reste rendue. La règle pure prime sur le modèle (`arbitrerRelecture`) ;
 *  · `iterer` · nouvelle version de brief ENFANT qui garde sources, hypothèse,
 *    références et la variable (ou la suivante), parente = la version de la
 *    variante. Aucune génération, aucun devis.
 */

const P = schema.studioProjects;
const VA = schema.studioVariants;
const V = schema.studioProjectVersions;
const TL = schema.studioTestLinks;

const verdictDe = (r: { computed: string | null; validated: string | null; comparable: boolean | null; failedStage: string | null; killFlag: string | null; computedAt: Date | null } | undefined): VerdictLu | null => {
  if (!r || (!r.computed && !r.validated)) return null;
  return { computed: r.computed as VerdictLu['computed'], validated: r.validated as VerdictLu['validated'], comparable: r.comparable ?? false, failedStage: r.failedStage as VerdictLu['failedStage'], killFlag: r.killFlag as VerdictLu['killFlag'], computedAt: iso(r.computedAt) };
};

async function dernierLien(ex: ExecStudio, ctx: ContexteStudio, variantId: string) {
  const [l] = await ex.select({
    linkId: TL.id, adsmapAdId: TL.adsmapAdId, workspaceId: TL.workspaceId, brandId: TL.brandId,
    testedVariable: schema.ads.testedVariable, hypothesis: schema.ads.hypothesis,
    computed: schema.verdicts.computed, validated: schema.verdicts.validated, comparable: schema.verdicts.comparable,
    failedStage: schema.verdicts.failedStage, killFlag: schema.verdicts.killFlag, computedAt: schema.verdicts.computedAt,
  }).from(TL)
    .innerJoin(schema.ads, and(eq(schema.ads.id, TL.adsmapAdId), eq(schema.ads.workspaceId, ctx.workspaceId)))
    .leftJoin(schema.verdicts, eq(schema.verdicts.adId, TL.adsmapAdId))
    .where(and(eq(TL.variantId, variantId), porteeSql(TL, ctx)))
    .orderBy(desc(TL.createdAt)).limit(1);
  return l && !horsPortee(ctx, l) ? l : null;
}

export interface LectureDuTest {
  linkId: string;
  adsmapAdId: string;
  variantId: string;
  versionId: string;
  projectId: string;
  brandId: string;
  hypothese: string;
  variable: TestedVariable;
  verdict: VerdictLu | null;
  lecture: Lecture;
  /** Champs du test que l'ad Adsmap n'a pas (registre du projet), s'ils existent. */
  entree: EntreeRegistreTest | null;
}

/** Lit un test et son résultat · LECTURE PURE. Par lien, ou par variante (son test le plus récent). */
export async function lireApprentissage(ctx: ContexteStudio, e: { linkId?: unknown; variantId?: unknown }, base: BaseStudio = db): Promise<Resultat<{ test: LectureDuTest }>> {
  let variantId: string | null = null;
  if (estUuid(e.linkId)) {
    const [l] = await base.select({ variantId: TL.variantId, workspaceId: TL.workspaceId, brandId: TL.brandId }).from(TL).where(and(eq(TL.id, e.linkId), porteeSql(TL, ctx))).limit(1);
    if (horsPortee(ctx, l)) return introuvable(ctx);
    variantId = l!.variantId;
  } else if (estUuid(e.variantId)) variantId = e.variantId;
  else return introuvable(ctx);

  const [v] = await base.select().from(VA).where(and(eq(VA.id, variantId), porteeSql(VA, ctx))).limit(1);
  if (horsPortee(ctx, v)) return introuvable(ctx);
  const va = v!;
  const lien = await dernierLien(base, ctx, va.id);
  if (!lien || (estUuid(e.linkId) && lien.linkId !== e.linkId)) {
    if (!lien) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [va.id], message: 'Cette variante n’est rattachée à aucun test · rattache-la avant de lire un résultat.' });
  }
  const [projet] = await base.select({ testRefs: P.testRefs, workspaceId: P.workspaceId, brandId: P.brandId }).from(P).where(and(eq(P.id, va.projectId), porteeSql(P, ctx))).limit(1);
  if (horsPortee(ctx, projet)) return introuvable(ctx);
  const entree = testDuLien(lireRegistre(projet!.testRefs), lien!.linkId);
  const parentLien = va.parentVariantId ? await dernierLien(base, ctx, va.parentVariantId) : null;
  const variable = (lien!.testedVariable ?? entree?.variable ?? 'none_control') as TestedVariable;
  const verdict = verdictDe(lien!);
  const lecture = lireResultat({
    variable,
    isolation: (entree?.isolation.statut ?? (va.parentVariantId ? 'plusieurs' : 'sans_parent')) as StatutIsolation,
    verdict,
    parent: va.parentVariantId ? { verdict: parentLien ? verdictDe(parentLien) : null } : null,
  });
  return {
    ok: true,
    test: {
      linkId: lien!.linkId, adsmapAdId: lien!.adsmapAdId, variantId: va.id, versionId: va.projectVersionId, projectId: va.projectId, brandId: va.brandId,
      hypothese: lien!.hypothesis ?? entree?.hypothese ?? '', variable, verdict, lecture, entree,
    },
  };
}

/* ────────────────────────── relireApprentissage ──────────────────────────── */

export interface OptionsRelecture {
  /** `null` si aucun fournisseur n'est configuré · refus honnête, aucun repli. */
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  /** Modèle servi pour le profil texte · fixe le plafond annoncé. */
  modele: string;
}

export interface ResultatRelecture {
  test: LectureDuTest;
  relecture: RelectureApprentissage | null;
  /** Relecture IA impossible (pas de release, fournisseur absent…) · la lecture pure reste valable. */
  indisponible: { code: string; message: string } | null;
  runId: string | null;
  coutMaxUsd: number;
}

const MESSAGE_INDISPONIBLE: Record<string, string> = {
  RELEASE_ACTIVE_ABSENTE: 'La relecture IA n’est pas encore activée (aucune release de prompts publiée) · voici la lecture des règles de mesure, sans appel et sans coût.',
  FOURNISSEUR_ABSENT: 'Aucun fournisseur IA n’est configuré · voici la lecture des règles de mesure, sans appel et sans coût.',
  UNSUPPORTED_CAPABILITY: 'Ce type de relecture n’est pas branché · voici la lecture des règles de mesure, sans appel et sans coût.',
};

/**
 * Relecture IA d'un résultat · `learning.review` par le résolveur UNIQUE.
 * Le coût maximal est recalculé ici et doit égaler celui annoncé avant le clic.
 * Une demande conversationnelle ne vaut pas approbation : seule cette commande,
 * avec le coût annoncé, lance l'appel.
 */
export async function relireApprentissage(ctx: ContexteStudio, e: { linkId: unknown; coutAnnonceUsd: unknown; notes?: unknown }, o: OptionsRelecture, base: BaseStudio = db): Promise<Resultat<ResultatRelecture>> {
  const lu = await lireApprentissage(ctx, { linkId: e.linkId }, base);
  if (!lu.ok) return lu;
  const t = lu.test;
  const coutMaxUsd = coutMaxRelectureUsd(o.modele);
  const sansAppel = (code: string): Resultat<ResultatRelecture> => ({ ok: true, test: t, relecture: null, indisponible: { code, message: MESSAGE_INDISPONIBLE[code] ?? 'La relecture IA est indisponible · voici la lecture des règles de mesure, sans appel et sans coût.' }, runId: null, coutMaxUsd });

  if (!o.adaptateur) return sansAppel('FOURNISSEUR_ABSENT');
  if (typeof e.coutAnnonceUsd !== 'number' || Math.abs(e.coutAnnonceUsd - coutMaxUsd) > 1e-9) {
    return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [t.linkId], message: `Le coût annoncé a changé (${coutMaxUsd.toFixed(2)} $ au plus) · relis-le, puis relance.` });
  }
  const notes = typeof e.notes === 'string' ? e.notes.slice(0, 2000) : '';
  // Le contrat exige des DOCUMENTS résolus pour le test, l'hypothèse et la mesure (un ID seul ne suffit pas).
  // Le registre ne connaît que Shot, Style, Fact et Reference : ils sont donc rendus comme des faits typés
  // (déclaré, hypothèse, mesuré) · besoin écrit au rapport (schémas Test et MetricSnapshot).
  const sourceVerdict = `verdict:${t.adsmapAdId}`;
  const fait = (id: string, claim: string, kind: 'declared' | 'hypothesis' | 'measured', sourceIds: string[]) => {
    const content = { id, claim: claim.slice(0, 12000), sourceIds, kind, confidence: kind === 'measured' ? 'high' : 'medium' };
    return { id, version: t.verdict?.computedAt ?? 'v1', schemaKey: 'Fact', content, sha256: empreinteContenu(content) };
  };
  const idTest = `test:${t.linkId}`;
  const idHypothese = `hypothese:${t.variantId}`;
  const idMesure = `mesure:${t.adsmapAdId}`;
  const r = await executerTache({
    templateKey: 'learning.review',
    portee: { workspaceId: ctx.workspaceId, brandId: t.brandId },
    acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs: { testId: idTest, metricSnapshotIds: [idMesure], hypothesisId: idHypothese, humanNotes: notes },
    contexte: {
      projectVersionId: t.versionId,
      sources: [{
        sourceId: sourceVerdict, version: t.verdict?.computedAt ?? 'aucun', titre: 'Résultat Adsmap',
        text: JSON.stringify({ verdict: t.verdict, lectureDesRegles: { conclusion: t.lecture.conclusion, motif: t.lecture.motif, reference: t.lecture.reference } }),
      }],
      resolvedDocuments: [
        fait(idTest, `Test de la variable « ${t.variable} »${t.entree ? ` · objectif ${t.entree.objectif} · protocole ${t.entree.protocole} · période du ${t.entree.periode.debut} au ${t.entree.periode.fin} · métrique ${t.entree.metrique} · isolation ${t.entree.isolation.statut}` : ''}.`, 'declared', []),
        fait(idHypothese, t.hypothese || 'Hypothèse non écrite.', 'hypothesis', []),
        fait(idMesure, t.verdict ? JSON.stringify(t.verdict) : 'Aucun résultat mesuré.', 'measured', [sourceVerdict]),
      ],
      allocatedIds: [0, 1, 2, 3, 4].map((i) => ({ id: `observation_${i + 1}`, entityType: 'fact' as const, ordinal: i })),
    },
    liens: { projectId: t.projectId, documentVersionId: t.versionId },
    adaptateur: o.adaptateur,
    environnement: o.environnement,
  });
  if (!r.ok) {
    if (r.code === 'BUDGET_EXCEEDED') return erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId, targetIds: [t.linkId] });
    if (r.code in MESSAGE_INDISPONIBLE) return { ...sansAppel(r.code), runId: r.runId } as Resultat<ResultatRelecture>;
    return erreurStudio('PROVIDER_UNCERTAIN', { traceId: ctx.traceId, targetIds: [t.linkId], message: 'La relecture n’a pas abouti · rien n’est relancé. La lecture des règles de mesure reste valable.' });
  }

  const res = (r.sortie as { result?: { verdict?: string; learning?: string; nextVariable?: string } | null }).result ?? null;
  const verdictModele: VerdictRelecture = res?.verdict === 'supported' || res?.verdict === 'not_supported' ? res.verdict : 'inconclusive';
  const arb = arbitrerRelecture(t.lecture, verdictModele);
  // La variable du prochain brief reste celle des règles · la suggestion du modèle est citée dans l'apprentissage.
  const relecture: RelectureApprentissage = {
    conclusion: arb.conclusion,
    apprentissage: (res?.learning ?? '').slice(0, 2000) || 'La relecture n’a rien ajouté aux règles de mesure.',
    variableSuivante: t.lecture.variableSuivante,
    ecart: arb.ecart,
    le: new Date().toISOString(),
  };
  try {
    await ajouterAudit(base, ctx, {
      action: 'learning.review', brandId: t.brandId, targetType: 'studio_test_link', targetId: t.linkId,
      versionAfter: t.versionId, reason: 'relecture IA du résultat',
      details: { ...relecture, runId: r.runId, releaseId: r.releaseId, modeleSuivi: arb.modeleSuivi, verdictModele, suggestionModele: (res?.nextVariable ?? '').slice(0, 200) },
    });
  } catch (err) {
    return echecPersistance(ctx, err);
  }
  return { ok: true, test: t, relecture, indisponible: null, runId: r.runId, coutMaxUsd };
}

/* ───────────────────────────────── iterer ────────────────────────────────── */

export interface EntreeIteration { variantId: unknown; baseVersionId: unknown; variable?: unknown; raison?: unknown }

export interface ResultatIteration {
  version: { id: string; n: number; parentId: string };
  variable: TestedVariable;
  variableGardee: boolean;
  entree: EntreeRegistreIteration;
}

/**
 * Nouveau brief ENFANT depuis une variante. La version créée devient courante
 * (c'est le brief sur lequel on travaille), sa parente est la version de la
 * variante (la branche réelle, même ancienne). La version courante attendue est
 * comparée à la vraie : périmée ⇒ 409 avec le diff, rien n'est écrit.
 */
export async function iterer(ctx: ContexteStudio, e: EntreeIteration, base: BaseStudio = db): Promise<Resultat<ResultatIteration>> {
  if (!estUuid(e.variantId)) return introuvable(ctx);
  if (!estUuid(e.baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  const variantId = e.variantId;
  const baseVersionId = e.baseVersionId;
  let demandee: TestedVariable | null = null;
  if (e.variable !== undefined && e.variable !== null && e.variable !== '') {
    if (!(VARIABLES_TEST as readonly unknown[]).includes(e.variable) || e.variable === 'none_control') {
      return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'variable', raison: 'Choisis la variable du prochain brief (une seule).' }] });
    }
    demandee = e.variable as TestedVariable;
  }
  const [v0] = await base.select({ projectId: VA.projectId, workspaceId: VA.workspaceId, brandId: VA.brandId }).from(VA).where(and(eq(VA.id, variantId), porteeSql(VA, ctx))).limit(1);
  if (horsPortee(ctx, v0)) return introuvable(ctx);
  // Lecture du test hors transaction (lecture pure) · la variable suivante vient des règles.
  const lu = await lireApprentissage(ctx, { variantId }, base);
  const lecture = lu.ok ? lu.test : null;

  try {
    return await base.transaction(async (tx) => {
      const [projet] = await tx.select().from(P).where(and(eq(P.id, v0!.projectId), porteeSql(P, ctx))).limit(1).for('update');
      if (horsPortee(ctx, projet) || !projet!.currentVersionId) throw new Refus(introuvable(ctx));
      const [variante] = await tx.select().from(VA).where(and(eq(VA.id, variantId), porteeSql(VA, ctx))).limit(1).for('update');
      if (horsPortee(ctx, variante)) throw new Refus(introuvable(ctx));
      const va = variante!;
      const [courante] = await tx.select().from(V).where(and(eq(V.id, projet!.currentVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
      if (!courante) throw new Refus(introuvable(ctx));
      if (courante.id !== baseVersionId) {
        const [b] = await tx.select({ content: V.content }).from(V).where(and(eq(V.id, baseVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
        throw new Refus(erreurStudio('VERSION_CONFLICT', {
          traceId: ctx.traceId, targetIds: [projet!.id, courante.id],
          conflit: { versionCouranteId: courante.id, differences: b ? differencesDetaillees(b.content, courante.content) : [] },
        }));
      }
      const [depuis] = await tx.select().from(V).where(and(eq(V.id, va.projectVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
      if (!depuis) throw new Refus(introuvable(ctx));

      const variableTest = (lecture?.variable && lecture.variable !== 'none_control' ? lecture.variable : null)
        ?? ((VARIABLES_TEST as readonly string[]).includes(va.testedVariable ?? '') && va.testedVariable !== 'none_control' ? va.testedVariable as TestedVariable : null);
      const variable = demandee ?? lecture?.lecture.variableSuivante ?? variableTest;
      if (!variable || variable === 'none_control') {
        throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'variable', raison: 'Choisis la variable du prochain brief (une seule).' }] }));
      }
      const contenuDepuis = depuis.content as ContenuVersion;
      const prep = briefIteration(contenuDepuis.brief, variable);
      if (!prep.ok) throw new Refus(erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [va.id], message: prep.raison }));
      const contenu: ContenuVersion = { ...contenuDepuis, brief: prep.brief };
      const violations = validerContenuVersion(contenu);
      if (violations.length) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations }));

      const variableGardee = variableTest !== null && variable === variableTest;
      const raison = typeof e.raison === 'string' && e.raison.trim() ? e.raison.slice(0, 2000)
        : `Itération depuis ${va.label} (version ${depuis.n}) · ${variableGardee ? 'même variable' : 'variable suivante'} : ${variable}`;
      const [nouvelle] = await tx.insert(V).values({
        projectId: projet!.id, workspaceId: projet!.workspaceId, brandId: projet!.brandId, parentId: depuis.id,
        n: courante.n + 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu),
        promptReleaseId: null, authorId: ctx.userId, reason: raison,
      }).returning();
      const entree: EntreeRegistreIteration = {
        type: 'iteration', versionId: nouvelle!.id, depuisVersionId: depuis.id, parentVariantId: va.id, linkId: lecture?.linkId ?? null,
        variable, variableGardee, sourceIds: prep.sourceIds.length ? prep.sourceIds : traceDuBrief(contenuDepuis.brief).sourceIds,
        creeLe: new Date().toISOString(), creePar: ctx.userId,
      };
      const maj = await tx.update(P)
        .set({ currentVersionId: nouvelle!.id, rowVersion: projet!.rowVersion + 1, testRefs: ajouterAuRegistre(projet!.testRefs, entree), updatedAt: new Date() })
        .where(and(eq(P.id, projet!.id), eq(P.rowVersion, projet!.rowVersion), porteeSql(P, ctx)))
        .returning({ id: P.id });
      if (maj.length !== 1) throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [projet!.id], conflit: { versionCouranteId: courante.id, differences: [] } }));
      await ajouterAudit(tx, ctx, {
        action: 'project.iterate', brandId: projet!.brandId, targetType: 'studio_project', targetId: projet!.id,
        versionBefore: courante.id, versionAfter: nouvelle!.id, reason: raison,
        details: { parentVariantId: va.id, depuisVersionId: depuis.id, variable, variableGardee, linkId: entree.linkId, sourceIds: entree.sourceIds, conclusion: lecture?.lecture.conclusion ?? null },
      });
      return { ok: true as const, version: { id: nouvelle!.id, n: nouvelle!.n, parentId: depuis.id }, variable, variableGardee, entree };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}
