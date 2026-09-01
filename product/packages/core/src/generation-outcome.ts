/**
 * Ce qu'on dit après avoir cliqué sur « Générer ».
 *
 * ── Le silence était un état possible ────────────────────────────────────────
 *
 * L'écran traitait le retour d'une génération en trois branches : une erreur, un
 * lot incomplet, ou rien. La troisième s'écrivait `setNotice('')` · c'est-à-dire
 * qu'un lot vide sans message d'erreur effaçait le dernier message et
 * n'affichait rien du tout.
 *
 * De l'autre côté de l'écran, ça donne exactement ce qui a été rapporté : on
 * clique, on attend, aucune image n'apparaît, et rien ne dit pourquoi. Le
 * produit a l'air cassé alors qu'il a peut-être simplement échoué à le dire.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 * **Zéro image produite est toujours quelque chose à dire.** Un retour sans
 * erreur ET sans créa n'est pas un succès silencieux : c'est un échec dont on a
 * perdu la cause, et le taire est la pire des deux options.
 *
 * Le type le garantit : `done` est le seul cas sans message, et il exige `got`
 * strictement positif.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface GenerationReply {
  /** Message d'erreur renvoyé par le serveur, s'il y en a un. */
  error?: string;
  /** Combien de créas sont réellement revenues. */
  got: number;
  /** Combien on en avait demandé · absent quand l'appel n'a pas été jusque-là. */
  requested?: number;
}

export type Outcome =
  | { kind: 'error'; message: string }
  | { kind: 'partial'; got: number; requested: number; message: string }
  | { kind: 'done'; got: number };

/** Un lot vide sans cause connue · le message doit rester diagnosticable. */
const RIEN = 'Aucune pub n’a été produite, et le service n’a pas dit pourquoi. '
  + 'Relance : tu n’es débité que des pubs réussies.';

export function generationOutcome(r: GenerationReply): Outcome {
  if (r.error) return { kind: 'error', message: r.error };

  // L'ordre compte : on teste le vide AVANT le partiel. Un lot de 0 sur 4 est
  // un échec, pas un « 0/4 généré » présenté comme un demi-succès.
  if (r.got <= 0) return { kind: 'error', message: RIEN };

  if (r.requested && r.got < r.requested) {
    return {
      kind: 'partial', got: r.got, requested: r.requested,
      message: `${r.got}/${r.requested} pubs générées. Certaines scènes ont échoué `
        + '(souvent un pic de charge du modèle). Relance pour compléter : tu n’es '
        + 'débité que des pubs réussies.',
    };
  }

  return { kind: 'done', got: r.got };
}

/** Vrai quand le lot a donné quelque chose · c'est ce qui autorise à refermer une fenêtre. */
export function producedSomething(o: Outcome): boolean {
  return o.kind !== 'error';
}
