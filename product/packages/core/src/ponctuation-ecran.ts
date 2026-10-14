/**
 * Ponctuation à l'écran · « Pas de tiret cadratin · utiliser « · » ».
 *
 * ── Pourquoi une règle, et pas un garde-fou global ───────────────────────────
 *
 * Les chaînes ÉCRITES par l'équipe sont tenues par une garde statique
 * (`apps/web/test/typographie-tiret.test.ts`). Les réponses d'un MODÈLE, elles,
 * arrivent à l'exécution · Jarvis écrit volontiers « — » en incise. On ne les
 * réécrit pas en aval par un observateur de tout le DOM (il toucherait aussi la
 * saisie de l'utilisateur, les prompts, les URL, les identifiants et le code) ·
 * on applique cette fonction, explicitement, là où l'écran AFFICHE de la prose
 * produite par un modèle et destinée à la lecture. Le texte stocké ne change pas.
 *
 * ── Ce qu'elle remplace, mesuré sur les vraies chaînes ───────────────────────
 *
 * Relevé du 14/10 sur les littéraux de `apps/web` (hors tests), avant correction :
 *
 *   | Glyphe | Emploi                               | Occurrences |
 *   | ------ | ------------------------------------ | ----------- |
 *   | —      | seul, « valeur absente » d'un tableau | 40          |
 *   | —      | incise espacée (« a — b »)           | 1           |
 *   | –      | intervalle collé (« F01–F24 », 1–25)  | 3           |
 *   | –      | incise espacée (« a – b »)           | 0           |
 *
 * D'où la décision · le tiret cadratin devient TOUJOURS « · » ; le tiret
 * demi-cadratin ne devient « · » que s'il est employé comme incise, c'est-à-dire
 * entouré d'espaces (ou en tête de ligne, en puce). Collé entre deux caractères,
 * c'est un intervalle (« 30–45 ans ») · il reste tel quel.
 *
 * ── Ce qu'elle ne touche jamais ──────────────────────────────────────────────
 *
 *  · un bloc de code (```…```, même non refermé pendant le flux) ;
 *  · du code en ligne (`…`) ;
 *  · un jeton technique · un mot sans espace qui porte « / », « \ », « @ »,
 *    « _ » ou « = » · URL (« :// »), adresse, chemin, identifiant, paramètre ;
 *  · un domaine nu (« www.… »).
 *
 * ── Les espaces ──────────────────────────────────────────────────────────────
 *
 * Les espaces qui entourent le tiret (normale, insécable, fine insécable, fine)
 * sont absorbés · en milieu de ligne il reste « a · b », en tête « · b », en fin
 * de ligne le tiret disparaît (« a »). Plusieurs tirets d'affilée, ou un tiret
 * collé à un « · » existant, ne font qu'un seul « · ». Jamais une ligne n'est
 * fusionnée avec la suivante.
 */

/** Ce qu'une case affiche quand la valeur manque (non communiqué). */
export const VALEUR_ABSENTE = 'n.c.';

/** Espaces horizontaux · normale, tabulation, insécable, fine insécable, fine. */
const H = '[ \\t\\u00A0\\u202F\\u2009]';

/**
 * Segments protégés, dans l'ordre où l'on tente de les reconnaître. Le premier
 * qui commence le plus tôt l'emporte (alternance d'expression régulière).
 */
const PROTEGE = new RegExp(
  [
    '```[\\s\\S]*?(?:```|$)', // bloc de code, refermé ou non (flux en cours)
    '`[^`\\n]*`', // code en ligne
    '\\bwww\\.[^\\s`]+', // domaine nu, sans « / »
    // Jeton technique · tout mot sans espace qui porte « / », « \ », « @ », « _ »
    // ou « = ». Couvre les URL (« :// »), mailto: (« @ »), chemins, identifiants,
    // paramètres de requête.
    '[^\\s`]*[\\/\\\\@_=][^\\s`]*',
  ].join('|'),
  'g',
);

/**
 * Un séparateur à remplacer · au moins un tiret cadratin, éventuellement collé
 * à d'autres tirets ou à des « · », avec les espaces horizontaux qui l'entourent.
 */
const CADRATIN = new RegExp(`${H}*(?:[·—]${H}*)*—(?:${H}*[·—])*${H}*`, 'g');

/** Le demi-cadratin d'incise · entouré d'espaces, ou en tête de ligne suivi d'un espace. */
const DEMI_INCISE = new RegExp(`(^|\\n)${H}*–${H}+|${H}+–${H}+`, 'g');
const ESPACE_EN_TETE = new RegExp(`^${H}`);

/** Remplace un séparateur selon sa place dans la ligne. */
function remplacer(segment: string, debutTexte: boolean, finTexte: boolean): string {
  const remplace = (m: string, offset: number, tout: string) => {
    const avant = offset === 0 ? (debutTexte ? '\n' : 'x') : tout[offset - 1]!;
    const apres = offset + m.length >= tout.length ? (finTexte ? '\n' : 'x') : tout[offset + m.length]!;
    const debutLigne = avant === '\n';
    const finLigne = apres === '\n';
    if (debutLigne && finLigne) return '';
    if (debutLigne) return '· ';
    if (finLigne) return '';
    return ' · ';
  };
  return segment
    .replace(CADRATIN, remplace)
    .replace(DEMI_INCISE, (m: string, saut: string | undefined, offset: number, tout: string) => {
      // Vraie tête de ligne · un saut, ou le début du texte entier.
      if (saut === '\n' || (saut === '' && debutTexte)) return `${saut}· `;
      // Début d'un segment qui suit du code ou une URL · ce n'est une incise
      // que si un espace la sépare de ce qui précède.
      if (saut === '') return ESPACE_EN_TETE.test(m) ? remplace(m, offset, tout) : m;
      return remplace(m, offset, tout);
    });
}

/**
 * Le texte, tirets d'incise remplacés par « · », code, URL et jetons techniques
 * intacts. Idempotente · l'appliquer deux fois ne change rien de plus.
 */
export function sansTiretCadratin(texte: string): string {
  if (!texte.includes('—') && !texte.includes('–')) return texte;
  let sortie = '';
  let curseur = 0;
  for (const m of texte.matchAll(PROTEGE)) {
    const i = m.index ?? 0;
    if (m[0].length === 0) continue;
    sortie += remplacer(texte.slice(curseur, i), curseur === 0, false) + m[0];
    curseur = i + m[0].length;
  }
  sortie += remplacer(texte.slice(curseur), curseur === 0, true);
  return sortie;
}

/**
 * Origines d'une proposition studio dont la prose (explication, raisons) est
 * ÉCRITE PAR UN MODÈLE. Une proposition `human` porte la saisie de
 * l'utilisateur · on ne la réécrit jamais. Une origine inconnue non plus.
 */
export const ORIGINES_MODELE: ReadonlySet<string> = new Set(['jarvis', 'agent']);

/** La prose telle qu'affichée · réécrite seulement si un modèle l'a écrite. */
export function proseAffichee(texte: string, origine: string): string {
  return ORIGINES_MODELE.has(origine) ? sansTiretCadratin(texte) : texte;
}
