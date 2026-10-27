import 'server-only';
import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CHEMIN_BOUCLE_ACCUEIL, PASTILLES_JARVIS_ACCUEIL,
  aFaireMaintenant, carteConfiguration, cartesQuoiIterer, cheminOuvert, choixRapidesPeriode, completudeFicheMarque,
  depuisRelatif, etapesBoucleAccueil, fileQuoiDeNeuf, jourParis, ligneAttente, lignesReprendre, lotsAConclure,
  periodeReporting, raccourcisAccueil, salutationAccueil, sourcesJarvisAccueil, sousTitreReporting,
  surtitreSpatialAccueil, syntheseReporting, titreJarvisAccueil,
  type JourneeMesuree, type LotAccueil,
} from '@tiktrends/core';
import type { Session } from '../../../../lib/auth';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { FEATURES, canAccess, denyReason, ouverturesParRole, roleAtLeast, sectionsCompteOuvertes } from '../../../../lib/rbac';
import { refusJarvis } from '../../../../lib/jarvis-acces';
import { onboardingState } from '../../../../lib/onboarding-state';
import { chargerTeteAccueilProjets } from '../../../../lib/accueil-projets';
import { chargerAccueilV5 } from '../../../../lib/accueil-v5';
import { compterBoucle } from '../../../../lib/boucle-resultats';
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
        vignette: sql<string | null>`max(coalesce(${schema.creatives.thumbUrl}, ${schema.creatives.storageUrl}, ${schema.ads.assetUrl}))`,
      }).from(B)
        .leftJoin(schema.ads, eq(schema.ads.batchId, B.id))
        .leftJoin(schema.creatives, eq(schema.creatives.id, schema.ads.creativeId))
        .where(and(eq(B.brandId, marque!.id), eq(B.workspaceId, s.workspaceId)))
        .groupBy(B.id).orderBy(desc(B.number)).limit(200);
      return rows.map((r): LotAccueil => ({
        id: r.id, numero: r.numero, statut: r.statut, but: r.but, variantes: Number(r.variantes),
        lanceLe: r.lanceLe ? (r.lanceLe as Date).toISOString() : null, finPrevue: r.finPrevue ? (r.finPrevue as Date).toISOString() : null,
        vignette: r.vignette && /^https?:\/\//.test(r.vignette) ? r.vignette : r.vignette?.startsWith('/') ? r.vignette : null,
      }));
    }) : Promise.resolve(null),
    // Les dernières notifications de la personne, dans cet espace (même portée que la cloche de l'Accueil V5).
    db ? lire('notifications', () => db!.select({
      id: schema.notifications.id, type: schema.notifications.type, titre: schema.notifications.title,
      corps: schema.notifications.body, href: schema.notifications.href, creeLe: schema.notifications.createdAt,
    }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, s.user.id), eq(schema.notifications.workspaceId, s.workspaceId)))
      .orderBy(desc(schema.notifications.createdAt)).limit(4)) : Promise.resolve(null),
    analyticsOuvert ? lire('connexion Meta', async () => {
      const [b] = await db!.select({ token: schema.brands.metaToken, synchro: schema.brands.adsmapSyncedAt })
        .from(schema.brands).where(and(eq(schema.brands.id, marque!.id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
      return b ? { connecte: !!b.token, synchro: b.synchro as Date | null } : null;
    }) : Promise.resolve(null),
  ]);

  /* ── Reporting Meta ─────────────────────────────────────────────────── */
  let reporting: EtatReporting | null = null;
  if (analyticsOuvert && metaBrand && marque) {
    const lienConnexions = ouvert('/connections') ? { libelle: 'Connecter mes comptes', href: '/connections' } : null;
    if (!metaBrand.connecte) {
      reporting = {
        etat: 'connecter', sous: `${marque.nom} · aucun compte publicitaire connecté`,
        message: lienConnexions
          ? 'Connecte ton compte publicitaire Meta pour suivre ici ta dépense, ton ROAS et tes achats, comparés à la période précédente.'
          : 'Aucun compte publicitaire Meta n’est connecté pour cette marque · un administrateur de l’espace le connecte dans Connexions.',
        lien: lienConnexions,
      };
    } else {
      const periode = periodeReporting({ periode: params.periode, du: params.du, au: params.au, aujourdhui: jourParis(maintenant) });
      const M = schema.metricsDaily, I = schema.adInstances, C = schema.creatives;
      const lignes = await lire('journées Meta', async () => (await db!.select({
        date: M.date,
        depense: sql<number>`coalesce(sum(${M.spend}), 0)`, impressions: sql<number>`coalesce(sum(${M.impressions}), 0)`,
        clics: sql<number>`coalesce(sum(${M.clicks}), 0)`, achats: sql<number>`coalesce(sum(${M.conv}), 0)`,
        revenu: sql<number>`coalesce(sum(${M.revenue}), 0)`, vues3s: sql<number>`coalesce(sum(${M.v3s}), 0)`,
      }).from(M)
        .innerJoin(I, eq(I.id, M.adInstanceId))
        .innerJoin(C, eq(C.id, I.creativeId))
        .where(and(eq(C.brandId, marque.id), eq(I.platform, 'meta'), gte(M.date, periode.precDebut), lte(M.date, periode.fin)))
        .groupBy(M.date)).map((r): JourneeMesuree => ({
        date: String(r.date), depense: Number(r.depense), impressions: Number(r.impressions), clics: Number(r.clics),
        achats: Number(r.achats), revenu: Number(r.revenu), vues3s: Number(r.vues3s),
      })));
      const sous = sousTitreReporting({ marque: marque.nom, synchro: depuisRelatif(metaBrand.synchro, maintenant) });
      const rapides = choixRapidesPeriode(jourParis(maintenant));
      const synthese = lignes ? syntheseReporting(lignes, periode) : null;
      reporting = synthese
        ? { etat: 'mesures', sous, periode, rapides, synthese }
        : {
          etat: 'vide', sous, periode, rapides,
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
    const reste = it.total - it.cartes.length;
    iterer = {
      etat: 'liste', cartes: cartesQuoiIterer(it.cartes, (id) => parAd.get(id)),
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
  }

  const jarvisOuvert = refusJarvis(s) === null;
  return {
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
