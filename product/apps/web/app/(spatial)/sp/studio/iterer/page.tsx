import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, capacitesDuRefus, choixInitialIteration, choixIterationSpatial, lireIterationDemandee, refusStudiosSpatial,
  videIterationSpatial, MAX_CHOIX_ITERATION, CHEMIN_PROJETS, type ContexteAdSpatial,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { getActiveBrand } from '../../../../../lib/brands';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { gardeSources } from '../../../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../../../lib/studios/interrupteurs';
import { iterationPlanAction, type IterationRow } from '../../../../actions/adsmap-iterate';
import { Iterer } from '../../../../../spatial/vues/studios/Iterer';
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
 * d'itération Adsmap). Le geste mène à la reprise réelle du brief
 * (`lienIterationStudio`) · LECTURE SEULE, rien n'est généré ni débité ici.
 */
export default async function IterationSpatiale({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const demande = lireIterationDemandee(await searchParams);

  const g = await gardeSources('studio.read');
  if (!g.ok) redirect(CHEMIN_PROJETS);
  const coupe = await refusCapacite(g.ctx, ['projets']);
  if (coupe) return <RefusStudios titre="Nouvelle itération" sous="Studios" refus={refusStudiosSpatial({ capacites: capacitesDuRefus(coupe), code: coupe.code, plan: false, message: coupe.message, traceId: coupe.traceId })} />;

  const active = await getActiveBrand(s.workspaceId);
  const refus = denyReason(effectiveAccess(s), FEATURE_ADSMAP);
  // Créer le projet de l'itération · la même permission que `creerProjet`, pour la marque active dans la portée.
  const peutIterer = aPermissionEspace(g.ctx.permissions, 'studio.propose') && !!active && g.ctx.marques.includes(active.id);

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
  if (ids.length && db) {
    try {
      const lignes = await db.select({ adId: schema.ads.id, metricsAgg: schema.verdicts.metricsAgg, assetUrl: schema.ads.assetUrl, thumbUrl: schema.creatives.thumbUrl })
        .from(schema.ads)
        .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
        .leftJoin(schema.creatives, eq(schema.creatives.id, schema.ads.creativeId))
        .where(and(eq(schema.ads.workspaceId, s.workspaceId), inArray(schema.ads.id, ids)));
      for (const l of lignes) {
        const roas = (l.metricsAgg as { roas?: unknown } | null)?.roas;
        contexte.set(l.adId, { roas: typeof roas === 'number' ? roas : null, vignette: l.thumbUrl ?? l.assetUrl ?? null });
      }
    } catch (e) {
      // Le contexte est un complément · sans lui, la liste reste (ni ROAS ni vignette, jamais un chiffre inventé).
      console.warn('[studios] contexte des pubs à itérer illisible', e instanceof Error ? e.message : e);
    }
  }

  const choix = choixIterationSpatial(rows, (id) => contexte.get(id), { peutIterer });
  return (
    <Iterer
      sous={active ? `Itération · ${active.name}` : 'Itération'}
      resume={resume}
      choix={choix}
      initial={choixInitialIteration(choix, demande)}
      vide={videIterationSpatial({ refus, marque: !!active, erreur, lignes: choix.length, resume })}
    />
  );
}
