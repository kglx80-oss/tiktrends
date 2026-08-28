'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';

/**
 * ADSMAP · lecture du graphe pour le canvas (§7).
 *
 * La vue Table répond à « où en est ce test ». Le canvas répond à une autre
 * question, que le tableur n'a jamais su poser : **d'où vient ce gagnant, et
 * qu'est-ce qu'on n'a pas encore essayé ?** Un désir sans angle, un angle sans
 * concept, une gagnante sans itération sautent aux yeux sur un graphe et restent
 * invisibles sur une ligne.
 *
 * D'où la forme de ce qui est renvoyé : la hiérarchie ENTIÈRE, y compris les
 * branches vides. Ne remonter que les nœuds qui portent des ads ferait disparaître
 * précisément ce qu'on vient chercher.
 *
 * Cinq requêtes à plat, jamais de N+1 : la mise en forme se fait en mémoire.
 */

export type NodeKind = 'persona' | 'desire' | 'angle' | 'concept' | 'ad';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Rattachement hiérarchique · null pour les personas, racines du graphe. */
  parentId: string | null;
  status: string;
  /** Ads seulement · sert la couleur et l'infobulle. */
  verdict?: string | null;
  comparable?: boolean | null;
  adStatus?: string;
  cpa?: number | null;
  /** Angles seulement · le mécanisme est ce qu'on compare d'un angle à l'autre. */
  mechanism?: string | null;
  /** Nombre de descendants directs · sert à repérer les branches mortes. */
  childCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** `tree` = rattachement, `iteration` = filiation d'un test à l'autre. */
  kind: 'tree' | 'iteration';
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Vrai si la lecture a été tronquée · on le dit plutôt que d'afficher un graphe faux. */
  truncated: boolean;
}

/** Au-delà, un canvas devient illisible avant d'être lent · on borne et on le dit. */
const MAX_ADS = 800;

const VARIABLE_LABEL: Record<string, string> = {
  hook: 'Hook', opening_visual: 'Visuel', body: 'Corps', length: 'Durée', cta: 'CTA',
  format: 'Format', offer: 'Offre', landing: 'Landing', avatar_on_screen: 'Personne',
  proof: 'Preuve', audio: 'Audio', angle: 'Angle', desire: 'Désir', none_control: 'Contrôle',
};

export async function graphAction(): Promise<{ graph?: Graph; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const ws = g.s.workspaceId;

    const personas = await db!.select({
      id: schema.personas.id, name: schema.personas.name, status: schema.personas.status,
    }).from(schema.personas).where(eq(schema.personas.brandId, g.brand.id));

    if (!personas.length) return { graph: { nodes: [], edges: [], truncated: false } };
    const personaIds = personas.map((p) => p.id);

    const desires = await db!.select({
      id: schema.desires.id, label: schema.desires.label, personaId: schema.desires.personaId,
      status: schema.desires.status,
    }).from(schema.desires).where(and(eq(schema.desires.workspaceId, ws), inArray(schema.desires.personaId, personaIds)));

    const desireIds = desires.map((d) => d.id);
    const angles = desireIds.length
      ? await db!.select({
          id: schema.angles.id, label: schema.angles.label, desireId: schema.angles.desireId,
          mechanism: schema.angles.mechanism, status: schema.angles.status,
        }).from(schema.angles).where(inArray(schema.angles.desireId, desireIds))
      : [];

    const angleIds = angles.map((a) => a.id);
    const concepts = angleIds.length
      ? await db!.select({
          id: schema.concepts.id, title: schema.concepts.title, angleId: schema.concepts.angleId,
          status: schema.concepts.status,
        }).from(schema.concepts).where(inArray(schema.concepts.angleId, angleIds))
      : [];

    const conceptIds = concepts.map((c) => c.id);
    const ads = conceptIds.length
      ? await db!.select({
          id: schema.ads.id, conceptId: schema.ads.conceptId, variantCode: schema.ads.variantCode,
          status: schema.ads.status,
          verdictComputed: schema.verdicts.computed, verdictValidated: schema.verdicts.validated,
          comparable: schema.verdicts.comparable, metricsAgg: schema.verdicts.metricsAgg,
        })
          .from(schema.ads)
          .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
          .where(inArray(schema.ads.conceptId, conceptIds))
          .limit(MAX_ADS + 1)
      : [];

    const truncated = ads.length > MAX_ADS;
    const adsAffichees = truncated ? ads.slice(0, MAX_ADS) : ads;
    const adIds = adsAffichees.map((a) => a.id);

    const filiations = adIds.length
      ? await db!.select({
          childAdId: schema.iterationEdges.childAdId,
          parentAdId: schema.iterationEdges.parentAdId,
          changedVariable: schema.iterationEdges.changedVariable,
          mode: schema.iterationEdges.mode,
        }).from(schema.iterationEdges).where(inArray(schema.iterationEdges.childAdId, adIds))
      : [];

    // Comptage des enfants directs · c'est ce qui fait apparaître les branches
    // mortes, la seule chose qu'un tableur ne montrera jamais.
    const enfants = new Map<string, number>();
    const compte = (id: string | null) => { if (id) enfants.set(id, (enfants.get(id) ?? 0) + 1); };
    for (const d of desires) compte(d.personaId);
    for (const a of angles) compte(a.desireId);
    for (const c of concepts) compte(c.angleId);
    for (const a of adsAffichees) compte(a.conceptId);

    const nodes: GraphNode[] = [
      ...personas.map((p): GraphNode => ({
        id: p.id, kind: 'persona', label: p.name, parentId: null, status: p.status,
        childCount: enfants.get(p.id) ?? 0,
      })),
      ...desires.map((d): GraphNode => ({
        id: d.id, kind: 'desire', label: d.label, parentId: d.personaId, status: d.status,
        childCount: enfants.get(d.id) ?? 0,
      })),
      ...angles.map((a): GraphNode => ({
        id: a.id, kind: 'angle', label: a.label, parentId: a.desireId, status: a.status,
        mechanism: a.mechanism, childCount: enfants.get(a.id) ?? 0,
      })),
      ...concepts.map((c): GraphNode => ({
        id: c.id, kind: 'concept', label: c.title, parentId: c.angleId, status: c.status,
        childCount: enfants.get(c.id) ?? 0,
      })),
      ...adsAffichees.map((a): GraphNode => {
        const agg = (a.metricsAgg ?? null) as { cpa?: number } | null;
        return {
          id: a.id, kind: 'ad', label: a.variantCode, parentId: a.conceptId, status: a.status,
          // Le verdict humain fait foi quand il existe : c'est lui qui a été arbitré.
          verdict: a.verdictValidated ?? a.verdictComputed ?? null,
          comparable: a.comparable ?? null,
          adStatus: a.status,
          cpa: agg?.cpa ?? null,
          childCount: 0,
        };
      }),
    ];

    const connus = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = [
      ...nodes.filter((n) => n.parentId).map((n): GraphEdge => ({
        id: `t:${n.parentId}:${n.id}`, source: n.parentId!, target: n.id, kind: 'tree',
      })),
      // Une filiation dont le parent est hors de la fenêtre pointerait dans le
      // vide · on l'écarte plutôt que d'afficher une arête cassée.
      ...filiations.filter((f) => connus.has(f.parentAdId) && connus.has(f.childAdId)).map((f): GraphEdge => ({
        id: `i:${f.parentAdId}:${f.childAdId}`, source: f.parentAdId, target: f.childAdId, kind: 'iteration',
        label: VARIABLE_LABEL[f.changedVariable] ?? f.changedVariable,
      })),
    ];

    return { graph: { nodes, edges, truncated } };
  } catch (e) {
    return { error: logAndTranslate('adsmap:graph', e, { subject: 'la lecture de la carte', workspaceId: g.s.workspaceId }) };
  }
}
