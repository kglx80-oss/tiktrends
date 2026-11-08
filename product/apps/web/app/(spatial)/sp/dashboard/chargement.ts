import 'server-only';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CHEMIN_BOUCLE_ACCUEIL, PASTILLES_JARVIS_ACCUEIL,
  aFaireMaintenant, carteConfiguration, cartesQuoiIterer, cheminOuvert, choixRapidesPeriode, completudeFicheMarque,
  etapesBoucleAccueil, manqueMeta, fileQuoiDeNeuf, jourParis, ligneAttente, lignesReprendre, lotsAConclure,
  periodeReporting, raccourcisAccueil, salutationAccueil, sourcesJarvisAccueil, sousTitreReporting,
  surtitreSpatialAccueil, syntheseReporting, titreJarvisAccueil,
  SUGGESTIONS_ASSISTANT_ACCUEIL, costFor, noteAccesAccueil, prixQuestionAssistant, refusAssistant, resoudreAccueil,
  DEFAULT_VERDICT_CONFIG, ecartAuLot, importeesDans, journeesReporting, mentionImportees,
  type JourneeMesuree, type LotAccueil, type SignalIteration, type VerdictConfig,
} from '@tiktrends/core';
import type { Session } from '../../../../lib/auth';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { lireChiffresClesMeta } from '../../../../lib/chiffres-cles-meta';
import { lireJourneesRetenues } from '../../../../lib/adsmap-mesures';
import { FEATURES, canAccess, denyReason, ouverturesParRole, roleAtLeast, sectionsCompteOuvertes } from '../../../../lib/rbac';
import { refusJarvis } from '../../../../lib/jarvis-acces';
import { onboardingState } from '../../../../lib/onboarding-state';
import { chargerTeteAccueilProjets } from '../../../../lib/accueil-projets';
import { chargerAccueilV5 } from '../../../../lib/accueil-v5';
import { adsVignettesDuLot, jointureCreaDeLaMarque, vignetteDuLot, vignettesDesAds } from '../../../../lib/adsmap-medias';
import { compterBoucle } from '../../../../lib/boucle-resultats';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { unlimitedCredits } from '../../../../lib/credits';
import type { EtatQuoiIterer, EtatReporting, PropsAccueil } from '../../../../spatial/vues/accueil/Accueil';

/**
 * L'Accueil Spatial · LECTURE SEULE des sources réelles, chacune sous son droit
 * (rôle ET offre, comme la page qui la montre) et dans sa portée (espace,
 * marque active, personne). Rien n'est écrit, rien n'est généré, rien n'est
 * débité · 0 appel IA.
 *
 * Les lectures de l'Accueil V5 sont RÉUTILISÉES telles quelles · projets
 * (`chargerTeteAccueilProjets`), gagnantes prouvées et « ce qui t'attend »
 * (`chargerAccueilV5`), parcours de configuration (`onboardingState`), comptes
 * de la boucle (`compterBoucle`). Les lectures propres à Spatial (lots datés,
 * journées Meta, dernières notifications, fiche marque) sont bornées et
 * scopées comme leurs voisines. Une lecture en panne fait taire SON bloc.
 */

const F = (cle: string) => FEATURES.find((f) => f.key === cle)!;

async function lire<T>(etiquette: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.warn(`[accueil spatial] ${etiquette} illisible`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function chargerAccueilSpatial(s: Session, params: Record<string, string | string[] | undefined>): Promise<PropsAccueil> {
  const maintenant = new Date();
  const acces = effectiveAccess(s);
  const regles = ouverturesParRole(acces);
  const ouvert = (href: string) => cheminOuvert(href, regles);
  const pagesCompte = new Set(sectionsCompteOuvertes(acces).flatMap((g) => g.items.map((i) => i.href)));
  const admin = roleAtLeast(s.role, 'admin');

  const ab = await getActiveBrand(s.workspaceId);
  const marque = ab ? { id: ab.id, nom: ab.name } : null;

  const tete = await chargerTeteAccueilProjets(s, ouvert);
  const nouveauProjet = tete.etat.etat === 'liste' || tete.etat.etat === 'premier-usage' ? tete.etat.nouveau?.href ?? null : null;

  const adsmapOuvert = denyReason(acces, F('adsmap')) === null && !!marque && !!db;
  const lotsOuverts = adsmapOuvert && canAccess(acces, F('lots'));
  const analyticsOuvert = canAccess(acces, F('analytics')) && !!marque && !!db;

  const [v5, parcours, fiche, lots, notifs, metaBrand] = await Promise.all([
    chargerAccueilV5(s, { marque, nouveauProjet, nbProjets: tete.nbProjets }),
    roleAtLeast(s.role, 'member') ? lire('parcours', () => onboardingState(s.workspaceId, admin)) : Promise.resolve(null),
    // La fiche s'ouvre aux admins (`/brands/[id]`) · même lecture et même règle de complétude que l'Accueil V5.
    marque && admin && db ? lire('fiche marque', async () => {
      const [b] = await db!.select({
        description: schema.brands.description, usp: schema.brands.usp, audience: schema.brands.audience,
        category: schema.brands.category, categoryNeeds: schema.brands.categoryNeeds, tone: schema.brands.tone,
        industryTags: sql<number>`coalesce(cardinality(${schema.brands.industryTags}), 0)`,
        colors: sql<number>`coalesce(cardinality(${schema.brands.colors}), 0)`,
        concurrents: sql<number>`coalesce(cardinality(${schema.brands.competitors}), 0)`,
      }).from(schema.brands).where(and(eq(schema.brands.id, marque.id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
      if (!b) return null;
      const n = async (t: typeof schema.personas | typeof schema.scenarios | typeof schema.products) =>
        Number((await db!.select({ n: count() }).from(t).where(eq(t.brandId, marque.id)))[0]?.n ?? 0);
      const [personas, scenarios, produits] = await Promise.all([n(schema.personas), n(schema.scenarios), n(schema.products)]);
      const c = completudeFicheMarque({ ...b, industryTags: Number(b.industryTags), colors: Number(b.colors), concurrents: Number(b.concurrents), personas, scenarios, produits });
      return { href: `/brands/${marque.id}?tab=overview#profil`, manques: c.manques };
    }) : Promise.resolve(null),
    // Les lots de la marque active, datés · même portée que `listBatchesAction` (marque ET espace).
    adsmapOuvert ? lire('lots', async () => {
      const B = schema.batches;
      const rows = await db!.select({
        id: B.id, numero: B.number, statut: B.status, but: B.goal, lanceLe: B.launchedAt, finPrevue: B.plannedEndAt,
        variantes: sql<number>`count(${schema.ads.id})`,
        // Les variantes du lot qui portent un média (créa de la marque) · la vignette, celle de la première qui en a une selon le noyau, passe par la route gardée de l'ad.
        candidates: adsVignettesDuLot,
      }).from(B)
        .leftJoin(schema.ads, eq(schema.ads.batchId, B.id))
        .leftJoin(schema.creatives, jointureCreaDeLaMarque(marque!.id))
        .where(and(eq(B.brandId, marque!.id), eq(B.workspaceId, s.workspaceId)))
        .groupBy(B.id).orderBy(desc(B.number)).limit(200);
      const vignettes = await vignettesDesAds(s.workspaceId, marque!.id, rows.flatMap((r) => r.candidates ?? []));
      return rows.map((r): LotAccueil => ({
        id: r.id, numero: r.numero, statut: r.statut, but: r.but, variantes: Number(r.variantes),
        lanceLe: r.lanceLe ? (r.lanceLe as Date).toISOString() : null, finPrevue: r.finPrevue ? (r.finPrevue as Date).toISOString() : null,
        vignette: vignetteDuLot(r.candidates, vignettes),
      }));
    }) : Promise.resolve(null),
    // Les dernières notifications de la personne, dans cet espace (même portée que la cloche de l'Accueil V5).
    db ? lire('notifications', () => db!.select({
      id: schema.notifications.id, type: schema.notifications.type, titre: schema.notifications.title,
      corps: schema.notifications.body, href: schema.notifications.href, creeLe: schema.notifications.createdAt,
    }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, s.user.id), eq(schema.notifications.workspaceId, s.workspaceId)))
      .orderBy(desc(schema.notifications.createdAt)).limit(4)) : Promise.resolve(null),
    // LA lecture de la connexion ET des chiffres clés Meta · la même que la vue Analytics, Jarvis et le Radar (D2).
    analyticsOuvert ? lire('chiffres clés Meta', () => lireChiffresClesMeta(marque!.id, s.workspaceId, maintenant)) : Promise.resolve(null),
  ]);

  /* ── Reporting Meta ─────────────────────────────────────────────────── */
  let reporting: EtatReporting | null = null;
  if (analyticsOuvert && metaBrand && marque) {
    // L'état et son libellé viennent de LA règle partagée (`etatConnexionMeta`) · l'Accueil
    // ne dit plus « synchronisé hier » pendant qu'Analytics dit « en attente » (planche v4).
    const { connexion, chiffres } = metaBrand;
    if (connexion.phase === 'a_brancher' || connexion.phase === 'compte_a_choisir') {
      const lienConnexions = ouvert('/connections') && connexion.action ? { libelle: connexion.action, href: '/connections' } : null;
      reporting = {
        etat: 'connecter', sous: `${marque.nom} · ${connexion.libelle}`, chiffres,
        message: lienConnexions
          ? manqueMeta(connexion, { quoi: 'ta dépense, ton ROAS et tes achats, comparés à la période précédente', absent: '' })
          : `${connexion.libelle} pour cette marque · un administrateur de l’espace s’en occupe dans Connexions.`,
        lien: lienConnexions,
      };
    } else {
      const periode = periodeReporting({ periode: params.periode, du: params.du, au: params.au, aujourdhui: jourParis(maintenant) });
      // LA lecture des journées RETENUES (connexion Meta d'abord, export ensuite) · la même que les verdicts et Résultats.
      const lu = await lire('journées mesurées', () => lireJourneesRetenues(marque.id, { du: periode.precDebut, au: periode.fin }));
      const lignes: JourneeMesuree[] | null = lu ? journeesReporting(lu.entrees, periode.precDebut, periode.fin) : null;
      const importees = lu ? importeesDans(lu.entrees, periode.debut, periode.fin) : 0;
      const sous = sousTitreReporting({ marque: marque.nom, connexion: connexion.libelle });
      const rapides = choixRapidesPeriode(jourParis(maintenant));
      const synthese = lignes ? syntheseReporting(lignes, periode) : null;
      const jamais = connexion.phase === 'jamais_synchronise';
      reporting = synthese
        ? { etat: 'mesures', sous, chiffres, periode, rapides, synthese, importees: mentionImportees(importees) }
        : jamais && lignes
          // Jamais synchronisé · le geste est la première synchro (dans Connexions), pas Résultats.
          ? { etat: 'vide', sous, chiffres, periode, rapides,
            message: manqueMeta(connexion, { quoi: 'ta dépense, ton ROAS et tes achats, comparés à la période précédente', absent: '' }),
            lien: ouvert('/connections') && connexion.action ? { libelle: connexion.action, href: '/connections' } : null }
          : {
          etat: 'vide', sous, chiffres, periode, rapides,
          message: lignes
            ? 'Aucune journée mesurée sur cette période · les chiffres remontent quand une annonce en test de Résultats est rattachée au compte et synchronisée.'
            : 'Les mesures n’ont pas pu être lues · recharge la page pour réessayer.',
          lien: ouvert(CHEMIN_BOUCLE_ACCUEIL) ? { libelle: 'Ouvrir Résultats', href: CHEMIN_BOUCLE_ACCUEIL } : null,
        };
    }
  }

  /* ── Quoi itérer · gagnantes prouvées ───────────────────────────────── */
  const it = v5.iterations;
  let iterer: EtatQuoiIterer | null = null;
  if (it.etat === 'liste') {
    const ids = it.cartes.map((c) => c.adId);
    const agregats = ids.length && db ? await lire('agrégats des gagnantes', () => db!.select({ adId: schema.verdicts.adId, agg: schema.verdicts.metricsAgg })
      .from(schema.verdicts).where(and(eq(schema.verdicts.workspaceId, s.workspaceId), inArray(schema.verdicts.adId, ids)))) : null;
    const parAd = new Map((agregats ?? []).map((a) => [a.adId, a.agg]));
    // G09 · l'écart de chaque gagnante au RESTE de son lot (même protocole, même fenêtre) · même
    // volume minimum que le moteur de la marque · la règle (`ecartAuLot`) se tait sous ce volume.
    const ecarts = new Map<string, SignalIteration | null>();
    if (ids.length && db && marque) {
      const lus = await lire('écart au reste du lot', async () => {
        const [cfg] = await db!.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, marque.id)).limit(1);
        const config: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((cfg?.config as Partial<VerdictConfig>) ?? {}) };
        const gagnantes = await db!.select({ id: schema.ads.id, lot: schema.ads.batchId, numero: schema.batches.number }).from(schema.ads)
          .innerJoin(schema.batches, and(eq(schema.batches.id, schema.ads.batchId), eq(schema.batches.brandId, marque.id)))
          .where(and(eq(schema.ads.workspaceId, s.workspaceId), inArray(schema.ads.id, ids)));
        const lots = [...new Set(gagnantes.map((x) => x.lot).filter((x): x is string => !!x))];
        const voisins = lots.length ? await db!.select({ id: schema.ads.id, lot: schema.ads.batchId, agg: schema.verdicts.metricsAgg }).from(schema.ads)
          .innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
          .where(and(eq(schema.ads.workspaceId, s.workspaceId), inArray(schema.ads.batchId, lots))) : [];
        return { config, gagnantes, voisins };
      });
      for (const x of lus?.gagnantes ?? []) {
        const autres = (lus?.voisins ?? []).filter((v) => v.lot === x.lot && v.id !== x.id).map((v) => v.agg);
        ecarts.set(x.id, ecartAuLot(parAd.get(x.id), autres, { numeroLot: x.numero, minImpressions: lus!.config.minImpressions }));
      }
    }
    const reste = it.total - it.cartes.length;
    iterer = {
      etat: 'liste', cartes: cartesQuoiIterer(it.cartes, (id) => parAd.get(id), (id) => ecarts.get(id) ?? null),
      suite: reste > 0 ? { texte: `${reste} autre${reste > 1 ? 's' : ''} gagnante${reste > 1 ? 's' : ''} à itérer`, detail: 'la liste complète vit dans Résultats, onglet Suites' } : null,
    };
  } else if (it.etat === 'vide') {
    iterer = { etat: 'message', message: it.message, lien: ouvert(it.resultats) ? { libelle: 'Ouvrir Résultats', href: it.resultats } : null };
  } else if (it.etat === 'offre' || it.etat === 'erreur' || it.etat === 'sans-marque') {
    iterer = { etat: 'message', message: it.message, lien: it.etat === 'sans-marque' && ouvert('/brands') ? { libelle: 'Choisir une marque', href: '/brands' } : null };
  }

  /* ── La boucle ──────────────────────────────────────────────────────── */
  let boucle: PropsAccueil['boucle'] = null;
  const aArbitrer = { n: null as number | null };
  if (adsmapOuvert && lots) {
    const comptes = await lire('comptes de la boucle', () => compterBoucle({
      workspaceId: s.workspaceId, brandId: marque!.id,
      lots: lots.map((l) => ({ status: l.statut, launchedAt: l.lanceLe })), derniereMesure: null,
    }));
    if (comptes) {
      aArbitrer.n = comptes.aArbitrer;
      boucle = { etapes: etapesBoucleAccueil({ comptes, lots, maintenant, lotsOuverts }), href: CHEMIN_BOUCLE_ACCUEIL };
    }
  }

  /* ── À faire maintenant · configuration ─────────────────────────────── */
  const premiere = it.etat === 'liste' ? it.cartes.find((c) => c.iterer) : undefined;
  const suivante = parcours?.journey.next ?? null;
  const etapeOuverte = suivante && ouvert(suivante.href.split(/[?#]/)[0]!) ? suivante : null;
  const maintenantBloc = aFaireMaintenant({
    lotsAConclure: lots && lotsOuverts ? lotsAConclure(lots, maintenant) : [],
    aArbitrer: aArbitrer.n,
    iteration: premiere?.iterer ? { titre: premiere.titre, href: premiere.iterer } : null,
    etape: etapeOuverte ? { libelle: etapeOuverte.label, pourquoi: etapeOuverte.why, href: etapeOuverte.key === 'identity' && fiche ? fiche.href : etapeOuverte.href } : null,
    maintenant, lotsOuverts,
  });
  const carte = parcours ? carteConfiguration(parcours.journey, { marque: marque?.nom ?? null, ouvert, ficheHref: fiche?.href ?? null }) : null;

  /* ── Projets à reprendre ────────────────────────────────────────────── */
  let reprendre: PropsAccueil['reprendre'] = null;
  if (tete.etat.etat === 'liste') {
    const projets = [tete.etat.reprendre, ...tete.etat.autres].map((p, i) => ({
      id: p.id, titre: p.title, libelleEtape: p.libelleEtape, libelleType: p.libelleType, majLe: p.updatedAt,
      // L'aperçu du projet repris est une sortie livrée relue sous garde · les autres gardent leur photo produit réelle.
      apercu: (i === 0 ? tete.apercu : null) ?? p.apercu ?? null,
    }));
    reprendre = { lignes: lignesReprendre(projets, maintenant), tous: tete.etat.tous.href, vide: null };
  } else if (tete.etat.etat === 'premier-usage') {
    reprendre = {
      lignes: [], tous: '/studio/projets',
      vide: { message: 'Aucun projet pour l’instant · un projet part d’un brief et mène à la création, étape par étape.', lien: tete.etat.nouveau ? { libelle: tete.etat.nouveau.libelle, href: tete.etat.nouveau.href } : null },
    };
  } else if (tete.etat.etat === 'coupee') {
    // Capacité Studios coupée pour l'espace · la note, aucun geste (la liste mènerait à « non activé »).
    reprendre = { lignes: [], tous: null, vide: { message: tete.etat.message, lien: null, etat: 'coupee' } };
  } else if (tete.etat.etat === 'erreur') {
    // Lecture en panne · dit, discret · le reste de l'Accueil s'affiche (ancien Accueil, état « erreur »).
    reprendre = {
      lignes: [], tous: tete.etat.tous.href,
      vide: { message: `Tes projets n’ont pas pu être lus pour l’instant · le reste de l’accueil reste disponible, recharge la page pour réessayer.${tete.etat.traceId ? ` Identifiant support : ${tete.etat.traceId}.` : ''}`, lien: null, etat: 'erreur' },
    };
  }

  const jarvisOuvert = refusJarvis(s) === null;
  // Gestes de l'ancien Accueil (vague 2 Spatial v4) · mêmes règles du noyau, mêmes droits.
  const { onglets } = resoudreAccueil({ params, ouvert });
  // L'assistant · SEC-03, la règle de l'action serveur (`askAssistant`). Quand Jarvis est ouvert, sa barre en tient lieu.
  const assistant = !jarvisOuvert && refusAssistant({ roleEspace: s.role }) === null
    ? { pret: anthropicConfigured(), prix: prixQuestionAssistant({ cout: costFor('chat'), illimite: unlimitedCredits(s.user.email) }), suggestions: SUGGESTIONS_ASSISTANT_ACCUEIL }
    : null;
  return {
    onglets: onglets.map((o) => ({ href: o.href, libelle: o.libelle, actif: o.actif })),
    note: noteAccesAccueil(ouvert),
    kpi: v5.kpi,
    assistant,
    surtitre: surtitreSpatialAccueil({ maintenant, marque: marque?.nom ?? null }),
    salutation: salutationAccueil(s.user.name || s.user.email.split('@')[0]),
    jarvis: jarvisOuvert ? { titre: titreJarvisAccueil(marque?.nom ?? null), sources: sourcesJarvisAccueil({ marqueActive: !!marque }), pastilles: PASTILLES_JARVIS_ACCUEIL } : null,
    raccourcis: raccourcisAccueil({
      nouveauProjet,
      formats: canAccess(acces, F('formats')),
      forfaits: pagesCompte.has('/billing'),
      importer: canAccess(acces, F('import')),
      fiche,
    }),
    attente: ligneAttente(v5.attente),
    maintenant: maintenantBloc,
    configuration: carte ? { carte, questionnaire: '/onboarding?redo=1', fiche: fiche?.href ?? null } : null,
    reporting,
    iterer,
    boucle,
    nouveautes: notifs ? fileQuoiDeNeuf(notifs, maintenant) : null,
    reprendre,
  };
}
