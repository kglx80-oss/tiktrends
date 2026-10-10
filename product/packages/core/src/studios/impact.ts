/**
 * Studios · calcul d'un ImpactPlan (cahier 01 §10, « Versions et calcul des impacts »).
 *
 * Pur. On ne compare pas des champs à la main ; on construit, pour chaque
 * version, un GRAPHE de sorties dont chaque nœud porte l'empreinte de ce qu'il
 * LIT (ses entrées directes et l'empreinte de ses parents). Entre deux versions,
 * un nœud dont l'empreinte change est à refaire ; un nœud dont l'empreinte est
 * identique est réutilisé. La table du cahier devient une propriété du graphe :
 *
 * | Changement            | Le graphe le propage vers                       |
 * |-----------------------|-------------------------------------------------|
 * | texte écran, logo     | composition / montage, export · AUCUNE image    |
 * | narration             | voix du plan, sous-titres, montage, export      |
 * |                       | (clip seulement si lipsync)                     |
 * | voix                  | toutes les voix, clips lipsync, montage, export |
 * | tenue / identité      | fiche, images et clips des plans qui la citent  |
 * | produit               | images et clips des plans qui le citent         |
 * | style décor           | images et clips, rien côté audio ni texte       |
 * | ordre des plans       | montage, sous-titres, mix, export · RIEN généré |
 * | musique / gain        | mix, export                                     |
 * | format (dimensions)   | composition, export                             |
 * | prompt / connaissance | rien · hors contenu, seuls les nouveaux devis   |
 *
 * Les nœuds `generation` coûtent (image, clip, voix, fiche) ; les nœuds
 * `calcul` sont déterministes (composition, montage, mix, sous-titres, export).
 */

import type { ContenuVersion, PlanStudio } from './document';
import { cheminsDifferents } from './patch';
import { avecCanoniqueMemorise, empreinteContenu } from './version';

export type NatureNoeud = 'generation' | 'calcul';

export interface NoeudImpact {
  id: string;
  nature: NatureNoeud;
  /** Rang dans le DAG · un nœud ne dépend que de rangs inférieurs. */
  niveau: number;
  empreinte: string;
}

export interface PlanImpact {
  /** Chemins du contenu qui diffèrent entre les deux versions. */
  entreesModifiees: string[];
  /** Sorties existantes réutilisables telles quelles. */
  reutilisees: string[];
  /** Sorties existantes qui ne valent plus pour la nouvelle version. */
  obsoletes: string[];
  /** Sorties à produire, dans l'ordre du DAG. */
  aRefaire: Array<{ id: string; nature: NatureNoeud }>;
  empreinteAvant: string;
  empreinteApres: string;
  /** Empreinte du plan lui-même · un devis s'y épingle. */
  empreinte: string;
}

const VISUEL_PLAN = ['subject', 'action', 'framing', 'camera', 'lighting', 'environment', 'referenceIds'] as const;

function parleAvecVoix(p: PlanStudio): boolean {
  return p.speechMode !== 'none' && p.narration.trim().length > 0;
}

function dependDuProduit(p: PlanStudio, c: ContenuVersion): boolean {
  if (!c.productRef) return false;
  const refs = new Set(p.referenceIds);
  return refs.has(c.productRef.productId) || (typeof c.productRef.assetId === 'string' && refs.has(c.productRef.assetId));
}

/**
 * L6-A · consignes d'image des plans vidéo (`shot.image`), rangées par plan
 * dans `styleRef.consignesPlans`. Elles ne font PAS partie du style commun :
 * retenir la consigne du plan 1 ne rend obsolète que l'image clé du plan 1.
 */
export const CLE_CONSIGNES_PLANS = 'consignesPlans' as const;

const estObjetSimple = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Le style commun lu par les images clés · sans les consignes par plan ; un style vide vaut « aucun ». */
export function styleCommun(styleRef: ContenuVersion['styleRef']): Record<string, unknown> | null {
  if (!estObjetSimple(styleRef)) return null;
  const reste: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(styleRef)) if (k !== CLE_CONSIGNES_PLANS) reste[k] = v;
  return Object.keys(reste).length ? reste : null;
}

/** La consigne retenue pour un plan · `null` si aucune (forme vérifiée ailleurs, `video/consigne-plan.ts`). */
export function consigneRetenueDuPlan(c: Pick<ContenuVersion, 'styleRef'>, shotId: string): unknown {
  const s = c.styleRef;
  if (!estObjetSimple(s)) return null;
  const m = s[CLE_CONSIGNES_PLANS];
  if (!estObjetSimple(m) || !Object.prototype.hasOwnProperty.call(m, shotId)) return null;
  return m[shotId] ?? null;
}

/**
 * Ce que l'image clé d'un plan LIT, hors sa consigne : le visuel du plan, le
 * style commun, le produit s'il est cité, les fiches d'identité citées. Une
 * consigne `shot.image` compilée sur d'autres entrées est périmée.
 */
export function entreesKeyframe(c: ContenuVersion, shotId: string): Record<string, unknown> | null {
  const p = Object.prototype.hasOwnProperty.call(c.shots.byId, shotId) ? c.shots.byId[shotId] : undefined;
  if (!p) return null;
  const visuel: Record<string, unknown> = {};
  for (const k of VISUEL_PLAN) visuel[k] = p[k];
  const refsIdentite = p.referenceIds.filter((r) => Object.prototype.hasOwnProperty.call(c.characterRefs, r)).sort();
  return {
    visuel,
    style: styleCommun(c.styleRef),
    produit: dependDuProduit(p, c) ? c.productRef : null,
    identites: refsIdentite.map((r) => empreinteContenu(c.characterRefs[r])),
  };
}

/** Le graphe des sorties d'une version, empreintes comprises. */
export function grapheImpact(c: ContenuVersion): Map<string, NoeudImpact> {
  return avecCanoniqueMemorise(() => construireGraphe(c));
}

function construireGraphe(c: ContenuVersion): Map<string, NoeudImpact> {
  const g = new Map<string, NoeudImpact>();
  const pose = (id: string, nature: NatureNoeud, niveau: number, entrees: unknown) => {
    const n: NoeudImpact = { id, nature, niveau, empreinte: empreinteContenu(entrees) };
    g.set(id, n);
    return n.empreinte;
  };
  const video = c.timeline !== null;

  // Niveau 0 · fiches d'identité.
  const identites = new Map<string, string>();
  for (const [cid, ref] of Object.entries(c.characterRefs)) identites.set(cid, pose(`identite:${cid}`, 'generation', 0, ref));

  // Niveau 1 · images clés et voix, par plan (indexé par identifiant, jamais par position).
  const keyframes = new Map<string, string>();
  const voix = new Map<string, string>();
  for (const [sid, p] of Object.entries(c.shots.byId)) {
    // La consigne retenue du plan (L6-A) entre dans SA seule image clé.
    const entrees = entreesKeyframe(c, sid)!;
    const consigne = consigneRetenueDuPlan(c, sid);
    keyframes.set(sid, pose(`keyframe:${sid}`, 'generation', 1, consigne === null ? entrees : { ...entrees, consigne }));
    if (parleAvecVoix(p)) {
      voix.set(sid, pose(`voix:${sid}`, 'generation', 1, { narration: p.narration, voix: c.timeline?.voice ?? null }));
    }
  }

  // Niveau 2 · clips animés (projets avec timeline).
  const clips = new Map<string, string>();
  if (video) {
    for (const [sid, p] of Object.entries(c.shots.byId)) {
      clips.set(sid, pose(`clip:${sid}`, 'generation', 2, {
        keyframe: keyframes.get(sid),
        action: p.action,
        camera: p.camera,
        dureeMs: p.estimatedDurationMs,
        parole: p.speechMode,
        lipsync: p.speechMode === 'lipsync' ? (voix.get(sid) ?? null) : null,
      }));
    }
  }

  // Niveau 3 · assemblages déterministes.
  let montage: string | null = null;
  let mix: string | null = null;
  let sousTitres: string | null = null;
  if (c.timeline) {
    const t = c.timeline;
    montage = pose('montage', 'calcul', 3, {
      ordre: c.shots.order,
      plans: c.shots.order.map((sid) => {
        const p = c.shots.byId[sid];
        return { sid, clip: clips.get(sid) ?? null, voix: voix.get(sid) ?? null, texteEcran: p?.onScreenText ?? [], dureeReelle: p?.actualDurationMs ?? null };
      }),
      pistes: t.tracks, timebase: t.timebase, fps: t.fps, duree: t.durationTicks,
    });
    mix = pose('mix', 'calcul', 4, { musique: t.music, montage });
    if (t.subtitles.enabled) {
      sousTitres = pose('sous_titres', 'calcul', 4, {
        lignes: c.shots.order.map((sid) => ({ narration: c.shots.byId[sid]?.narration ?? '', voix: voix.get(sid) ?? null })),
        montage,
      });
    }
  }
  const composition = c.document ? pose('composition', 'calcul', 3, { document: c.document }) : null;

  // Niveau 5 · export.
  if (composition !== null || montage !== null) {
    pose('export', 'calcul', 5, { composition, montage, mix, sousTitres });
  }
  return g;
}

export interface OptionsImpact {
  /** Sorties qui existent réellement (média stocké) · défaut : toutes celles de `avant`. */
  sortiesExistantes?: Iterable<string>;
}

export function calculerPlanImpact(avant: ContenuVersion, apres: ContenuVersion, o: OptionsImpact = {}): PlanImpact {
  return planImpactEtGraphes(avant, apres, o).plan;
}

/**
 * Le plan ET les deux graphes dont il est tiré · pour l'appelant qui en a
 * besoin (libellés de `impactVideo`), sans reconstruire le graphe de départ
 * (L8-C : un graphe de 200 plans et 1000 calques coûte ≈ 45 ms, mesuré).
 */
export function planImpactEtGraphes(avant: ContenuVersion, apres: ContenuVersion, o: OptionsImpact = {}):
  { plan: PlanImpact; grapheAvant: Map<string, NoeudImpact>; grapheApres: Map<string, NoeudImpact> } {
  // Pur et sans mutation des entrées · la forme canonique d'un objet partagé n'est calculée qu'une fois.
  return avecCanoniqueMemorise(() => planEtGraphes(avant, apres, o));
}

function planEtGraphes(avant: ContenuVersion, apres: ContenuVersion, o: OptionsImpact):
  { plan: PlanImpact; grapheAvant: Map<string, NoeudImpact>; grapheApres: Map<string, NoeudImpact> } {
  const ga = grapheImpact(avant);
  const gb = grapheImpact(apres);
  const existantes = new Set(o.sortiesExistantes ?? ga.keys());

  const reutilisees: string[] = [];
  const obsoletes: string[] = [];
  for (const [id, n] of ga) {
    if (!existantes.has(id)) continue;
    const m = gb.get(id);
    if (m && m.empreinte === n.empreinte) reutilisees.push(id);
    else obsoletes.push(id);
  }

  const aRefaire = [...gb.values()]
    .filter((n) => {
      const a = ga.get(n.id);
      return !a || a.empreinte !== n.empreinte || !existantes.has(n.id);
    })
    .sort((x, y) => x.niveau - y.niveau || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((n) => ({ id: n.id, nature: n.nature }));

  const corps = {
    entreesModifiees: cheminsDifferents(avant, apres).map((ch) => ch || '/'),
    reutilisees: reutilisees.sort(),
    obsoletes: obsoletes.sort(),
    aRefaire,
    empreinteAvant: empreinteContenu(avant),
    empreinteApres: empreinteContenu(apres),
  };
  return { plan: { ...corps, empreinte: empreinteContenu(corps) }, grapheAvant: ga, grapheApres: gb };
}

/** Les sorties PAYANTES d'un plan (images, clips, voix, fiches). */
export function generationsDuPlan(p: PlanImpact): string[] {
  return p.aRefaire.filter((n) => n.nature === 'generation').map((n) => n.id);
}
