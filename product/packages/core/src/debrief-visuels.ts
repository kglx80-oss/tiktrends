/**
 * Ce que ce lot de visuels vaut, dit d'un coup.
 *
 * Le studio Image empilait les visuels sans jamais dire « sur ces N, combien tu
 * gardes ». Chaque visuel porte une note (retenu / écarté) posée à la main · on
 * l'agrège en une phrase, comme le débrief d'un lot de pubs, mais sur le seul
 * signal disponible ici · le jugement de la personne.
 *
 * On COMPTE, on ne conclut pas · un lot ne tranche pas un moteur (trop peu de
 * visuels, aucun intervalle ne tiendrait). Et le silence est une réponse · rien
 * de noté ⇒ `null`, pas « 0 retenu » qui se lirait comme un échec là où il n'y a
 * eu aucun jugement.
 *
 * Le scoring automatique (analyse du visuel par le modèle) est un autre chantier ·
 * ici on n'invente pas une note qu'on n'a pas.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

export type NoteVisuel = 'up' | 'down' | null;

export interface DebriefVisuels {
  /** Visuels jugés (retenus + écartés) · le dénominateur honnête. */
  n: number;
  retenus: number;
  ecartes: number;
  /** Tous les visuels jugés sont retenus · aucun écarté. */
  toutBon: boolean;
  resume: string;
}

const s = (k: number) => (k > 1 ? 's' : '');

export function debriefVisuels(notes: readonly NoteVisuel[]): DebriefVisuels | null {
  const retenus = notes.filter((r) => r === 'up').length;
  const ecartes = notes.filter((r) => r === 'down').length;
  const n = retenus + ecartes;
  if (!n) return null; // rien de jugé · le silence est une réponse

  const toutBon = ecartes === 0;
  const resume = toutBon
    ? `${n} visuel${s(n)} jugé${s(n)} · ${retenus === n ? 'tous retenus' : `${retenus} retenu${s(retenus)}`}.`
    : `${n} visuel${s(n)} jugé${s(n)} · ${retenus} retenu${s(retenus)}, ${ecartes} écarté${s(ecartes)}.`;

  return { n, retenus, ecartes, toutBon, resume };
}
