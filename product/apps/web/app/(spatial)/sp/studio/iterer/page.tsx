import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, apercuImage, capacitesDuRefus, choixInitialIteration, choixIterationSpatial, lireInspirationDemandee, lireIterationDemandee, lireVariableDemandee,
  refusStudiosSpatial, variablesDuPlan, variablesInspiration, videIterationSpatial, MAX_CHOIX_ITERATION, CHEMIN_PROJETS, RAISON_VEILLE_AUTRE_MARQUE, RAISON_VEILLE_NON_GARDEE,
  iterationDepuisReponse, lireGesteIteration, preparationAutreVariable, OPTIONS_PUB_PROJET, REFUS_GESTE_JARVIS,
  type ChoixVariablesIteration, type ContexteAdSpatial, type PreparationIterationJarvis,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { getActiveBrand } from '../../../../../lib/brands';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { gardeSources } from '../../../../../lib/studios/sources/acces';
import { jointureCreaDeLaMarque, vignetteAd } from '../../../../../lib/adsmap-medias';
import { refusCapacite } from '../../../../../lib/studios/interrupteurs';
import { candidatsDuPlan, exclusDuContexte, lireCandidatsProjet, lireContexteGestes, lireReponseJarvis, planDepuisLignes } from '../../../../../lib/jarvis-gestes';
import { iterationPlanAction, type IterationRow } from '../../../../actions/adsmap-iterate';
import { Iterer, type InspirationIterer } from '../../../../../spatial/vues/studios/Iterer';
import { RefusStudios } from '../../../../../spatial/vues/studios/Refus';

export const dynamic = 'force-dynamic';

const FEATURE_ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * « Nouvelle itération » (Spatial, nouvelle adresse) · part d'une pub mesurée.
 *
 * Gardes · celles des Studios (`studio.read`, capacité `projets`) pour ouvrir
 * l'écran, celle d'Adsmap (`iterationPlanAction` · rôle, offre, marque active,
 * verdicts ARBITRÉS seulement) pour la liste. Le contexte d'une pub (ROAS
 * mesuré, vignette réelle) est relu dans l'espace, colonnes existantes.
 * `?iter=<adId>` présélectionne la pub (même paramètre que la reprise
 * d'itération Adsmap), `?variable=<variable>` la variable (prompt conseillé).
 * L'étape « Ce qu'on change » lit les variables admises de chaque gagnante
 * (`variablesDuPlan`, noyau) · créer l'itération passe par
 * `creerIterationChoisieAction` (gardes rejouées, gratuit). Le geste suivant
 * mène à la reprise réelle du brief (`lienIterationStudio`) · rien n'est
 * généré ni débité ici, le devis vient du serveur dans le projet.
 *
 * `?veille=<plateforme>&pub=<id>` (VB F26) · une pub de la Veille en SOURCE
 * d'inspiration · lue dans les sauvegardes de l'espace (marque active ou sans
 * marque, comme le pont Adsmap), jamais écrite. Les variables admises sont la
 * même règle, adaptée à une source sans verdict (`variablesInspiration`).
 *
 * `?reponse=<uuid>&contexte=lot|hypothese&id=<uuid>` (lot 5 bis · « Créer
 * l'itération » sous une réponse de Jarvis) · la réponse est RELUE dans la
 * portée (espace, marque active, personne), le contexte dans la marque · la
 * pub de départ est prise parmi les gagnantes du contexte QUI SONT dans le plan
 * de la marque, la variable parmi SES variables admises (`iterationDepuisReponse`,
 * noyau). Rien de sûr · aucun pré-choix, et l'écran le dit. Rien n'est créé
 * sans le clic « Créer l'itération ».
 *
 * Lot 5 ter · `contexte=projet&id=<projet>` (panneau Jarvis d'un projet, PC E35) ·
 * la réponse est relue dans le fil LIÉ à CE projet, les variantes gagnantes du
 * projet dans la portée studio ET la marque active (`lireCandidatsProjet`) ·
 * `&autre=1` (« Autre variable », RJ G07) · la variable SUIVANTE admise est
 * cochée à la place de celle de la réponse (`preparationAutreVariable`).
 */
export default async function IterationSpatiale({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const sp = await searchParams;
  const demande = lireIterationDemandee(sp);
  const variableDemandee = lireVariableDemandee(sp);
  const geste = lireGesteIteration(sp);

  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <RefusStudios titre="Nouvelle itération" sous="Studios" refus={refusStudiosSpatial({ capacites: capacitesDuRefus(coupe), code: coupe.code, plan: false, message: coupe.message, traceId: coupe.traceId })} />;

  const active = await getActiveBrand(s.workspaceId);
  const refus = denyReason(effectiveAccess(s), FEATURE_ADSMAP);
  // Créer le projet de l'itération · la même permission que `creerProjet`, pour la marque active dans la portée.
  const peutIterer = aPermissionEspace(g.ctx.permissions, 'studio.propose') && !!active && g.ctx.marques.includes(active.id);

  const veille = lireInspirationDemandee(sp);
  if (veille) {
    const sous = active ? `Itération · ${active.name}` : 'Itération';
    const vide = videIterationSpatial({ refus, marque: !!active, erreur: null, lignes: 1, resume: '' });
    if (vide || !active || !db) return <Iterer sous={sous} resume="" choix={[]} initial={null} vide={vide ?? { titre: 'Lecture impossible', texte: 'La base ne répond pas · réessaie.', lien: null }} />;
    const [sauvee] = await db.select({ brandId: schema.savedAds.brandId, snapshot: schema.savedAds.snapshot }).from(schema.savedAds)
      .where(and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.platform, veille.platform), eq(schema.savedAds.externalId, veille.externalId))).limit(1);
    const refusVeille = !sauvee ? RAISON_VEILLE_NON_GARDEE : sauvee.brandId && sauvee.brandId !== active.id ? RAISON_VEILLE_AUTRE_MARQUE : null;
    if (refusVeille || !sauvee) return <Iterer sous={sous} resume="" choix={[]} initial={null} vide={{ titre: 'Pub de la Veille indisponible', texte: refusVeille ?? RAISON_VEILLE_NON_GARDEE, lien: { href: '/veille', libelle: 'Revenir à la Veille' } }} />;
    const snap = (sauvee.snapshot ?? {}) as { advertiserName?: string; body?: string; thumbnailUrl?: string | null; mediaUrl?: string | null; mediaType?: string };
    const inspiration: InspirationIterer = {
      ...veille,
      annonceur: snap.advertiserName?.trim() || 'Annonceur',
      texte: snap.body?.replace(/\s+/g, ' ').trim().slice(0, 240) || null,
      vignette: apercuImage({ isVideo: (snap.mediaType ?? '').toLowerCase().includes('vid'), thumbnailUrl: snap.thumbnailUrl, mediaUrl: snap.mediaUrl }),
      variables: variablesInspiration(`${veille.platform}:${veille.externalId}`),
    };
    return <Iterer sous={sous} resume="" choix={[]} initial={null} vide={null} inspiration={inspiration} variableDemandee={variableDemandee} />;
  }

  let rows: IterationRow[] = [];
  let resume = '';
  let erreur: string | null = null;
  if (refus === null && active && db) {
    const r = await iterationPlanAction();
    if (r.error || !r.view) erreur = r.error ?? 'Le plan d’itération n’a pas pu être lu · recharge la page pour réessayer.';
    else { rows = r.view.rows; resume = r.view.summary; }
  }

  const ids = [...new Set(rows.map((r) => r.adId))].slice(0, MAX_CHOIX_ITERATION);
  const contexte = new Map<string, ContexteAdSpatial>();
  if (ids.length && db && active) {
    try {
      const lignes = await db.select({ adId: schema.ads.id, metricsAgg: schema.verdicts.metricsAgg, lien: schema.ads.assetUrl, miniature: schema.creatives.thumbUrl, fichier: schema.creatives.storageUrl })
        .from(schema.ads)
        .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
        .leftJoin(schema.creatives, jointureCreaDeLaMarque(active.id))
        .where(and(eq(schema.ads.workspaceId, s.workspaceId), inArray(schema.ads.id, ids)));
      for (const l of lignes) {
        const roas = (l.metricsAgg as { roas?: unknown } | null)?.roas;
        // Un objet du stockage privé passe par la route gardée de l'ad · jamais son adresse brute (image cassée, clé nommée).
        contexte.set(l.adId, { roas: typeof roas === 'number' ? roas : null, vignette: vignetteAd(l.adId, l) });
      }
    } catch (e) {
      // Le contexte est un complément · sans lui, la liste reste (ni ROAS ni vignette, jamais un chiffre inventé).
      console.warn('[studios] contexte des pubs à itérer illisible', e instanceof Error ? e.message : e);
    }
  }

  const choix = choixIterationSpatial(rows, (id) => contexte.get(id), { peutIterer });
  // Les variables admises · seulement pour les pubs sélectionnables (une piste fermée garde sa raison, rien à choisir).
  const tous = variablesDuPlan(rows);
  const variables: Record<string, ChoixVariablesIteration> = Object.fromEntries(choix.filter((c) => c.selectionnable && tous[c.adId]).map((c) => [c.adId, tous[c.adId]!]));

  // Depuis une réponse de Jarvis · relue dans la portée, bornée aux gagnantes du contexte présentes dans le plan.
  let jarvis: PreparationIterationJarvis | null = null;
  if (geste.etat === 'refus') jarvis = { adId: null, variable: null, note: REFUS_GESTE_JARVIS };
  else if (geste.etat === 'ok') {
    const projet = geste.contexte.type === 'projet';
    const [texte, ads] = active ? await Promise.all([
      lireReponseJarvis(s, active.id, geste.reponse, projet ? { projectId: geste.contexte.id } : {}),
      projet
        ? lireCandidatsProjet(s, active.id, geste.contexte.id).then((l) => l && { ads: l.candidats.map((c) => ({ id: c.adId, variante: c.libelle, variable: c.variable })), autres: l.autres })
        : lireContexteGestes(s, active.id, geste.contexte).then((c) => c && { ads: c.ads, autres: null }),
    ]) : [null, null];
    const candidats = ads ? candidatsDuPlan(ads.ads, { variables, lignees: planDepuisLignes(rows).lignees }) : [];
    // Les autres variantes du contexte (perdantes, hors plan) · nommée seule, l'une d'elles ne désigne aucune gagnante.
    const exclus = ads ? [...(ads.autres ?? []), ...exclusDuContexte(ads.ads, candidats)] : [];
    const o = projet ? { ...OPTIONS_PUB_PROJET, exclus } : { exclus };
    jarvis = texte && ads
      ? (geste.autre ? preparationAutreVariable(texte, candidats, o) : iterationDepuisReponse(texte, candidats, o))
      : { adId: null, variable: null, note: REFUS_GESTE_JARVIS };
  }
  return (
    <Iterer
      sous={active ? `Itération · ${active.name}` : 'Itération'}
      resume={resume}
      choix={choix}
      initial={jarvis ? jarvis.adId : choixInitialIteration(choix, demande)}
      demande={jarvis ? null : demande}
      variables={variables}
      variableDemandee={jarvis ? jarvis.variable : variableDemandee}
      jarvis={jarvis ? { note: jarvis.note, adId: jarvis.adId, variable: jarvis.variable } : null}
      vide={videIterationSpatial({ refus, marque: !!active, erreur, lignes: choix.length, resume })}
    />
  );
}
