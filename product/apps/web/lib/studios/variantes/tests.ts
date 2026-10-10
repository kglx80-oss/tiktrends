import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  validerSaisieTest, decisionRattachement, isolationVariable, ajouterAuRegistre, formatAdPourGeneration, natureDuMime,
  checkIteration, wouldCreateCycle, erreurStudio,
  type LienExistant, type EntreeRegistreTest, type Isolation, type SaisieTest, type VerdictValue,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import type { BaseStudio, TxStudio } from '../execution/types';
import { porteeSql, horsPortee, introuvable, echecPersistance, Refus, estUuid, violationUnicite, type Resultat } from './commun';

/**
 * `linkVariantToTest` (plan 06 §3) · relie UNE variante (un média précis) à son
 * test Adsmap, avec la filiation et les droits.
 *
 * ── Les objets Adsmap sont réutilisés, pas doublés ──────────────────────────
 *
 * Le test EST une ad Adsmap (`adsmap_ads` : hypothèse, variable, valeur, offre,
 * page ; verdict et apprentissage par le moteur existant). Si la personne
 * désigne une fiche existante, elle est relue et complétée (champs vides
 * seulement, un désaccord est refusé). Sinon une fiche `draft` est créée, comme
 * le fait le pont du studio : même graphe « À qualifier », un concept par
 * projet, l'enfant d'une variante testée rejoint le concept de sa parente
 * (`v1-i1`, comme `createIterationAction`), et l'arête d'itération Adsmap n'est
 * posée que si la règle `checkIteration` l'autorise (parente gagnante prouvée).
 * Rien n'est passé en `ready` : l'offre et la page restent à confirmer dans
 * Adsmap (invariant §2.4).
 *
 * Le lien variante ↔ ad vit dans `studio_test_links` (une ad = une variante, en
 * base). L'ad porte aussi `source_ref_json` : variante, média, version, job,
 * position, lot, parente, release · « image 3 du lot 4 », jamais seulement un
 * identifiant de génération (FLOW-08). Objectif, période, métrique et isolation,
 * que l'ad n'a pas, vont au registre du projet (`test_refs`).
 *
 * ── Concurrence ──────────────────────────────────────────────────────────────
 *
 * Projet puis variante verrouillés (`FOR UPDATE`, toujours dans cet ordre, comme
 * `iterer`) : deux rattachements simultanés de la même variante passent l'un
 * après l'autre, le second rend le lien du premier. Deux variantes vers la même
 * ad : l'unicité `studio_test_links_ad_uq` tranche, le perdant reçoit un refus.
 *
 * Le graphe « À qualifier » est trouvé ou créé DANS la transaction (même
 * logique que `lib/adsmap-path.ts`, qui n'accepte pas de transaction · besoin
 * écrit au rapport).
 */

const P = schema.studioProjects;
const VA = schema.studioVariants;
const V = schema.studioProjectVersions;
const TL = schema.studioTestLinks;
const AD = schema.ads;

export interface EntreeRattachement {
  variantId: unknown;
  saisie: unknown;
}

export interface LienPresente {
  linkId: string;
  variantId: string;
  adsmapAdId: string;
  adsmapHref: string;
  creee: boolean;
  isolation: Isolation;
  areteIteration: boolean;
}

/** L'ad appartient-elle à cette marque ? Une ad n'a pas de colonne marque : on remonte son graphe. */
async function adDeLaMarque(tx: TxStudio, workspaceId: string, brandId: string, adId: string) {
  const [r] = await tx.select({
    id: AD.id, status: AD.status, conceptId: AD.conceptId, variantCode: AD.variantCode, format: AD.format,
    hypothesis: AD.hypothesis, testedVariable: AD.testedVariable, variableValue: AD.variableValue,
    offerId: AD.offerId, landingPageId: AD.landingPageId, sourceRef: AD.sourceRef,
  }).from(AD)
    .innerJoin(schema.concepts, eq(AD.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .where(and(eq(AD.id, adId), eq(AD.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)))
    .limit(1)
    .for('update', { of: AD });
  return r ?? null;
}

/** Chemin persona → désir → angle « À qualifier », trouvé ou créé dans la transaction (même règle que `adsmap-path.ts`). */
async function cheminAQualifier(tx: TxStudio, workspaceId: string, brandId: string, angleLabel: string): Promise<string> {
  const nom = 'À qualifier';
  let [persona] = await tx.select({ id: schema.personas.id }).from(schema.personas)
    .where(and(eq(schema.personas.brandId, brandId), eq(schema.personas.name, nom))).limit(1);
  persona ??= (await tx.insert(schema.personas).values({
    brandId, name: nom, status: 'proposed',
    description: 'Persona provisoire · créé automatiquement en rattachant une créa à la carte. À scinder en avatars réels.',
  }).returning({ id: schema.personas.id }))[0]!;
  const desireLabel = 'À qualifier (Studio)';
  let [desir] = await tx.select({ id: schema.desires.id }).from(schema.desires)
    .where(and(eq(schema.desires.personaId, persona.id), eq(schema.desires.label, desireLabel))).limit(1);
  desir ??= (await tx.insert(schema.desires).values({ workspaceId, personaId: persona.id, label: desireLabel, status: 'proposed' }).returning({ id: schema.desires.id }))[0]!;
  let [angle] = await tx.select({ id: schema.angles.id }).from(schema.angles)
    .where(and(eq(schema.angles.desireId, desir.id), eq(schema.angles.label, angleLabel))).limit(1);
  // Mécanisme : repli assumé `demo`, comme le pont du studio · l'humain corrige dans la carte.
  angle ??= (await tx.insert(schema.angles).values({ workspaceId, desireId: desir.id, label: angleLabel, mechanism: 'demo', status: 'proposed' }).returning({ id: schema.angles.id }))[0]!;
  return angle.id;
}

async function codeLibre(tx: TxStudio, conceptId: string, base: string | null): Promise<string> {
  // Verrou du concept · deux créations dans le même concept ne prennent pas le même code.
  await tx.select({ id: schema.concepts.id }).from(schema.concepts).where(eq(schema.concepts.id, conceptId)).limit(1).for('update');
  const pris = new Set((await tx.select({ c: AD.variantCode }).from(AD).where(eq(AD.conceptId, conceptId))).map((r) => r.c));
  if (base) {
    let i = 1;
    while (pris.has(`${base}-i${i}`)) i++;
    return `${base}-i${i}`;
  }
  let n = pris.size + 1;
  while (pris.has(`v${n}`)) n++;
  return `v${n}`;
}

export async function rattacherVarianteAuTest(ctx: ContexteStudio, e: EntreeRattachement, base: BaseStudio = db): Promise<Resultat<{ lien: LienPresente; deja: boolean }>> {
  if (!estUuid(e.variantId)) return introuvable(ctx);
  const variantId = e.variantId;
  // Lecture hors transaction pour connaître le projet · tout est relu sous verrou ensuite.
  const [v0] = await base.select({ projectId: VA.projectId, workspaceId: VA.workspaceId, brandId: VA.brandId }).from(VA).where(and(eq(VA.id, variantId), porteeSql(VA, ctx))).limit(1);
  if (horsPortee(ctx, v0)) return introuvable(ctx);

  try {
    return await base.transaction(async (tx) => {
      const [projet] = await tx.select().from(P).where(and(eq(P.id, v0!.projectId), porteeSql(P, ctx))).limit(1).for('update');
      if (horsPortee(ctx, projet)) throw new Refus(introuvable(ctx));
      const [variante] = await tx.select().from(VA).where(and(eq(VA.id, variantId), porteeSql(VA, ctx))).limit(1).for('update');
      if (horsPortee(ctx, variante)) throw new Refus(introuvable(ctx));
      const va = variante!;

      const s = validerSaisieTest(e.saisie, { aUnParent: va.parentVariantId !== null });
      // Le formulaire est validé AVANT le double clic : une saisie invalide n'est jamais « déjà faite ».
      if (!s.ok) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: s.violations }));
      const saisie: SaisieTest = s.saisie;

      const liens = await tx.select({ linkId: TL.id, variantId: TL.variantId, adsmapAdId: TL.adsmapAdId, adStatus: AD.status })
        .from(TL).innerJoin(AD, eq(AD.id, TL.adsmapAdId))
        .where(and(eq(TL.variantId, va.id), porteeSql(TL, ctx)));
      let cible: Awaited<ReturnType<typeof adDeLaMarque>> = null;
      let lienCible: LienExistant | null = null;
      if (saisie.adsmapAdId) {
        cible = await adDeLaMarque(tx, ctx.workspaceId, va.brandId, saisie.adsmapAdId);
        if (!cible) throw new Refus(introuvable(ctx));
        const [lc] = await tx.select({ linkId: TL.id, variantId: TL.variantId, adsmapAdId: TL.adsmapAdId }).from(TL).where(eq(TL.adsmapAdId, cible.id)).limit(1);
        lienCible = lc ? { ...lc, adStatus: cible.status } : null;
      }

      // Isolation · contenu de la version de la parente contre celui de la variante.
      const [verEnfant] = await tx.select({ content: V.content }).from(V).where(and(eq(V.id, va.projectVersionId), porteeSql(V, ctx))).limit(1);
      let parent: { versionId: string; content: unknown; adId: string | null; variantCode: string | null; conceptId: string | null; verdict: VerdictValue | null; comparable: boolean } | null = null;
      if (va.parentVariantId) {
        const [pv] = await tx.select({ versionId: VA.projectVersionId, content: V.content }).from(VA)
          .innerJoin(V, eq(V.id, VA.projectVersionId))
          .where(and(eq(VA.id, va.parentVariantId), porteeSql(VA, ctx))).limit(1);
        if (pv) {
          const [pl] = await tx.select({ adId: AD.id, variantCode: AD.variantCode, conceptId: AD.conceptId, validated: schema.verdicts.validated, comparable: schema.verdicts.comparable })
            .from(TL).innerJoin(AD, and(eq(AD.id, TL.adsmapAdId), eq(AD.workspaceId, ctx.workspaceId)))
            .leftJoin(schema.verdicts, eq(schema.verdicts.adId, AD.id))
            .where(and(eq(TL.variantId, va.parentVariantId), porteeSql(TL, ctx)))
            .orderBy(sql`${TL.createdAt} desc`).limit(1);
          parent = {
            versionId: pv.versionId, content: pv.content, adId: pl?.adId ?? null, variantCode: pl?.variantCode ?? null, conceptId: pl?.conceptId ?? null,
            verdict: (pl?.validated ?? null) as VerdictValue | null, comparable: pl?.comparable ?? false,
          };
        }
      }
      const isolation = isolationVariable(parent ? parent.content : null, verEnfant?.content ?? null, saisie.variable);

      const d = decisionRattachement({ variantId: va.id, adsmapAdId: saisie.adsmapAdId }, liens, lienCible);
      if (d.action === 'refus') throw new Refus(erreurStudio(d.code, { traceId: ctx.traceId, targetIds: [va.id], message: d.message }));
      if (d.action === 'existant') {
        return {
          ok: true as const, deja: true,
          lien: { linkId: d.lien.linkId, variantId: va.id, adsmapAdId: d.lien.adsmapAdId, adsmapHref: `/adsmap?ad=${encodeURIComponent(d.lien.adsmapAdId)}&depuis=studio`, creee: false, isolation, areteIteration: false },
        };
      }

      // Offre et page · de la marque du projet, sinon introuvables.
      if (saisie.offreId) {
        const [o] = await tx.select({ id: schema.offers.id }).from(schema.offers).where(and(eq(schema.offers.id, saisie.offreId), eq(schema.offers.brandId, va.brandId), eq(schema.offers.workspaceId, ctx.workspaceId))).limit(1);
        if (!o) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'offreId', raison: 'Offre inconnue pour cette marque.' }] }));
      }
      if (saisie.pageId) {
        const [o] = await tx.select({ id: schema.landingPages.id }).from(schema.landingPages).where(and(eq(schema.landingPages.id, saisie.pageId), eq(schema.landingPages.brandId, va.brandId), eq(schema.landingPages.workspaceId, ctx.workspaceId))).limit(1);
        if (!o) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'pageId', raison: 'Page inconnue pour cette marque.' }] }));
      }

      // Identité exacte du média · reprise de la création de la variante (audit, ajout seul).
      const [creation] = await tx.select({ details: schema.studioAuditEvents.details }).from(schema.studioAuditEvents)
        .where(and(eq(schema.studioAuditEvents.action, 'variant.create'), eq(schema.studioAuditEvents.targetType, 'studio_variant'), eq(schema.studioAuditEvents.targetId, va.id), eq(schema.studioAuditEvents.workspaceId, ctx.workspaceId)))
        .limit(1);
      const det = (creation?.details ?? {}) as { jobId?: string; operation?: string; position?: number; lot?: number };
      const [asset] = await tx.select({ mime: schema.studioAssets.mime, sha256: schema.studioAssets.sha256 }).from(schema.studioAssets)
        .where(and(eq(schema.studioAssets.id, va.mediaAssetId), porteeSql(schema.studioAssets, ctx))).limit(1);
      const [job] = det.jobId ? await tx.select({ promptReleaseId: schema.studioJobs.promptReleaseId }).from(schema.studioJobs)
        .where(and(eq(schema.studioJobs.id, det.jobId), porteeSql(schema.studioJobs, ctx))).limit(1) : [];
      const sourceRef = {
        studioVariantId: va.id, studioProjectId: va.projectId, projectVersionId: va.projectVersionId, mediaAssetId: va.mediaAssetId,
        sha256: asset?.sha256 ?? null, jobId: det.jobId ?? null, operation: det.operation ?? null, position: det.position ?? null, lot: det.lot ?? null,
        libelle: va.label, parentVariantId: va.parentVariantId, promptReleaseId: job?.promptReleaseId ?? null,
      };

      let adId: string;
      let creee = false;
      let arete = false;
      if (cible) {
        // Fiche existante · on complète les champs vides, on ne contredit rien.
        const conflits: Array<{ chemin: string; raison: string }> = [];
        if (cible.hypothesis && cible.hypothesis.trim() !== saisie.hypothese) conflits.push({ chemin: 'hypothese', raison: 'La fiche Adsmap porte déjà une autre hypothèse · reprends-la ou choisis une autre fiche.' });
        if (cible.testedVariable && cible.testedVariable !== saisie.variable) conflits.push({ chemin: 'variable', raison: 'La fiche Adsmap teste déjà une autre variable.' });
        if (conflits.length) throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: conflits }));
        await tx.update(AD).set({
          hypothesis: cible.hypothesis ?? saisie.hypothese,
          testedVariable: cible.testedVariable ?? saisie.variable,
          variableValue: cible.variableValue ?? saisie.valeurVariable,
          offerId: cible.offerId ?? saisie.offreId,
          landingPageId: cible.landingPageId ?? saisie.pageId,
          sourceRef: cible.sourceRef ?? sourceRef,
          updatedAt: new Date(),
        }).where(and(eq(AD.id, cible.id), eq(AD.workspaceId, ctx.workspaceId)));
        adId = cible.id;
      } else {
        const format = formatAdPourGeneration(natureDuMime(asset?.mime) === 'video' ? 'video' : 'image');
        let conceptId = parent?.conceptId ?? null;
        if (!conceptId) {
          const [c] = await tx.select({ id: schema.concepts.id }).from(schema.concepts)
            .where(and(eq(schema.concepts.workspaceId, ctx.workspaceId), sql`${schema.concepts.sourceRef}->>'studioProjectId' = ${va.projectId}`)).limit(1);
          conceptId = c?.id ?? null;
        }
        if (!conceptId) {
          const titre = projet!.title.slice(0, 160);
          const angleId = await cheminAQualifier(tx, ctx.workspaceId, va.brandId, titre);
          conceptId = (await tx.insert(schema.concepts).values({
            workspaceId: ctx.workspaceId, angleId, title: titre, adType: 'ideation', status: 'proposed', sourceRef: { studioProjectId: va.projectId },
          }).returning({ id: schema.concepts.id }))[0]!.id;
        }
        const enIteration = parent?.adId ? checkIteration({
          childAdType: 'iteration', parentVerdict: parent.verdict, parentComparable: parent.comparable,
          changedVariable: saisie.variable, childAdId: 'nouvelle', parentAdId: parent.adId,
        }).length === 0 : false;
        const code = await codeLibre(tx, conceptId, parent?.adId ? parent.variantCode : null);
        const [ad] = await tx.insert(AD).values({
          workspaceId: ctx.workspaceId, conceptId, variantCode: code, format: format ?? 'static',
          adType: parent?.adId ? (enIteration ? 'iteration' : 'new') : 'ideation',
          hypothesis: saisie.hypothese, testedVariable: saisie.variable, variableValue: saisie.valeurVariable,
          offerId: saisie.offreId, landingPageId: saisie.pageId, status: 'draft', sourceRef,
        }).returning({ id: AD.id });
        adId = ad!.id;
        creee = true;
        if (enIteration && parent?.adId) {
          const arcs = await tx.select({ child: schema.iterationEdges.childAdId, parent: schema.iterationEdges.parentAdId }).from(schema.iterationEdges).where(eq(schema.iterationEdges.workspaceId, ctx.workspaceId));
          if (!wouldCreateCycle(arcs, { child: adId, parent: parent.adId })) {
            await tx.insert(schema.iterationEdges).values({
              workspaceId: ctx.workspaceId, childAdId: adId, parentAdId: parent.adId, mode: 'better', changedVariable: saisie.variable,
              rationale: `Studio · ${va.label} itère ${isolation.pretendIsoler ? 'en isolant' : 'sans isoler'} la variable.`,
            });
            arete = true;
          }
        }
      }

      const [lien] = await tx.insert(TL).values({ workspaceId: ctx.workspaceId, brandId: va.brandId, variantId: va.id, adsmapAdId: adId, createdBy: ctx.userId }).returning({ id: TL.id });
      const entree: EntreeRegistreTest = {
        type: 'test', linkId: lien!.id, variantId: va.id, adsmapAdId: adId,
        hypothese: saisie.hypothese, variable: saisie.variable, valeurVariable: saisie.valeurVariable, objectif: saisie.objectif,
        protocole: saisie.protocole, periode: saisie.periode, metrique: saisie.metrique,
        isolation: { statut: isolation.statut, champs: isolation.champs }, creeLe: new Date().toISOString(), creePar: ctx.userId,
      };
      await tx.update(P).set({ testRefs: ajouterAuRegistre(projet!.testRefs, entree), updatedAt: new Date() })
        .where(and(eq(P.id, projet!.id), porteeSql(P, ctx)));
      await ajouterAudit(tx, ctx, {
        action: 'variant.test.link', brandId: va.brandId, targetType: 'studio_variant', targetId: va.id,
        versionAfter: va.projectVersionId, reason: va.label,
        details: { linkId: lien!.id, adsmapAdId: adId, creee, isolation: isolation.statut, champs: isolation.champs, areteIteration: arete, variable: saisie.variable },
      });
      return {
        ok: true as const, deja: false,
        lien: { linkId: lien!.id, variantId: va.id, adsmapAdId: adId, adsmapHref: `/adsmap?ad=${encodeURIComponent(adId)}&depuis=studio`, creee, isolation, areteIteration: arete },
      };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    if (violationUnicite(err)?.includes('studio_test_links_ad')) {
      return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, message: 'Cette fiche Adsmap vient d’être rattachée à une autre variante · une fiche ne mesure qu’une seule variante.' });
    }
    return echecPersistance(ctx, err);
  }
}
