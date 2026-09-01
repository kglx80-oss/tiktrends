/**
 * Fusionner deux personas.
 *
 * ── Le trou qu'on avait laissé ───────────────────────────────────────────────
 *
 * Le tri permet d'accepter, de refuser et de renommer. Il ne permettait pas de
 * rapprocher deux personas · or les passerelles en créent un nommé
 * « À qualifier » chaque fois qu'aucun n'est fourni, et rien ne les empêche de
 * se multiplier à trois semaines d'écart.
 *
 * Renommer les deux ne les rapproche pas · ça donne deux personas au même nom,
 * ce qui est pire : la carte prétend alors distinguer ce qu'elle confond.
 *
 * ── Ce qui rend une fusion dangereuse ────────────────────────────────────────
 *
 * Les désirs pendent au persona, les angles aux désirs, les concepts aux angles,
 * les tests aux concepts. Déplacer un persona sans y penser détache une branche
 * entière, et une branche détachée emporte des tests payés.
 *
 * Le plan est donc calculé AVANT d'écrire, et montré. Deux cas :
 *
 * - **déplacement** · le désir n'existe pas chez la cible, il change de parent ;
 * - **repli** · un désir du même nom existe déjà, ses angles rejoignent celui de
 *   la cible et le doublon disparaît.
 *
 * Sans le repli, fusionner deux « À qualifier » donnerait deux désirs « À
 * qualifier » sous le même persona · on aurait déplacé le problème d'un cran.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface MergeDesire {
  id: string;
  label: string;
  /** Ce qui pend dessous · sert à dire ce que le repli emporte. */
  angles: number;
  /** Tests déjà lancés sous ce désir · le seul chiffre qui change la nature du geste. */
  tested: number;
}

export interface MergePersona {
  id: string;
  name: string;
  desires: MergeDesire[];
}

export interface MergeMove { desireId: string; label: string }
export interface MergeFold { fromDesireId: string; intoDesireId: string; label: string; angles: number }

export interface MergePlan {
  ok: boolean;
  /** Désirs qui changent simplement de parent. */
  moves: MergeMove[];
  /** Désirs qui se replient sur un homonyme de la cible. */
  folds: MergeFold[];
  /** Ce qu'on dit avant d'écrire · toujours au moins une ligne quand `ok`. */
  notes: string[];
  /** Pourquoi la fusion est refusée · `null` quand elle est possible. */
  blocked: string | null;
}

/**
 * Rapproche deux libellés pour les comparer.
 *
 * Accents et casse ne distinguent pas deux désirs · « Économiser » et
 * « economiser » sont le même, et les laisser cohabiter recréerait exactement le
 * doublon qu'on vient de supprimer.
 */
function clef(label: string): string {
  return label
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Ce que la fusion fera, avant de le faire.
 *
 * `source` disparaît (archivée), `target` reçoit. Rien n'est supprimé
 * physiquement · un persona effacé emporterait l'historique de ce qui a été
 * choisi le jour où les créas ont été générées.
 */
export function planMerge(source: MergePersona, target: MergePersona): MergePlan {
  if (source.id === target.id) {
    return { ok: false, moves: [], folds: [], notes: [], blocked: 'Un persona ne se fusionne pas avec lui-même.' };
  }

  const parClef = new Map(target.desires.map((d) => [clef(d.label), d]));
  const moves: MergeMove[] = [];
  const folds: MergeFold[] = [];

  for (const d of source.desires) {
    const jumeau = parClef.get(clef(d.label));
    if (jumeau) folds.push({ fromDesireId: d.id, intoDesireId: jumeau.id, label: d.label, angles: d.angles });
    else moves.push({ desireId: d.id, label: d.label });
  }

  const notes: string[] = [];
  notes.push(
    `« ${source.name} » sera archivé et ses ${source.desires.length} désir(s) rejoindront « ${target.name} ».`,
  );
  if (folds.length) {
    const anglesReplies = folds.reduce((s, f) => s + f.angles, 0);
    notes.push(
      `${folds.length} désir(s) portent déjà le même nom chez la cible · leurs ${anglesReplies} angle(s) s'y replient, `
      + 'sinon on aurait deux désirs identiques sous un seul persona.',
    );
  }
  const testes = source.desires.reduce((s, d) => s + d.tested, 0);
  if (testes > 0) {
    notes.push(`${testes} test(s) pendent sous cette branche · ils suivent, aucun n’est perdu.`);
  }

  return { ok: true, moves, folds, notes, blocked: null };
}

/** Un persona sans rien dessous se fusionne sans conséquence · on le dit. */
export function isTrivialMerge(plan: MergePlan): boolean {
  return plan.ok && plan.moves.length === 0 && plan.folds.length === 0;
}
