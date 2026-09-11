import { verdictDefauts, plafonner } from './scene-defects';

/**
 * La note affichable d'un visuel, lue depuis un score de créa.
 *
 * Le studio Image n'avait aucune relecture automatique · on réutilise le « score
 * Jarvis » (qui sait regarder l'image) et on le lit ici comme une NOTE pour
 * l'écran. Deux règles déjà éprouvées font le travail · `verdictDefauts` dit si
 * un raté condamne la scène, `plafonner` refuse de laisser passer une bonne note
 * au-dessus d'un raté rédhibitoire. On ne réinvente rien · on compose.
 *
 * `null` quand le modèle n'a pas VU l'image · une note à l'aveugle serait une
 * invention affichée comme un constat.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */
export interface NoteImage {
  /** Score 0-100, plafonné par les ratés rédhibitoires. */
  note: number;
  /** Au moins un raté condamne le visuel. */
  grave: boolean;
  /** Ratés de fabrication nommés (vocabulaire fermé). */
  defauts: string[];
  /** Le verdict du modèle, en une phrase. */
  verdict: string;
  /** Ce qu'on dit des ratés · vide quand le visuel est sain. */
  resume: string;
}

export function noteImage(s: { score: number; defauts: readonly unknown[]; verdict?: string; vu: boolean } | null | undefined): NoteImage | null {
  if (!s || !s.vu) return null;
  const vd = verdictDefauts(s.defauts);
  return {
    note: plafonner(s.score, vd.grave),
    grave: vd.grave,
    defauts: vd.defauts,
    verdict: (s.verdict || '').replace(/[—–]/g, ',').trim(),
    resume: vd.resume,
  };
}
