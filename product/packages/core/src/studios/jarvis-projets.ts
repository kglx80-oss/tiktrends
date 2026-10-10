/**
 * Studios · ce que Jarvis sait des projets de la marque (une seule application).
 *
 * Pur : ni base, ni réseau, ni modèle. Le serveur lit les projets avec les
 * gardes de portée des écrans Studios (espace de la session, marques de
 * l'espace, restrictions par marque · `lib/studios/jarvis-projets.ts`), puis
 * CETTE règle décide de ce qui part dans la consigne de Jarvis.
 *
 * ── Pourquoi un bloc court ───────────────────────────────────────────────────
 *
 * Jarvis ne connaissait que « Studio IA » · il ne pouvait ni nommer un projet
 * en cours, ni dire où en est son brief, ni y renvoyer. Le bloc lui donne les
 * projets les plus récents, une ligne chacun, avec leur lien. Il reste BORNÉ
 * (nombre de projets, longueur d'un titre, d'une ligne, du bloc) : la consigne
 * paie chaque caractère à chaque tour, et la mémoire mesurée reste la matière
 * première de Jarvis.
 *
 * ── Ce qui n'y entre jamais ──────────────────────────────────────────────────
 *
 * Un projet d'un autre espace ou d'une autre marque que la marque active · même
 * si l'appelant le passait par erreur, il est écarté ICI (seconde barrière,
 * après la requête). Un identifiant qui n'a pas la forme d'un UUID ne fabrique
 * pas de lien. Un titre ne peut ni couper la consigne (retours à la ligne,
 * séparateur de blocs) ni imiter un marqueur `[[…]]`.
 */

export interface ProjetPourJarvis {
  id: string;
  workspaceId: string;
  brandId: string;
  titre: string;
  /** Libellé du type, tel que l'écran l'affiche (« Image », « Vidéo »…). */
  type: string;
  /** Libellé de l'étape, tel que la carte de projet l'affiche. */
  etape: string;
  /** Le premier manque (bloquant d'abord), s'il y en a un. */
  manque?: string | null;
  /** Dernière activité · ISO 8601. */
  majLe: string;
  /** Nombre de variantes · `null` = non disponible (rien n'est dit). */
  variantes?: number | null;
  /** Propositions de Jarvis en attente de décision · `null` = non disponible. */
  propositionsEnAttente?: number | null;
}

export interface PorteeResumeJarvis {
  workspaceId: string;
  brandId: string;
}

/**
 * Bornes du bloc. `projets` : cinq projets couvrent « ce sur quoi on travaille
 * cette semaine » sans transformer la consigne en inventaire · la liste
 * complète a son écran. Les longueurs sont des plafonds de sûreté, pas des
 * cibles · une ligne ordinaire en fait la moitié.
 */
export const BORNES_PROJETS_JARVIS = { projets: 5, titre: 80, ligne: 320, bloc: 1800 } as const;

export const TITRE_BLOC_PROJETS_JARVIS = 'PROJETS STUDIOS DE LA MARQUE';
export const LIEN_LISTE_PROJETS = '/studio/projets';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le lien d'un projet · `null` si l'identifiant n'a pas la forme attendue. */
export function lienProjetStudio(id: string): string | null {
  return UUID.test(id) ? `${LIEN_LISTE_PROJETS}/${id.toLowerCase()}` : null;
}

/** Une ligne, sans retour, sans marqueur, sans séparateur · coupée proprement. */
function nettoyer(texte: string, max: number): string {
  const plat = texte
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/-{3,}/g, '·')
    .replace(/[—–]/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
  const car = [...plat];
  return car.length <= max ? plat : `${car.slice(0, max - 1).join('').trimEnd()}…`;
}

function dateCourte(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(d.getUTCDate())}/${deux(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function compte(n: number | null | undefined, singulier: string, pluriel: string): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  const k = Math.trunc(n);
  return `${k} ${k > 1 ? pluriel : singulier}`;
}

function ligneProjet(p: ProjetPourJarvis, lien: string): string {
  const morceaux = [
    `« ${nettoyer(p.titre, BORNES_PROJETS_JARVIS.titre) || 'Sans titre'} »`,
    nettoyer(p.type, 30),
    `étape : ${nettoyer(p.etape, 60)}`,
    p.manque ? `manque : ${nettoyer(p.manque, 60)}` : null,
    (() => { const d = dateCourte(p.majLe); return d ? `dernière activité : ${d}` : null; })(),
    compte(p.variantes, 'variante', 'variantes'),
    compte(p.propositionsEnAttente, 'proposition en attente', 'propositions en attente'),
  ].filter((m): m is string => !!m);
  // Le lien est la fin de la ligne et n'est JAMAIS coupé · on raccourcit le reste.
  const fin = ` · ${lien}`;
  const tete = nettoyer(morceaux.join(' · '), BORNES_PROJETS_JARVIS.ligne - 2 - [...fin].length);
  return `- ${tete}${fin}`;
}

/**
 * Le bloc de consigne · vide (`''`) quand la marque n'a aucun projet visible,
 * pour que la consigne reste exactement celle d'avant.
 *
 * Ne garde que les projets de l'espace ET de la marque donnés, les trie du plus
 * récent au plus ancien, en garde au plus `BORNES_PROJETS_JARVIS.projets`, et
 * s'arrête avant de dépasser `BORNES_PROJETS_JARVIS.bloc`.
 */
export function resumerProjetsPourJarvis(projets: readonly ProjetPourJarvis[], portee: PorteeResumeJarvis): string {
  if (!portee.workspaceId || !portee.brandId) return '';
  const candidats = projets
    .filter((p) => p.workspaceId === portee.workspaceId && p.brandId === portee.brandId)
    .map((p) => ({ p, lien: lienProjetStudio(p.id), t: Date.parse(p.majLe) }))
    .filter((x): x is { p: ProjetPourJarvis; lien: string; t: number } => x.lien !== null)
    .sort((a, b) => (Number.isNaN(b.t) ? -Infinity : b.t) - (Number.isNaN(a.t) ? -Infinity : a.t));
  if (candidats.length === 0) return '';

  const entete = [
    TITRE_BLOC_PROJETS_JARVIS,
    'Les projets en cours dans les Studios, du plus récent au plus ancien. Quand la question touche l’un d’eux, nomme-le et donne son lien tel quel pour y renvoyer. N’invente aucun projet absent de cette liste, et ne dis pas qu’un projet avance si sa ligne ne le dit pas.',
  ].join('\n');
  const suite = `D’autres projets existent · liste complète : ${LIEN_LISTE_PROJETS}`;

  const lignes: string[] = [];
  let longueur = [...entete].length;
  for (const { p, lien } of candidats.slice(0, BORNES_PROJETS_JARVIS.projets)) {
    const l = ligneProjet(p, lien);
    // Place réservée pour la ligne « d'autres projets » si on doit s'arrêter.
    if (longueur + 1 + [...l].length + 1 + [...suite].length > BORNES_PROJETS_JARVIS.bloc) break;
    lignes.push(l);
    longueur += 1 + [...l].length;
  }
  if (lignes.length === 0) return '';
  const tronque = lignes.length < candidats.length;
  return [entete, ...lignes, ...(tronque ? [suite] : [])].join('\n');
}
