/**
 * Quelle publicité montrer pour représenter une direction artistique.
 *
 * ── Ce que la vignette promet ────────────────────────────────────────────────
 *
 * Choisir « Éditorial » ou « Preuve » sur un libellé, c'est choisir au hasard
 * avec une étiquette. La vignette existe pour répondre à « qu'est-ce que ça
 * donne, ici, sur MON produit » · c'est pour ça qu'on montre une vraie créa de
 * la marque plutôt qu'une image de démonstration.
 *
 * ── Pourquoi pas simplement la plus récente ──────────────────────────────────
 *
 * C'était la règle d'avant, et elle se défendait : montrer une vieille créa
 * donne une idée périmée de la direction artistique de la marque.
 *
 * Mais la vignette ne sert pas à raconter l'historique · elle sert à DÉCIDER.
 * Ce qu'on veut savoir, c'est ce que cette direction sait faire de mieux, parce
 * que c'est ce qu'on obtiendra en la choisissant. La plus récente peut être un
 * raté, et un raté en vignette fait écarter une direction qui marche.
 *
 * ── Un raté ne représente rien ───────────────────────────────────────────────
 *
 * Une publicité au produit déformé, ou dont l'accroche a été réécrite, ne
 * représente pas sa direction · elle représente une génération manquée. On les
 * écarte toutes.
 *
 * Quand une direction n'a produit QUE des ratés, elle n'a pas de vignette. Ce
 * n'est pas un oubli · c'est plus honnête que d'élire le moins mauvais et de le
 * présenter comme un exemple.
 *
 * Pur : ni base, ni réseau, ni image.
 */

export interface CandidatExemple {
  /** L'identifiant de la publicité · c'est ce qu'on rend. */
  id: string;
  /** La note Jarvis, quand elle a été demandée. */
  score?: number | null;
  /** Un raté de fabrication grave, ou une accroche réécrite. */
  grave?: boolean;
  /** Plus c'est grand, plus c'est récent · départage à note égale. */
  rang: number;
}

/**
 * La publicité qui représente le mieux sa direction · `null` s'il n'y en a pas.
 *
 * Ordre de décision, et chacun a sa raison :
 *
 * 1. **Les ratés sortent.** Ils ne représentent pas la direction.
 * 2. **La meilleure note gagne** · c'est ce que la direction sait faire.
 * 3. **À note égale, la plus récente** · elle reflète la marque d'aujourd'hui.
 * 4. **Une note absente ne vaut pas zéro.** Toutes les créas ne sont pas
 *    notées : les traiter comme nulles ferait gagner systématiquement celles
 *    qu'on a pris la peine d'analyser, ce qui mesure notre attention, pas la
 *    direction. Une créa notée passe devant une créa non notée · entre deux
 *    non notées, la plus récente.
 */
export function meilleurExemple(candidats: readonly CandidatExemple[]): CandidatExemple | null {
  const sains = candidats.filter((c) => !c.grave);
  if (!sains.length) return null;

  const notes = sains.filter((c) => typeof c.score === 'number');
  if (notes.length) {
    return notes.reduce((a, b) => {
      if (b.score! !== a.score!) return b.score! > a.score! ? b : a;
      return b.rang > a.rang ? b : a;
    });
  }
  return sains.reduce((a, b) => (b.rang > a.rang ? b : a));
}

/**
 * Un exemple par direction · les clés absentes n'ont rien à montrer.
 *
 * On ne se rabat jamais sur la créa d'une AUTRE direction · une vignette
 * attribuée à la mauvaise direction vendrait une ambiance pour une autre, et
 * c'est le seul mensonge que cet écran puisse commettre.
 */
export function exemplesParDirection(
  candidats: readonly (CandidatExemple & { direction: string | null | undefined })[],
): Record<string, CandidatExemple> {
  const paquets = new Map<string, CandidatExemple[]>();
  for (const c of candidats) {
    const d = (c.direction ?? '').trim();
    if (!d) continue;
    const liste = paquets.get(d) ?? [];
    liste.push(c);
    paquets.set(d, liste);
  }
  const out: Record<string, CandidatExemple> = {};
  for (const [d, liste] of paquets) {
    const gagnant = meilleurExemple(liste);
    if (gagnant) out[d] = gagnant;
  }
  return out;
}
