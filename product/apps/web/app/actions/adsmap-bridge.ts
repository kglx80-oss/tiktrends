'use server';

import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { mechanismForTemplate, formatAdPourGeneration, resoudreTypeAd, type OptionTypeAd } from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory, briefConceptBeforeLaunch } from '../../lib/jarvis-memory';
import { ensureGraphPath, nextVariant } from '../../lib/adsmap-path';

/**
 * Passerelles entre le reste du produit et ADSMAP.
 *
 * Sans elles, ADSMAP serait un tableur de plus : on génère dans le Studio, on
 * repère une pub dans la Veille, et il faudrait tout ressaisir pour la suivre.
 * La boucle du cahier des charges (concept → ad → test → verdict → itération) ne
 * se referme que si l'entrée dans la carte coûte un clic.
 *
 * Principe commun : la créa entre en `draft`, pas en `ready`. L'invariant §2.4
 * exige hypothèse, variable, offre et page de destination avant le test · on ne
 * les invente pas ici, on amène la créa jusqu'à la porte.
 */

const guard = adsmapGuard;

export interface BridgeResult {
  ok?: true; adId?: string; conceptId?: string; prelaunch?: string; error?: string;
  /** La génération était déjà suivie · fiche existante renvoyée (lot 17). */ dejaSuivie?: true;
  /**
   * Lot 21 (message 77) · le type d'ad ne s'établit pas sans inventer · rien
   * n'a été écrit · l'utilisateur choisit parmi ces types (aucun présélectionné)
   * puis rappelle l'action avec `formatAd`.
   */
  choixFormat?: { options: OptionTypeAd[]; raison: string };
}

/**
 * Studio → ADSMAP · une créa générée devient une ad suivie.
 *
 * C'est la passerelle qui referme la boucle : sans elle, on génère d'un côté et
 * on mesure de l'autre, sans jamais relier la proposition au résultat.
 */
export async function trackGeneratedAdAction(generationId: string): Promise<BridgeResult> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  try {
    const [gen] = await db!.select({ id: schema.generations.id, input: schema.generations.input, assetUrls: schema.generations.assetUrls, brandId: schema.generations.brandId, kind: schema.generations.kind })
      .from(schema.generations)
      .where(and(eq(schema.generations.id, generationId), eq(schema.generations.brandId, g.brand.id)))
      .limit(1);
    if (!gen) return { error: 'Créa introuvable dans cette marque.' };

    // Le format d'ad se déduit du TYPE de génération (règle du noyau) · pub et
    // image → static, vidéo → video_ugc. Un script ou une copie n'est pas une
    // créative à arbitrer · on refuse plutôt que d'inventer une ad de texte.
    const format = formatAdPourGeneration(gen.kind);
    if (!format) return { error: 'Ce type de créa ne se teste pas dans Adsmap.' };

    const r = (gen.input ?? {}) as {
      template?: string; headline?: string; kicker?: string; subhead?: string; cta?: string;
      personaId?: string; objective?: string; adsmapAdId?: string; prompt?: string;
    };
    // Déjà suivie : on renvoie vers l'existant plutôt que de créer un doublon.
    if (r.adsmapAdId) return { ok: true, adId: r.adsmapAdId, dejaSuivie: true, error: undefined };

    // La vidéo et l'image décrivent leur créa par un `prompt`, pas un `headline` ·
    // on l'utilise comme titre plutôt qu'un « Créa Studio » anonyme.
    const titre = (r.headline || r.prompt || 'Créa Studio').slice(0, 160);
    const angleLabel = (r.kicker || r.objective || titre).slice(0, 160);
    // Le repli est ici, et il est assumé · la table du noyau rend `null` plutôt
    // que d'en cacher un. C'est ce défaut caché qui rangeait « Bénéfices
    // annotés » sous `demo` depuis toujours, sans que rien ne le dise.
    const mechanism = mechanismForTemplate(r.template) ?? 'demo';

    const path = await ensureGraphPath({
      workspaceId: g.s.workspaceId, brandId: g.brand.id, personaId: r.personaId ?? null,
      desireLabel: 'À qualifier (Studio)', angleLabel, mechanism,
    });
    if (!path) return { error: 'Rattachement impossible.' };

    // Un concept par titre+angle · une seconde variante du même concept s'y ajoute.
    const [c0] = await db!.select({ id: schema.concepts.id }).from(schema.concepts)
      .where(and(eq(schema.concepts.angleId, path.angleId), eq(schema.concepts.title, titre))).limit(1);
    const conceptId = c0?.id ?? (await db!.insert(schema.concepts).values({
      workspaceId: g.s.workspaceId, angleId: path.angleId, title: titre,
      callout: r.kicker ?? null, valueBlock: r.subhead ?? null, cta: r.cta ?? null,
      adType: 'ideation', status: 'proposed', sourceRef: { generationId: gen.id },
    }).returning({ id: schema.concepts.id }))[0]!.id;

    // Le lien va sur l'AD, et pas seulement sur le concept.
    //
    // Le concept est réutilisé quand le titre coïncide · son `sourceRef` reste
    // celui de la PREMIÈRE génération, et les variantes suivantes héritaient
    // alors d'une mémoire qui n'était pas la leur. Comme les concepts anciens
    // sont ceux d'avant la mémoire, chaque variante récente tombait dans le
    // groupe témoin de l'attribution · la mesure était biaisée contre la
    // réponse qu'elle cherchait.
    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: g.s.workspaceId, conceptId,
      variantCode: await nextVariant(conceptId),
      format, adType: 'ideation', status: 'draft',
      assetUrl: (gen.assetUrls && gen.assetUrls[0]) || `/api/ad/${gen.id}`,
      sourceRef: { generationId: gen.id },
    }).returning({ id: schema.ads.id });
    if (!ad) return { error: 'Création impossible.' };

    // Trace le lien dans la génération · évite un doublon au second clic.
    await db!.update(schema.generations)
      .set({ input: sql`coalesce(${schema.generations.input}, '{}'::jsonb) || ${JSON.stringify({ adsmapAdId: ad.id })}::jsonb` })
      .where(eq(schema.generations.id, gen.id));

    invalidateJarvisMemory(g.brand.id);
    // L'avis complet plutôt que le seul score : c'est l'accroche qui porte le
    // signal le plus fort, et elle est ici sous la main.
    const avis = await briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, {
      mechanism, format, candidateHook: r.headline ?? null,
    });
    return { ok: true, adId: ad.id, conceptId, prelaunch: avis.summary };
  } catch (e) {
    return { error: logAndTranslate('adsmap:track-generated', e, { subject: 'le rattachement à la carte', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Veille → ADSMAP · une pub concurrente sauvegardée devient un concept `imitation`.
 *
 * Le cahier des charges type ces ads à part (§5) : on ne reprend pas une pub
 * concurrente comme une idée maison, on assume qu'on en reprend la structure, et
 * le verdict dira si elle transpose.
 *
 * Lot 21 (R3) · le pont mène à LA fiche, avec le bon format :
 * - déjà suivie dans la marque active · la MÊME fiche (même ad) est renvoyée,
 *   rien n'est écrit · repérée par la provenance (`savedAdId`) et bornée à la
 *   marque active (persona de la marque) et à l'espace · jamais une ad d'une
 *   autre marque ;
 * - le type d'ad vient de la règle du noyau (`resoudreTypeAd`) · automatique
 *   quand rien n'est inventé, sinon un CHOIX explicite de l'utilisateur
 *   (`formatAd`), VALIDÉ ici contre les types compatibles avec le média lu en
 *   base · sans choix, la liste est renvoyée et rien n'est écrit ; un choix
 *   incompatible est refusé sans écriture · jamais `video_ugc` par défaut ;
 * - chemin, concept et ad s'écrivent dans UNE transaction, sous un verrou par
 *   marque · un échec ne laisse ni concept sans ad ni chemin partiel ; deux
 *   onglets simultanés ne créent qu'une fiche (message 78) ;
 * - un concept ancien resté sans ad (écrit avant cette transaction) reçoit son
 *   ad · aucun second concept n'est créé.
 */
export async function trackSavedAdAction(ref: { platform: string; externalId: string; /** Type d'ad choisi par l'utilisateur, quand la règle le demande. */ formatAd?: string }): Promise<BridgeResult> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  try {
    // Repérée par (plateforme, identifiant externe) : c'est ce que porte l'écran
    // de veille, et c'est la clé unique de la table.
    const [saved] = await db!.select({ id: schema.savedAds.id, snapshot: schema.savedAds.snapshot, platform: schema.savedAds.platform })
      .from(schema.savedAds)
      .where(and(
        eq(schema.savedAds.workspaceId, g.s.workspaceId),
        eq(schema.savedAds.platform, ref.platform),
        eq(schema.savedAds.externalId, ref.externalId),
      ))
      .limit(1);
    if (!saved) return { error: 'Pub sauvegardée introuvable.' };

    // Déjà suivie dans CETTE marque · la même fiche, sans rien écrire (même
    // pour une ancienne ad dont le format ne serait plus accepté aujourd'hui).
    const deja = await suiviSauvegarde(db!, saved.id, g.s.workspaceId, g.brand.id);
    if (deja?.adId) return { ok: true, adId: deja.adId, conceptId: deja.conceptId, dejaSuivie: true, error: undefined };

    // Le type d'ad · décidé AVANT toute écriture · le choix du client n'est
    // jamais cru tel quel · il est validé contre le média lu en base.
    const decision = resoudreTypeAd(saved.snapshot, ref.formatAd);
    if (!decision.ok) return decision.cause === 'choix_requis' ? { choixFormat: { options: decision.options, raison: decision.raison } } : { error: decision.raison };
    const format = decision.format;

    const snap = (saved.snapshot ?? {}) as { advertiserName?: string; body?: string; callToAction?: string; id?: string };
    const annonceur = (snap.advertiserName || 'Concurrent').slice(0, 80);
    const copy = (snap.body || '').replace(/\s+/g, ' ').trim();
    const titre = `Imitation · ${annonceur}${copy ? ` — ${copy.slice(0, 90)}` : ''}`.slice(0, 160);

    const r = await db!.transaction(async (tx) => {
      // Message 78 · un verrou PAR MARQUE, pris avant toute écriture · deux
      // onglets (ou deux sauvegardes suivies en même temps) ne créent qu'un
      // chemin, un concept et une ad. Mesuré avant (deux onglets, Postgres
      // réel) · 1 concept et 1 ad, mais persona, désir et angle « À qualifier »
      // en DOUBLE · le chemin était écrit hors transaction, avant le verrou.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`adsmap-pont-sauvegarde:${g.brand.id}`}))`);
      const encore = await suiviSauvegarde(tx, saved.id, g.s.workspaceId, g.brand.id);
      if (encore?.adId) return { adId: encore.adId, conceptId: encore.conceptId, dejaSuivie: true as const };

      // Chemin persona → désir → angle · trouvé ou créé DANS la transaction
      // (un échec de l'ad n'en laisse aucun morceau) · inutile quand le concept
      // existe déjà.
      const angleId = encore ? null : await cheminVeille(tx, g.s.workspaceId, g.brand.id, `Structure reprise de ${annonceur}`);
      const conceptId = encore?.conceptId ?? (await tx.insert(schema.concepts).values({
        workspaceId: g.s.workspaceId, angleId: angleId!, title: titre,
        valueBlock: copy ? copy.slice(0, 900) : null, cta: snap.callToAction ?? null,
        adType: 'imitation', status: 'proposed',
        // Le format QUALIFIÉ (composition) est gardé à part · `formatAdChoisi`
        // dit si le type d'ad vient d'un choix explicite de l'utilisateur.
        sourceRef: { savedAdId: saved.id, platform: saved.platform, externalId: snap.id ?? null, formatCreatif: decision.formatCreatif, formatAdChoisi: decision.choisi },
      }).returning({ id: schema.concepts.id }))[0]?.id;
      if (!conceptId) throw new Error('concept non créé');

      const [ad] = await tx.insert(schema.ads).values({
        workspaceId: g.s.workspaceId, conceptId, variantCode: 'v1',
        format, adType: 'imitation', status: 'draft',
        platform: saved.platform === 'tiktok' ? 'tiktok' : 'meta',
      }).returning({ id: schema.ads.id });
      // Sans ad, le concept ne s'écrit pas non plus (annulation de la transaction).
      if (!ad) throw new Error('ad non créée');
      return { adId: ad.id, conceptId, dejaSuivie: undefined };
    });
    if (r.dejaSuivie) return { ok: true, adId: r.adId, conceptId: r.conceptId, dejaSuivie: true, error: undefined };

    invalidateJarvisMemory(g.brand.id);
    const avis = await briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, {
      mechanism: 'comparison', format, candidateHook: copy || null,
    });
    return { ok: true, adId: r.adId, conceptId: r.conceptId, prelaunch: avis.summary };
  } catch (e) {
    return { error: logAndTranslate('adsmap:track-saved', e, { subject: 'le rattachement à la carte', workspaceId: g.s.workspaceId }) };
  }
}

type Lecteur = Pick<NonNullable<typeof db>, 'select'>;
type Transaction = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];

/**
 * Le chemin persona « À qualifier » → désir « À qualifier (veille) » → angle,
 * trouvé ou créé avec la transaction du pont · mêmes valeurs que
 * `ensureGraphPath` (lib/adsmap-path.ts, branche sans persona choisi), qui
 * écrit sur sa propre connexion et ne peut donc pas tenir sous le verrou.
 */
async function cheminVeille(tx: Transaction, workspaceId: string, brandId: string, angleLabel: string): Promise<string> {
  const nom = 'À qualifier';
  const [p0] = await tx.select({ id: schema.personas.id }).from(schema.personas)
    .where(and(eq(schema.personas.brandId, brandId), eq(schema.personas.name, nom))).limit(1);
  const personaId = p0?.id ?? (await tx.insert(schema.personas).values({
    brandId, name: nom, status: 'proposed',
    description: 'Persona provisoire · créé automatiquement en rattachant une créa à la carte. À scinder en avatars réels.',
  }).returning({ id: schema.personas.id }))[0]!.id;
  const desireLabel = 'À qualifier (veille)';
  const [d0] = await tx.select({ id: schema.desires.id }).from(schema.desires)
    .where(and(eq(schema.desires.personaId, personaId), eq(schema.desires.label, desireLabel))).limit(1);
  const desireId = d0?.id ?? (await tx.insert(schema.desires).values({
    workspaceId, personaId, label: desireLabel, status: 'proposed',
  }).returning({ id: schema.desires.id }))[0]!.id;
  const [a0] = await tx.select({ id: schema.angles.id }).from(schema.angles)
    .where(and(eq(schema.angles.desireId, desireId), eq(schema.angles.label, angleLabel))).limit(1);
  return a0?.id ?? (await tx.insert(schema.angles).values({
    workspaceId, desireId, label: angleLabel, mechanism: 'comparison', status: 'proposed',
  }).returning({ id: schema.angles.id }))[0]!.id;
}

/**
 * Le suivi existant d'une sauvegarde dans la marque active · le concept
 * `imitation` qui la cite (`source_ref_json.savedAdId`), rattaché à un persona
 * de CETTE marque, dans CET espace, et sa première ad s'il en a une. Un concept
 * avec ad passe avant un concept sans ad.
 */
async function suiviSauvegarde(lecteur: Lecteur, savedAdId: string, workspaceId: string, brandId: string): Promise<{ conceptId: string; adId: string | null } | null> {
  const [row] = await lecteur.select({ conceptId: schema.concepts.id, adId: schema.ads.id })
    .from(schema.concepts)
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.ads, and(eq(schema.ads.conceptId, schema.concepts.id), eq(schema.ads.workspaceId, workspaceId)))
    .where(and(
      eq(schema.concepts.workspaceId, workspaceId),
      eq(schema.personas.brandId, brandId),
      eq(schema.concepts.adType, 'imitation'),
      sql`${schema.concepts.sourceRef}->>'savedAdId' = ${savedAdId}`,
    ))
    .orderBy(sql`${schema.ads.id} is null`, asc(schema.concepts.createdAt), asc(schema.ads.createdAt))
    .limit(1);
  return row ? { conceptId: row.conceptId, adId: row.adId ?? null } : null;
}

/**
 * ADSMAP → Studio · le brief d'un concept, prêt à générer.
 * Renvoie de quoi pré-remplir le Studio plutôt que de forcer une navigation
 * aveugle : l'angle et le call-out sont ce que le générateur attend.
 */
export async function conceptBriefAction(conceptId: string): Promise<{ angle?: string; objective?: string; title?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  try {
    const [c] = await db!.select({
      title: schema.concepts.title, callout: schema.concepts.callout, valueBlock: schema.concepts.valueBlock,
      angleLabel: schema.angles.label, desireLabel: schema.desires.label,
    })
      .from(schema.concepts)
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .where(and(eq(schema.concepts.id, conceptId), eq(schema.concepts.workspaceId, g.s.workspaceId)))
      .limit(1);
    if (!c) return { error: 'Concept introuvable.' };
    return {
      title: c.title,
      angle: [c.angleLabel, c.callout].filter(Boolean).join(' · ') || c.title,
      objective: c.desireLabel ?? undefined,
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:concept-brief', e, { subject: 'la lecture du concept', workspaceId: g.s.workspaceId }) };
  }
}
