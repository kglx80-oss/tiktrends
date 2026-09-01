/**
 * Ce qu'on rejoue, et ce qu'on ne rejoue pas.
 *
 * ── Ce que ça coûtait ────────────────────────────────────────────────────────
 *
 * Chaque scène tentait deux fois, chaque tentative pouvant aller jusqu'à
 * quatre-vingt-dix secondes. Une série de douze pubs dont la demande est
 * fautive faisait donc attendre plus de dix minutes avant de rendre un message
 * qui n'expliquait rien.
 *
 * ── La distinction ───────────────────────────────────────────────────────────
 *
 * Un `4xx` porte sur la DEMANDE — modèle inconnu, paramètre refusé, référence
 * illisible. La seconde tentative envoie la même demande, donc reçoit la même
 * réponse. Les délais et les `5xx` portent sur le MOMENT · eux méritent leur
 * seconde chance.
 *
 * Vit ici et pas dans le `catch` de l'action · un fichier `'use server'` ne peut
 * exporter que des fonctions async, donc une règle qui y reste ne se teste pas.
 */
export function refusDefinitif(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  // Les bornes de mot évitent de prendre « 1080x1350 » pour un code d'erreur ·
  // nos propres messages sont pleins de dimensions.
  return /\b4\d\d\b/.test(m);
}
