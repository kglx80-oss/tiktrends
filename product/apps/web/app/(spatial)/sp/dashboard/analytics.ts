import 'server-only';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { MetaAdsInsights } from '@tiktrends/integrations';
import {
  bilanAvanceAccueil, cheminOuvert, diversiteCreative, encartMetaConnexion, etatConnexionMeta, metriquesMetaAnalytics,
  refusVueAnalytics, resoudreAccueil, type BilanAvanceAccueil, type ChiffresClesMeta, type DiversiteCreative, type EtatConnexionMeta, type ParamsRequete,
} from '@tiktrends/core';
import type { Session } from '../../../../lib/auth';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { lireChiffresClesMeta } from '../../../../lib/chiffres-cles-meta';
import { FEATURES, canAccess, denyReason, ouverturesParRole } from '../../../../lib/rbac';
import { attributionViewAction, creativeTrendAction } from '../../../actions/adsmap-attribution';
import type { PropsAnalytics } from '../../../../spatial/vues/accueil/Analytics';

/**
 * La vue Analytics de l'Accueil Spatial · les MÊMES lectures que l'ancienne vue
 * (`components/accueil/VueAnalytics`, retirée) :
 *
 *  · le droit Analytics de la matrice (`canAccess`) est vérifié AVANT toute
 *    lecture · refusé, rien n'est lu (ni marque, ni KPI, ni générations) ;
 *  · les chiffres clés Meta et l'état de la connexion · LA même lecture et LA
 *    même règle que l'Accueil, Jarvis et le Radar (`lireChiffresClesMeta` →
 *    `chiffresClesMeta`, D2) ; les autres indicateurs du compte
 *    (`brands.ads_insights` · panier moyen, CPC, CPM, répartitions, top créas) ;
 *  · diversité créative · 200 dernières générations « ad »/« image » de la
 *    marque, tags des assets de la marque OU communs de l'espace (400) ;
 *  · bilan avancé de Jarvis · sous son propre droit Adsmap, par les actions
 *    existantes (`attributionViewAction`, `creativeTrendAction`).
 *
 * Rien n'est écrit, rien n'est généré · 0 appel IA.
 */
const ANALYTICS = FEATURES.find((f) => f.key === 'analytics')!;
const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

export async function chargerAnalyticsSpatial(s: Session, params: ParamsRequete): Promise<PropsAnalytics> {
  const acces = effectiveAccess(s);
  const regles = ouverturesParRole(acces);
  const { onglets } = resoudreAccueil({ params, ouvert: (href) => cheminOuvert(href, regles) });
  const vues = onglets.map((o) => ({ href: o.href, libelle: o.libelle, actif: o.actif }));
  if (!canAccess(acces, ANALYTICS)) return { onglets: vues, etat: 'refus', message: refusVueAnalytics(denyReason(acces, ANALYTICS)) };

  const brand = await getActiveBrand(s.workspaceId);
  let insights: MetaAdsInsights | null = null;
  let synchro: Date | null = null;
  let connexion: EtatConnexionMeta = etatConnexionMeta({ jeton: false, compte: false, comptes: 0, kpiLe: null, mesuresLe: null }, new Date());
  let chiffres: ChiffresClesMeta | null = null;
  let diversite: DiversiteCreative | null = null;
  if (db && brand) {
    const lus = await lireChiffresClesMeta(brand.id, s.workspaceId);
    const lue = lus?.lue ?? null;
    if (lue?.insights?.window) insights = lue.insights;
    synchro = lue ? (lue.entree.kpiLe as Date | null) : null;
    if (lus) { connexion = lus.connexion; chiffres = lus.chiffres; }

    const gens = await db.select({ input: schema.generations.input }).from(schema.generations)
      .where(and(eq(schema.generations.brandId, brand.id), inArray(schema.generations.kind, ['ad', 'image'])))
      .orderBy(desc(schema.generations.createdAt)).limit(200);
    // Scopé à la marque active OU aux assets communs de l'espace · même règle que `listAssets` (#514).
    const assets = await db.select({ tags: schema.assets.tags }).from(schema.assets)
      .where(and(eq(schema.assets.workspaceId, s.workspaceId), or(eq(schema.assets.brandId, brand.id), isNull(schema.assets.brandId))))
      .limit(400);
    diversite = diversiteCreative(gens.map((g) => (g.input ?? {}) as { template?: unknown; headline?: unknown }), assets.map((a) => a.tags ?? []));
  }

  let bilan: BilanAvanceAccueil | null = null;
  if (brand && canAccess(acces, ADSMAP)) {
    const [attribution, tendance] = await Promise.all([attributionViewAction(), creativeTrendAction()]);
    bilan = bilanAvanceAccueil({
      marque: brand.name,
      tendance: tendance.trend ?? null,
      attribution: attribution.view ?? null,
      erreur: 'error' in attribution && attribution.error ? attribution.error : null,
    });
  }

  return {
    onglets: vues, etat: 'ouvert',
    chiffres: chiffres && { connexion: connexion.libelle, c: chiffres },
    meta: insights ? metriquesMetaAnalytics(insights, synchro, connexion.libelle) : null,
    encart: insights ? null : encartMetaConnexion(connexion),
    diversite,
    bilan,
  };
}
