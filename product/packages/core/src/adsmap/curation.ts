/**
 * Ce qu'on fait des nœuds proposés.
 *
 * ── La dette qu'on a laissée grandir ─────────────────────────────────────────
 *
 * Le radar, le studio et la passerelle poussent tous des concepts « proposés »,
 * accrochés à des angles « proposés », sous des personas nommés « À qualifier ».
 * C'était la bonne décision à chaque fois : une créa venue d'ailleurs ne décide
 * pas de la taxonomie d'une marque.
 *
 * Mais **rien, nulle part, ne permettait de valider quoi que ce soit**. Le
 * provisoire s'accumulait sans porte de sortie · et une carte qu'on ne croit
 * plus ne sert plus à attribuer, ce qui est exactement ce qu'on lui demande.
 *
 * ── La règle qui fait tout tenir ─────────────────────────────────────────────
 *
 * Un concept validé sous un angle proposé est incohérent : on aurait validé une
 * branche accrochée à rien. **Valider un nœud valide donc ses ancêtres encore
 * proposés**, et on le dit avant de cliquer.
 *
 * Bloquer aurait été l'autre option, et c'est une impasse · « valide d'abord le
 * parent » sur un écran qui ne montre pas le parent oblige à chercher. Chaque
 * branche porte une sortie (D-états-vides).
 *
 * ── Ce qu'on ne fait PAS ici ─────────────────────────────────────────────────
 *
 * Fusionner deux personas. Ça demande de re-raccrocher tous les enfants, et une
 * fusion ratée perd des tests · c'est un travail à part, pas une case à cocher
 * dans un écran de tri.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export type NodeKind = 'persona' | 'desire' | 'angle' | 'concept';
export type NodeStatus = 'proposed' | 'validated' | 'rejected' | 'archived';

/** La chaîne du cahier des charges · Persona → Désir → Angle → Concept. */
export const PARENT_OF: Record<NodeKind, NodeKind | null> = {
  persona: null,
  desire: 'persona',
  angle: 'desire',
  concept: 'angle',
};

export const KIND_LABEL: Record<NodeKind, string> = {
  persona: 'persona',
  desire: 'désir',
  angle: 'angle',
  concept: 'concept',
};

export interface NodeRef {
  id: string;
  kind: NodeKind;
  label: string;
  status: NodeStatus;
}

export interface ValidationPlan {
  /** Tout ce qui passera en validé · le nœud et ses ancêtres encore proposés. */
  ids: Array<{ id: string; kind: NodeKind }>;
  /** Ce qu'on dit avant de cliquer · vide quand seul le nœud est concerné. */
  notice: string | null;
}

/**
 * Ce que valider ce nœud entraîne.
 *
 * `ancestors` va du parent direct vers la racine. Un ancêtre déjà validé arrête
 * la remontée · il ne peut pas y avoir de proposé au-dessus d'un validé, la
 * chaîne étant descendante.
 */
export function planValidation(node: NodeRef, ancestors: NodeRef[]): ValidationPlan {
  const ids: Array<{ id: string; kind: NodeKind }> = [{ id: node.id, kind: node.kind }];
  const remontes: NodeRef[] = [];

  for (const a of ancestors) {
    if (a.status !== 'proposed') break;
    remontes.push(a);
    ids.push({ id: a.id, kind: a.kind });
  }

  if (!remontes.length) return { ids, notice: null };

  const noms = remontes.map((a) => `${KIND_LABEL[a.kind]} « ${a.label} »`).join(', ');
  return {
    ids,
    notice: `Valide aussi ${noms} · un ${KIND_LABEL[node.kind]} validé sous un parent proposé serait accroché à rien.`,
  };
}

/* -------------------------------------------------------------------------- */

export interface RejectImpact {
  /** Peut-on rejeter sans conséquence ? */
  safe: boolean;
  /** Ce qu'il faut savoir avant · vide quand rien ne pend en dessous. */
  warning: string | null;
}

/**
 * Ce que rejeter ce nœud emporte.
 *
 * On ne rejette PAS les enfants en cascade · un angle refusé dont un concept a
 * déjà tourné effacerait un test payé. On avertit, et on laisse décider.
 *
 * `tested` est le nombre de descendants ayant réellement été testés · c'est le
 * seul chiffre qui change la nature du geste.
 */
export function rejectImpact(node: NodeRef, descendants: number, tested: number): RejectImpact {
  if (tested > 0) {
    return {
      safe: false,
      warning: `${tested} test(s) pendent sous ce ${KIND_LABEL[node.kind]} · ils resteront sur la carte, mais leur branche sera marquée refusée.`,
    };
  }
  if (descendants > 0) {
    return {
      safe: true,
      warning: `${descendants} élément(s) proposé(s) en dessous · ils resteront proposés, à trier séparément.`,
    };
  }
  return { safe: true, warning: null };
}

/* -------------------------------------------------------------------------- */

/**
 * Un nom provisoire qu'il faut vraiment remplacer.
 *
 * Les passerelles créent des personas « À qualifier » et des désirs « À
 * qualifier (Studio) ». Les valider tels quels ferait entrer le provisoire dans
 * la carte définitive · c'est le seul cas où on refuse la validation au lieu de
 * la faciliter.
 */
const PROVISOIRES = [/^à qualifier/i, /^a qualifier/i, /^sans nom$/i, /^\(.*\)$/];

export function needsRename(label: string): boolean {
  const t = label.trim();
  if (t.length < 3) return true;
  return PROVISOIRES.some((r) => r.test(t));
}

/** Ce qu'on dit quand le nom ne peut pas rester · une phrase, pas un code. */
export function renameReason(label: string): string | null {
  if (!needsRename(label)) return null;
  return label.trim().length < 3
    ? 'Trop court pour désigner quoi que ce soit six mois plus tard.'
    : 'Nom provisoire posé automatiquement · le valider tel quel ferait entrer le provisoire dans la carte définitive.';
}
