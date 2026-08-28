/**
 * ADSMAP · lecture du graphe (§7).
 *
 * Le canvas ne sert pas à faire joli. Il sert à voir ce qu'un tableur ne montre
 * pas : les **branches mortes**. Un désir qu'on n'a jamais attaqué sous aucun
 * angle, un angle jamais décliné en concept, un concept jamais produit, une
 * gagnante dont on n'a jamais tiré d'itération.
 *
 * Chacune de ces quatre situations est une occasion perdue, et chacune est
 * invisible ligne par ligne · elle ne se voit que dans la forme de l'arbre.
 *
 * Ce fichier est pur : il ne connaît ni le rendu ni la base, seulement la forme
 * du graphe. Le canvas s'en sert pour marquer, les écrans pour compter.
 */

export type GraphNodeKind = 'persona' | 'desire' | 'angle' | 'concept' | 'ad';

/** Le minimum dont la lecture a besoin · volontairement structurel. */
export interface GraphNodeShape {
  id: string;
  kind: GraphNodeKind;
  parentId: string | null;
  verdict?: string | null;
  childCount: number;
}

export type GapKind = 'desire_no_angle' | 'angle_no_concept' | 'concept_no_ad' | 'winner_no_iteration';

export interface Gap {
  nodeId: string;
  kind: GapKind;
  /** Ce qui manque, et ce que ça coûte · affichable tel quel. */
  message: string;
}

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);

/**
 * Les occasions perdues du graphe.
 *
 * Volontairement limité à quatre règles, toutes vérifiables sans jugement. On
 * pourrait en inventer d'autres (« ce persona a peu d'angles »), mais un canvas
 * qui signale trop finit signalé partout, donc lu nulle part.
 */
export function findGaps(
  nodes: GraphNodeShape[],
  iterationParents: ReadonlySet<string> = new Set(),
): Gap[] {
  const out: Gap[] = [];
  for (const n of nodes) {
    if (n.kind === 'desire' && n.childCount === 0) {
      out.push({ nodeId: n.id, kind: 'desire_no_angle', message: 'Désir jamais attaqué · aucun angle ne s’y rattache.' });
    } else if (n.kind === 'angle' && n.childCount === 0) {
      out.push({ nodeId: n.id, kind: 'angle_no_concept', message: 'Angle jamais décliné · aucun concept n’en est sorti.' });
    } else if (n.kind === 'concept' && n.childCount === 0) {
      out.push({ nodeId: n.id, kind: 'concept_no_ad', message: 'Concept jamais produit · aucune ad ne l’a testé.' });
    } else if (n.kind === 'ad' && n.verdict && GAGNANTS.has(n.verdict) && !iterationParents.has(n.id)) {
      out.push({
        nodeId: n.id, kind: 'winner_no_iteration',
        message: 'Gagnante jamais itérée · c’est le gisement le moins cher du compte, et il dort.',
      });
    }
  }
  return out;
}

/** Les ads qui sont parentes d'au moins une itération · entrée de `findGaps`. */
export function iterationParentSet(edges: Array<{ source: string; kind: string }>): Set<string> {
  return new Set(edges.filter((e) => e.kind === 'iteration').map((e) => e.source));
}

export interface GraphCounts {
  personas: number; desires: number; angles: number; concepts: number; ads: number;
  winners: number;
  /** Nombre d'occasions perdues, par type · l'entête du canvas les affiche. */
  gaps: Record<GapKind, number>;
}

export function countGraph(nodes: GraphNodeShape[], gaps: Gap[]): GraphCounts {
  const parKind = (k: GraphNodeKind) => nodes.filter((n) => n.kind === k).length;
  const compte = (k: GapKind) => gaps.filter((g) => g.kind === k).length;
  return {
    personas: parKind('persona'), desires: parKind('desire'), angles: parKind('angle'),
    concepts: parKind('concept'), ads: parKind('ad'),
    winners: nodes.filter((n) => n.kind === 'ad' && n.verdict && GAGNANTS.has(n.verdict)).length,
    gaps: {
      desire_no_angle: compte('desire_no_angle'),
      angle_no_concept: compte('angle_no_concept'),
      concept_no_ad: compte('concept_no_ad'),
      winner_no_iteration: compte('winner_no_iteration'),
    },
  };
}

/**
 * Une phrase pour l'entête du canvas.
 *
 * Elle nomme UNE priorité, pas quatre. Une liste de quatre chiffres se lit comme
 * un tableau de bord ; une phrase qui dit quoi faire se lit comme un conseil, et
 * l'ordre choisi est celui du rendement : itérer une gagnante coûte moins cher
 * que produire un concept, qui coûte moins cher qu'ouvrir un angle.
 */
export function summarizeGaps(counts: GraphCounts): string {
  const g = counts.gaps;
  if (g.winner_no_iteration > 0) {
    return `${g.winner_no_iteration} gagnante(s) jamais itérée(s) · c’est le gisement le moins cher, commence par là.`;
  }
  if (g.concept_no_ad > 0) {
    return `${g.concept_no_ad} concept(s) écrit(s) mais jamais produit(s) · le travail d’idéation est déjà fait.`;
  }
  if (g.angle_no_concept > 0) {
    return `${g.angle_no_concept} angle(s) sans aucun concept · à décliner avant d’ouvrir de nouveaux désirs.`;
  }
  if (g.desire_no_angle > 0) {
    return `${g.desire_no_angle} désir(s) jamais attaqué(s) · territoire entier laissé de côté.`;
  }
  if (!counts.ads) return 'Carte vide · pars d’un persona et descends jusqu’à la première ad.';
  return 'Aucune branche morte · chaque désir descend jusqu’à une ad testée.';
}
