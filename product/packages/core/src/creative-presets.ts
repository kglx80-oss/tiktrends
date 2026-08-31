/**
 * Tes propres prompts, et ce qu'ils valent.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * Le Studio Pubs compose ses visuels à partir de huit « univers visuels » écrits
 * en dur, en anglais, par nous. On peut en CHOISIR un · jamais en écrire un.
 *
 * C'est une limite plus grave qu'elle n'en a l'air. La direction artistique
 * d'une marque n'est pas une option dans une liste de huit · et une agence qui
 * a mis des années à trouver sa manière de filmer ne va pas l'abandonner parce
 * que notre menu ne la contient pas. Partant de rien, le premier geste devrait
 * être « voici comment JE veux que ça ressemble », et il était impossible.
 *
 * ── Ce qu'on ajoute, et que le champ de texte libre ne donne pas ─────────────
 *
 * Un champ de texte libre existe déjà côté Studio Image. Il produit une image et
 * disparaît. Un preset, lui, est **nommé, réutilisable, et surtout mesuré** :
 * chaque créa qui en sort est rattachée à lui, donc on finit par savoir combien
 * de tests il a nourris et combien ont gagné.
 *
 * C'est là qu'est la vraie valeur, et c'est ce qu'un générateur d'images ne peut
 * pas faire : **ton prompt cesse d'être un goût pour devenir une hypothèse.**
 * « Mon univers sombre cinématique : 3 gagnantes sur 9 tests concluants » est une
 * phrase qu'aucun outil de génération ne sait dire.
 *
 * ── La prudence est la même que partout ailleurs ─────────────────────────────
 *
 * Un preset utilisé trois fois n'a rien prouvé. Le seuil est le même que pour les
 * dimensions de la mémoire · en dessous, on affiche l'usage, pas un taux.
 *
 * Pur : ni base, ni réseau.
 */

export type PresetKind = 'image' | 'video' | 'both';

export interface PresetInput {
  name: string;
  prompt: string;
  kind?: PresetKind;
  /** Ce qu'on ne veut jamais voir · certains moteurs le prennent, les autres l'ignorent. */
  negative?: string | null;
}

export interface PresetViolation { field: 'name' | 'prompt' | 'negative'; message: string }

export const NAME_MAX = 60;
export const PROMPT_MAX = 2000;
export const NEGATIVE_MAX = 500;

/**
 * Le prompt minimal en dessous duquel un preset ne dirige rien.
 *
 * « Beau » ou « pro » ne change pas une image · ça donne juste l'impression
 * d'avoir réglé quelque chose, ce qui est pire que de n'avoir rien réglé.
 */
export const PROMPT_MIN = 20;

export function validatePreset(p: PresetInput): PresetViolation[] {
  const v: PresetViolation[] = [];
  const nom = p.name?.trim() ?? '';
  const texte = p.prompt?.trim() ?? '';

  if (!nom) v.push({ field: 'name', message: 'Donne-lui un nom · c’est ce que tu reverras dans la liste.' });
  else if (nom.length > NAME_MAX) v.push({ field: 'name', message: `Nom trop long (${NAME_MAX} caractères maximum).` });

  if (!texte) {
    v.push({ field: 'prompt', message: 'Écris le prompt · c’est lui qui fait l’image.' });
  } else if (texte.length < PROMPT_MIN) {
    v.push({
      field: 'prompt',
      message: 'Trop court pour diriger quoi que ce soit · décris la lumière, le décor, le cadrage, l’ambiance. Un mot comme « beau » ne change rien à l’image.',
    });
  } else if (texte.length > PROMPT_MAX) {
    v.push({ field: 'prompt', message: `Prompt trop long (${PROMPT_MAX} caractères maximum) · au-delà, le modèle en perd la moitié.` });
  }

  if (p.negative && p.negative.length > NEGATIVE_MAX) {
    v.push({ field: 'negative', message: `Exclusions trop longues (${NEGATIVE_MAX} caractères maximum).` });
  }
  return v;
}

/** Nettoie avant écriture · une seule normalisation, au même endroit pour tout le monde. */
export function normalizePreset(p: PresetInput): PresetInput {
  return {
    name: p.name.trim().slice(0, NAME_MAX),
    prompt: p.prompt.trim().slice(0, PROMPT_MAX),
    kind: p.kind ?? 'both',
    negative: p.negative?.trim().slice(0, NEGATIVE_MAX) || null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Ce que vaut un preset                                                     */
/* -------------------------------------------------------------------------- */

/** En dessous, on montre l'usage et surtout pas un taux · même seuil que la mémoire. */
export const MIN_N_PRESET = 3;

export interface PresetUsageRow {
  presetId: string;
  /** Verdict arbitré de l'ad née de ce preset · `null` si elle n'a pas encore été jugée. */
  verdict: string | null;
}

export interface PresetPerformance {
  presetId: string;
  /** Créas générées avec ce preset, arbitrées ou non. */
  used: number;
  /** Tests dont le verdict tranche · les non concluants n'apprennent rien. */
  conclusive: number;
  winners: number;
  /** `null` tant que l'effectif ne permet pas d'en faire un taux. */
  hitRate: number | null;
  summary: string;
}

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);
const NON_CONCLUANTS = new Set(['inconclusive', 'insufficient_delivery']);

/**
 * Le bilan d'un preset.
 *
 * C'est le même calcul que pour n'importe quelle dimension de la mémoire, et
 * c'est voulu : un preset est une dimension comme une autre, simplement une que
 * l'utilisateur a écrite lui-même.
 */
export function presetPerformance(presetId: string, rows: PresetUsageRow[]): PresetPerformance {
  const miennes = rows.filter((r) => r.presetId === presetId);
  const juges = miennes.filter((r) => r.verdict && !NON_CONCLUANTS.has(r.verdict));
  const gagnantes = juges.filter((r) => GAGNANTS.has(r.verdict!)).length;

  const assez = juges.length >= MIN_N_PRESET;
  const taux = assez ? gagnantes / juges.length : null;

  return {
    presetId,
    used: miennes.length,
    conclusive: juges.length,
    winners: gagnantes,
    hitRate: taux,
    summary: resume(miennes.length, juges.length, gagnantes, taux),
  };
}

function resume(used: number, conclusive: number, winners: number, taux: number | null): string {
  if (used === 0) return 'Jamais utilisé.';
  if (conclusive === 0) {
    return `${used} créa(s) générée(s), aucun verdict encore · reviens quand elles auront été testées.`;
  }
  if (taux === null) {
    return `${conclusive} test(s) tranché(s) sur ${used} créa(s) · il en faut ${MIN_N_PRESET} pour en tirer un taux.`;
  }
  const pct = Math.round(taux * 100);
  if (winners === 0) {
    return `0 gagnante sur ${conclusive} tests tranchés · ce prompt n’a rien donné jusqu’ici.`;
  }
  return `${pct} % de réussite · ${winners} gagnante(s) sur ${conclusive} tests tranchés.`;
}

/* -------------------------------------------------------------------------- */
/*  L'ordre de la liste                                                       */
/* -------------------------------------------------------------------------- */

/** Ce qu'il faut d'une scène pour la classer · l'écran en sait plus, pas ici. */
export interface ScenePerf {
  id: string;
  name: string;
  performance: PresetPerformance | null;
}

/**
 * L'ordre de la liste des scènes.
 *
 * ── Pourquoi ce n'est pas l'ordre alphabétique ───────────────────────────────
 *
 * On a mesuré ce que vaut chaque scène, puis on les a présentées par nom · la
 * mesure existait et personne ne la regardait. Un classement par nom demande de
 * lire douze bilans pour trouver le bon ; un classement par bilan le met en
 * premier.
 *
 * ── Trois rangs, et le dernier est le point ──────────────────────────────────
 *
 * 1. Ce qui a gagné, du meilleur au moins bon.
 * 2. Ce qu'on ne sait pas encore · le neuf n'est pas coupable.
 * 3. Ce qui a perdu avec assez de tests pour le savoir.
 *
 * **On ne cache rien**, on ordonne. Retirer une scène perdante de la liste
 * priverait de la seule chose qu'elle apprend encore : qu'elle a été essayée.
 */
export function rankScenes<T extends ScenePerf>(scenes: T[]): T[] {
  const rang = (s: T): number => {
    const p = s.performance;
    if (!p || p.hitRate === null) return 1;   // inconnu
    return p.hitRate > 0 ? 0 : 2;             // gagnant · perdant avéré
  };

  return [...scenes].sort((a, b) => {
    const ra = rang(a), rb = rang(b);
    if (ra !== rb) return ra - rb;

    // Dans le rang « gagnant », le meilleur taux passe devant · à taux égal,
    // celui qui a le plus de tests derrière lui, parce qu'il est plus sûr.
    if (ra === 0) {
      const ta = a.performance!.hitRate!, tb = b.performance!.hitRate!;
      if (ta !== tb) return tb - ta;
      return b.performance!.conclusive - a.performance!.conclusive;
    }
    return a.name.localeCompare(b.name, 'fr');
  });
}

/**
 * Ce qu'on dit quand une scène est choisie.
 *
 * ── La règle : on ne parle que si on a mieux à proposer ──────────────────────
 *
 * Une phrase affichée à chaque choix devient un bruit qu'on cesse de lire au
 * bout de trois jours. Elle n'apparaît donc que dans deux cas :
 *
 * - la scène choisie a perdu avec assez de tests pour l'affirmer ;
 * - une autre scène a gagné et celle-ci n'a rien prouvé.
 *
 * Quand la scène choisie est déjà la meilleure, on se tait · le félicitations
 * n'apprend rien et use le crédit de la phrase suivante.
 *
 * **Elle informe, elle n'interdit pas** · un concept neuf a par construction un
 * profil qu'on ne connaît pas, et c'est souvent lui qui ouvre quelque chose.
 */
export function sceneAdvice(currentId: string | null, scenes: ScenePerf[]): string | null {
  if (!currentId) return null;
  const courante = scenes.find((s) => s.id === currentId);
  if (!courante) return null;

  const p = courante.performance;

  // Perdante avérée · c'est le cas le plus utile, il passe en premier.
  if (p && p.hitRate === 0 && p.conclusive >= MIN_N_PRESET) {
    return `« ${courante.name} » n’a rien donné sur ${p.conclusive} tests tranchés · relis-la avant de repartir dessus.`;
  }

  const meilleure = rankScenes(scenes).find(
    (s) => s.id !== currentId && s.performance && s.performance.hitRate !== null && s.performance.hitRate > 0,
  );
  if (!meilleure) return null;

  const m = meilleure.performance!;
  const gagnee = `${m.winners} gagnante${m.winners > 1 ? 's' : ''} sur ${m.conclusive} tests tranchés`;

  if (!p || p.hitRate === null) {
    return `« ${meilleure.name} » a fait ${gagnee}. Celle-ci n’a pas encore de bilan · ce n’est pas une raison de renoncer, c’en est une de le savoir.`;
  }
  if (p.hitRate < m.hitRate!) {
    return `« ${meilleure.name} » fait mieux · ${gagnee}, contre ${p.winners} sur ${p.conclusive} ici.`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Composition du prompt final                                               */
/* -------------------------------------------------------------------------- */

/**
 * Assemble le prompt envoyé au moteur d'image.
 *
 * L'univers de l'utilisateur passe APRÈS la scène décrite par le concept, et
 * c'est délibéré : le concept dit CE QU'ON MONTRE, le preset dit COMMENT ça
 * doit ressembler. Inverser ferait dériver le sujet vers le style, et on
 * obtiendrait de belles images qui ne racontent plus la publicité.
 *
 * Les exclusions ferment le prompt · un moteur qui les ignore n'est pas gêné,
 * un moteur qui les lit les retient mieux en fin de consigne.
 */
export function composePrompt(scene: string, preset?: { prompt: string; negative?: string | null } | null): string {
  if (!preset?.prompt?.trim()) return scene;
  const bouts = [scene.trim(), preset.prompt.trim()];
  if (preset.negative?.trim()) bouts.push(`Avoid: ${preset.negative.trim()}`);
  return bouts.join('\n\n');
}
