import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  apercuImage, capacitesDuRefus, choixInitialIteration, choixIterationSpatial, lireInspirationDemandee, lireIterationDemandee, lireVariableDemandee,
  refusStudiosSpatial, variablesDuPlan, variablesInspiration, videIterationSpatial, MAX_CHOIX_ITERATION, CHEMIN_PROJETS, RAISON_VEILLE_AUTRE_MARQUE, RAISON_VEILLE_NON_GARDEE,
  iterationDepuisReponse, lireGesteIteration, preparationAutreVariable, OPTIONS_PUB_PROJET, REFUS_GESTE_JARVIS,
  departDepuisFil, lireGesteFil, TEXTES_FIL_ITERATION, departDepuisGagnante, lireGagnanteDemandee, REFUS_GAGNANTE,
  departDepuisGagnanteDe, lireDepartGagnante, peutCreerIteration, REFUS_GAGNANTE_DEPUIS, type DemandeProvenanceGagnante,
  type ChoixVariablesIteration, type ContexteAdSpatial, type GagnanteDuFil, type PreparationIterationJarvis, type ProvenanceJarvis, type ProvenanceCommentaire, type ProvenanceNote,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { getActiveBrand } from '../../../../../lib/brands';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { gardeSources } from '../../../../../lib/studios/sources/acces';
import { jointureCreaDeLaMarque, vignetteAd } from '../../../../../lib/adsmap-medias';
import { refusCapacite } from '../../../../../lib/studios/interrupteurs';
import { candidatsDuPlan, exclusDuContexte, lireCandidatsProjet, lireContexteGestes, lireReponseJarvis, planDepuisLignes } from '../../../../../lib/jarvis-gestes';
import { lireCommentairePourIterer, lireGagnantesDuFil, lireNotePourIterer } from '../../../../../lib/studios/commentaire-iterer';
import { lireGagnantesDepuis } from '../../../../../lib/iterer-gagnante';
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
 *
 * Provenance « Jarvis » (bilan par provenance) · seulement quand la réponse ET
 * le contexte ont été relus ici, l'écran transmet leurs identifiants à
 * « Créer l'itération » · l'action les RELIT dans la portée avant de poser la
 * provenance (`provenanceJarvisAdmise`) · l'adresse seule ne pose rien.
 *
 * `?commentaire=<uuid>&projet=<uuid>` (« Itérer depuis ce commentaire », onglet
 * Activité d'un projet) · le commentaire est RELU dans la portée (Résultats
 * ouvert, espace, marque active, projet de l'adresse, création du projet avec
 * une pub testée · `lireCommentairePourIterer`) · la pub de cette création est
 * présélectionnée, son texte proposé comme hypothèse (modifiable), la variable
 * pré-cochée seulement si le texte la désigne SÛREMENT parmi les variables
 * admises de la pub (`departDepuisCommentaire`, règle bornée de Jarvis). Refusé
 * · la même phrase, aucun pré-choix. Rien n'est créé sans le clic · la
 * provenance « Commentaire » est relue encore par l'action avant d'être posée.
 *
 * `?note=<uuid>&projet=<uuid>` (« Itérer depuis cette note », canvas de lignée,
 * lot 11) · la MÊME lecture (`lireGesteFil`) · la note relue dans la portée
 * (`lireNotePourIterer` · nœud création / résultat du projet dont la variante a
 * une pub testée), le même départ (`departDepuisFil`) · provenance « Note de la
 * lignée », relue encore par l'action. Les deux à la fois · refus.
 *
 * `&gagnante=<uuid>` en plus (« Itérer depuis la gagnante », sous un résultat
 * CONFIRMÉ du fil) · le fil relu comme ci-dessus, puis la gagnante relue parmi
 * les itérations CONFIRMÉES nées de CE fil de CE projet (`lireGagnantesDuFil`,
 * la lecture de l'écran sous le fil) · elle est présélectionnée à la place de
 * la pub du fil, la variable du plan cochée, aucun texte repris
 * (`departDepuisGagnante`) · la provenance du fil est transmise, l'action la
 * relit encore (`provenanceFilDepuisGagnanteAdmise`). Mal formée, ou pas une
 * gagnante confirmée de ce fil · refus, aucun pré-choix.
 *
 * `?lot=<uuid>&gagnante=<uuid>` (« Itérer depuis la gagnante » sur la fiche
 * d'un lot conclu) ou `?hypothese=<uuid>&gagnante=<uuid>` (sur la carte d'une
 * hypothèse confirmée) · lus seulement sans geste de Jarvis ni fil · le lot (ou
 * la carte) relu dans la marque active, la gagnante relue par la règle du
 * noyau (`gagnantesDuLot`, `gagnanteDeLHypothese` · `lireGagnantesDepuis`) ·
 * présélectionnée, la variable du plan, aucun texte repris
 * (`departDepuisGagnanteDe`) · la source transmise à « Créer l'itération »,
 * qui la relit encore. Mal formée, ou pas une gagnante admise · refus, aucun
 * pré-choix.
 */
export default async function IterationSpatiale({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const sp = await searchParams;
  const demande = lireIterationDemandee(sp);
  const variableDemandee = lireVariableDemandee(sp);
  const geste = lireGesteIteration(sp);
  // Une seule source de pré-choix · un geste de Jarvis l'emporte, le commentaire (ou la note) n'est alors pas lu.
  const gesteCommentaire = geste.etat === 'absente' ? lireGesteFil(sp) : { etat: 'absente' as const };
  // Puis la gagnante d'un lot conclu ou d'une hypothèse confirmée · lue seulement sans geste ni fil.
  const departGagnante = geste.etat === 'absente' && gesteCommentaire.etat === 'absente' ? lireDepartGagnante(sp) : { etat: 'absente' as const };

  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <RefusStudios titre="Nouvelle itération" sous="Studios" refus={refusStudiosSpatial({ capacites: capacitesDuRefus(coupe), code: coupe.code, plan: false, message: coupe.message, traceId: coupe.traceId })} />;

  const active = await getActiveBrand(s.workspaceId);
  const refus = denyReason(effectiveAccess(s), FEATURE_ADSMAP);
  // Créer le projet de l'itération · la même permission que `creerProjet`, pour la marque active dans la portée.
  const peutIterer = peutCreerIteration(g.ctx, active?.id);

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

  // Depuis un commentaire ou une note · relu dans la portée (sa pub de test, ou sa gagnante CONFIRMÉE relue) · AVANT la liste ·
  // la pub de départ y est gardée même au-delà des plus urgentes (`garder`), sinon elle ne pourrait pas être présélectionnée.
  type FilLu = { etat: 'refus'; note: string } | { etat: 'ok'; fil: 'commentaire' | 'note'; lu: { id: string; projetId: string; texte: string; adsmapAdId: string }; gagnante: GagnanteDuFil | null };
  let filLu: FilLu | null = null;
  if (gesteCommentaire.etat === 'refus') filLu = { etat: 'refus', note: TEXTES_FIL_ITERATION[gesteCommentaire.fil].refus };
  else if (gesteCommentaire.etat === 'ok') {
    const fil = gesteCommentaire.fil;
    const refusFil: FilLu = { etat: 'refus', note: TEXTES_FIL_ITERATION[fil].refus };
    const lu = !active ? null : fil === 'commentaire'
      ? await lireCommentairePourIterer(s, active.id, { commentaireId: gesteCommentaire.id, projetId: gesteCommentaire.projetId })
      : await lireNotePourIterer(s, active.id, { noteId: gesteCommentaire.id, projetId: gesteCommentaire.projetId });
    const demandeGagnante = lireGagnanteDemandee(sp);
    if (!lu || !active || demandeGagnante.etat === 'refus') filLu = refusFil;
    else {
      const base = { id: gesteCommentaire.id, projetId: lu.projetId, texte: lu.texte, adsmapAdId: lu.adsmapAdId };
      if (demandeGagnante.etat === 'absente') filLu = { etat: 'ok', fil, lu: base, gagnante: null };
      else {
        // Depuis la gagnante · relue parmi les itérations CONFIRMÉES de CE fil · jamais crue depuis l'adresse.
        const g = (await lireGagnantesDuFil(s, active.id, { fil, id: gesteCommentaire.id, projetId: lu.projetId })).find((x) => x.adId === demandeGagnante.adId);
        filLu = g ? { etat: 'ok', fil, lu: base, gagnante: g } : { etat: 'refus', note: REFUS_GAGNANTE[fil] };
      }
    }
  }
  // Depuis la gagnante d'un lot (ou de la carte qu'il a confirmée) · relue dans la marque active · jamais crue depuis l'adresse.
  type DepuisLu = { etat: 'refus'; note: string } | { etat: 'ok'; demande: DemandeProvenanceGagnante; lot: { numero: number }; gagnante: GagnanteDuFil };
  let depuisLu: DepuisLu | null = null;
  if (departGagnante.etat === 'refus') depuisLu = { etat: 'refus', note: REFUS_GAGNANTE_DEPUIS[departGagnante.source] };
  else if (departGagnante.etat === 'ok') {
    const demande = { source: departGagnante.source, id: departGagnante.id };
    const lu = active ? await lireGagnantesDepuis(s.workspaceId, active.id, demande) : null;
    const gg = lu?.gagnantes.find((x) => x.adId === departGagnante.gagnante);
    depuisLu = lu && gg ? { etat: 'ok', demande, lot: lu.lot, gagnante: gg } : { etat: 'refus', note: REFUS_GAGNANTE_DEPUIS[departGagnante.source] };
  }
  const garder = filLu?.etat === 'ok' ? (filLu.gagnante?.adId ?? filLu.lu.adsmapAdId) : depuisLu?.etat === 'ok' ? depuisLu.gagnante.adId : null;

  const premieres = [...new Set(rows.map((r) => r.adId))].slice(0, MAX_CHOIX_ITERATION);
  const ids = garder && !premieres.includes(garder) && rows.some((r) => r.adId === garder) ? [...premieres, garder] : premieres;
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

  const choix = choixIterationSpatial(rows, (id) => contexte.get(id), { peutIterer, garder });
  // Les variables admises · seulement pour les pubs sélectionnables (une piste fermée garde sa raison, rien à choisir).
  const tous = variablesDuPlan(rows);
  const variables: Record<string, ChoixVariablesIteration> = Object.fromEntries(choix.filter((c) => c.selectionnable && tous[c.adId]).map((c) => [c.adId, tous[c.adId]!]));

  // Depuis une réponse de Jarvis · relue dans la portée, bornée aux gagnantes du contexte présentes dans le plan.
  let jarvis: PreparationIterationJarvis | null = null;
  let provenance: ProvenanceJarvis | null = null;
  if (geste.etat === 'refus') jarvis = { adId: null, variable: null, note: REFUS_GESTE_JARVIS };
  else if (geste.etat === 'ok') {
    const projet = geste.contexte.type === 'projet';
    const [texte, ads] = active ? await Promise.all([
      lireReponseJarvis(s, active.id, geste.reponse, projet ? { projectId: geste.contexte.id } : {}),
      projet
        ? lireCandidatsProjet(s, active.id, geste.contexte.id).then((l) => l && { ads: l.candidats.map((c) => ({ id: c.adId, variante: c.libelle, variable: c.variable })), autres: l.autres })
        // Un lot lu en partie n'expose aucune pub · aucun candidat ne s'y cherche (le geste « Itérer » de Jarvis y est fermé).
        : lireContexteGestes(s, active.id, geste.contexte).then((c) => (c && !c.variantes.partielle ? { ads: c.variantes.ads, autres: null } : null)),
    ]) : [null, null];
    const candidats = ads ? candidatsDuPlan(ads.ads, { variables, lignees: planDepuisLignes(rows).lignees }) : [];
    // Les autres variantes du contexte (perdantes, hors plan) · nommée seule, l'une d'elles ne désigne aucune gagnante.
    const exclus = ads ? [...(ads.autres ?? []), ...exclusDuContexte(ads.ads, candidats)] : [];
    const o = projet ? { ...OPTIONS_PUB_PROJET, exclus } : { exclus };
    jarvis = texte && ads
      ? (geste.autre ? preparationAutreVariable(texte, candidats, o) : iterationDepuisReponse(texte, candidats, o))
      : { adId: null, variable: null, note: REFUS_GESTE_JARVIS };
    if (texte && ads) provenance = { reponseId: geste.reponse, contexte: { type: geste.contexte.type as ProvenanceJarvis['contexte']['type'], id: geste.contexte.id } };
  }

  // Depuis un commentaire ou une note · le départ (sa pub, ou sa gagnante) · calculé avec les variables admises.
  let commentaire: { note: string; adId: string | null; variable: ReturnType<typeof departDepuisFil>['variable']; hypothese: string | null; provenance: ProvenanceCommentaire | null; provenanceNote?: ProvenanceNote | null; depuis?: DemandeProvenanceGagnante | null } | null = null;
  if (filLu?.etat === 'refus') commentaire = { note: filLu.note, adId: null, variable: null, hypothese: null, provenance: null };
  else if (depuisLu?.etat === 'refus') commentaire = { note: depuisLu.note, adId: null, variable: null, hypothese: null, provenance: null };
  else if (depuisLu?.etat === 'ok') {
    const d = departDepuisGagnanteDe(depuisLu.demande.source, depuisLu.gagnante, depuisLu.lot, variables[depuisLu.gagnante.adId] ?? null);
    commentaire = { note: d.note, adId: d.adId, variable: d.variable, hypothese: null, provenance: null, depuis: depuisLu.demande };
  }
  else if (filLu?.etat === 'ok') {
    const { fil, lu, gagnante } = filLu;
    const provenances = {
      provenance: fil === 'commentaire' ? { commentaireId: lu.id, projetId: lu.projetId } : null,
      provenanceNote: fil === 'note' ? { noteId: lu.id, projetId: lu.projetId } : null,
    };
    const d = gagnante ? departDepuisGagnante(fil, gagnante, variables[gagnante.adId] ?? null) : departDepuisFil(fil, lu.texte, lu.adsmapAdId, variables[lu.adsmapAdId] ?? null);
    commentaire = { note: d.note, adId: d.adId, variable: d.variable, hypothese: d.hypothese, ...provenances };
  }
  const demandee = commentaire?.adId ?? demande;
  return (
    <Iterer
      sous={active ? `Itération · ${active.name}` : 'Itération'}
      resume={resume}
      choix={choix}
      // Depuis Jarvis ou un commentaire · SA pub, ou rien (refus) · jamais la première du plan à la place.
      initial={jarvis ? jarvis.adId : commentaire ? commentaire.adId : choixInitialIteration(choix, demandee)}
      demande={jarvis ? null : demandee}
      variables={variables}
      variableDemandee={jarvis ? jarvis.variable : commentaire ? commentaire.variable : variableDemandee}
      jarvis={jarvis ? { note: jarvis.note, adId: jarvis.adId, variable: jarvis.variable, provenance } : null}
      commentaire={commentaire}
      vide={videIterationSpatial({ refus, marque: !!active, erreur, lignes: choix.length, resume })}
    />
  );
}
