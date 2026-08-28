/**
 * ADSMAP · revue en lot des propositions d'agents.
 *
 * Les agents A1 à A3 produisent des dizaines de nœuds en `proposed`. Sans moyen
 * de les traiter en lot, le robinet est ouvert et l'évier absent : la carte se
 * remplit de propositions que personne n'a le temps d'arbitrer une par une, et
 * l'arbre devient illisible · exactement ce que D21 cherchait à éviter en
 * limitant la génération.
 *
 * Le fichier ne fait qu'une chose, mais c'est celle qui compte : décider ce que
 * valider ou rejeter EN LOT implique réellement sur l'arbre. Deux règles, et
 * elles vont dans des sens opposés à dessein.
 *
 *  - **Valider remonte.** Accepter un concept, c'est accepter l'angle et le désir
 *    dont il descend · sinon la validation créerait un nœud validé sous un parent
 *    proposé, et l'arbre affirmerait une chose et son contraire. On valide donc
 *    la chaîne d'ascendance encore en attente.
 *  - **Rejeter descend, mais s'arrête devant l'humain.** Rejeter un angle rejette
 *    ses concepts encore proposés · ils n'ont plus de raison d'être. En revanche
 *    un descendant DÉJÀ VALIDÉ bloque le rejet : quelqu'un l'a explicitement
 *    accepté, et un geste de nettoyage n'a pas à défaire une décision prise.
 *
 * Pur : ni base, ni horloge.
 */

export type ReviewKind = 'persona' | 'desire' | 'angle' | 'concept';
export type ReviewStatus = 'proposed' | 'validated' | 'rejected' | 'archived';

export interface ReviewNode {
  id: string;
  kind: ReviewKind;
  parentId: string | null;
  status: ReviewStatus;
  /** Sert uniquement aux messages · jamais à la décision. */
  label?: string;
}

export interface ReviewPlan {
  /** Nœuds à passer dans le nouveau statut, ordre indifférent. */
  targets: string[];
  /** Nœuds ajoutés par propagation · l'écran les annonce avant d'agir. */
  cascaded: string[];
  /** Demandes refusées, avec la raison affichable. */
  blocked: Array<{ id: string; reason: string }>;
}

const KIND_LABEL: Record<ReviewKind, string> = {
  persona: 'avatar', desire: 'désir', angle: 'angle', concept: 'concept',
};

/** Index parent → enfants, construit une fois par plan. */
function childrenIndex(nodes: ReviewNode[]): Map<string, ReviewNode[]> {
  const idx = new Map<string, ReviewNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    idx.set(n.parentId, [...(idx.get(n.parentId) ?? []), n]);
  }
  return idx;
}

/**
 * Valider : le nœud, plus sa chaîne d'ascendance encore proposée.
 *
 * Un nœud déjà validé n'est pas une erreur, il est simplement ignoré · cliquer
 * deux fois sur « valider » ne doit pas produire de message d'échec.
 */
export function planValidate(nodes: ReviewNode[], ids: readonly string[]): ReviewPlan {
  const parId = new Map(nodes.map((n) => [n.id, n]));
  const targets = new Set<string>();
  const cascaded = new Set<string>();
  const blocked: ReviewPlan['blocked'] = [];

  for (const id of ids) {
    const n = parId.get(id);
    if (!n) { blocked.push({ id, reason: 'Nœud introuvable.' }); continue; }
    if (n.status === 'validated') continue;
    if (n.status === 'rejected' || n.status === 'archived') {
      blocked.push({ id, reason: `Ce ${KIND_LABEL[n.kind]} a été rejeté · rouvre-le avant de le valider.` });
      continue;
    }
    targets.add(id);

    // Remontée · bornée par `vus`, un graphe abîmé ne doit pas boucler ici.
    const vus = new Set<string>([id]);
    let cur = n.parentId ? parId.get(n.parentId) : undefined;
    while (cur && !vus.has(cur.id)) {
      vus.add(cur.id);
      if (cur.status === 'proposed' && !targets.has(cur.id)) cascaded.add(cur.id);
      cur = cur.parentId ? parId.get(cur.parentId) : undefined;
    }
  }

  // Un nœud demandé explicitement n'est pas « ajouté par propagation ».
  for (const t of targets) cascaded.delete(t);
  return { targets: [...targets, ...cascaded], cascaded: [...cascaded], blocked };
}

/**
 * Rejeter : le nœud et ses descendants encore proposés.
 *
 * Un descendant validé bloque · c'est la seule protection qui empêche un
 * nettoyage rapide de défaire un arbitrage humain.
 */
export function planReject(nodes: ReviewNode[], ids: readonly string[]): ReviewPlan {
  const parId = new Map(nodes.map((n) => [n.id, n]));
  const enfants = childrenIndex(nodes);
  const targets = new Set<string>();
  const cascaded = new Set<string>();
  const blocked: ReviewPlan['blocked'] = [];

  for (const id of ids) {
    const n = parId.get(id);
    if (!n) { blocked.push({ id, reason: 'Nœud introuvable.' }); continue; }
    if (n.status === 'rejected') continue;

    // Descente complète avant d'écrire quoi que ce soit : on veut savoir s'il
    // existe un descendant validé AVANT de rejeter le parent.
    const descendants: ReviewNode[] = [];
    const pile = [...(enfants.get(id) ?? [])];
    const vus = new Set<string>([id]);
    while (pile.length) {
      const e = pile.pop()!;
      if (vus.has(e.id)) continue;
      vus.add(e.id);
      descendants.push(e);
      pile.push(...(enfants.get(e.id) ?? []));
    }

    const valides = descendants.filter((d) => d.status === 'validated');
    if (valides.length) {
      const quoi = valides.length === 1 ? `1 ${KIND_LABEL[valides[0]!.kind]} validé` : `${valides.length} éléments validés`;
      blocked.push({
        id,
        reason: `Ce ${KIND_LABEL[n.kind]} porte ${quoi} · rejette-les d'abord, ou garde-le.`,
      });
      continue;
    }

    targets.add(id);
    for (const d of descendants) {
      if (d.status === 'proposed') cascaded.add(d.id);
    }
  }

  for (const t of targets) cascaded.delete(t);
  return { targets: [...targets, ...cascaded], cascaded: [...cascaded], blocked };
}

/**
 * Une phrase qui annonce ce que le lot va faire, AVANT de le faire.
 *
 * La propagation est la partie surprenante : un utilisateur qui coche trois
 * angles et voit disparaître douze concepts sans avertissement cesse d'utiliser
 * la sélection multiple.
 */
export function summarizeReview(plan: ReviewPlan, action: 'validate' | 'reject'): string {
  const direct = plan.targets.length - plan.cascaded.length;
  if (!plan.targets.length) {
    return plan.blocked.length
      ? `Rien à ${action === 'validate' ? 'valider' : 'rejeter'} · ${plan.blocked.length} demande(s) refusée(s).`
      : 'Rien à faire · la sélection est déjà dans cet état.';
  }

  const verbe = action === 'validate' ? 'validé(s)' : 'rejeté(s)';
  const parts = [`${direct} élément(s) ${verbe}`];
  if (plan.cascaded.length) {
    parts.push(action === 'validate'
      ? `${plan.cascaded.length} parent(s) validé(s) au passage · un élément validé sous un parent en attente n'aurait pas de sens`
      : `${plan.cascaded.length} descendant(s) rejeté(s) avec · ils n'ont plus de raison d'être`);
  }
  if (plan.blocked.length) parts.push(`${plan.blocked.length} refusé(s)`);
  return parts.join(' · ') + '.';
}
