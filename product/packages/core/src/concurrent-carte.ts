/**
 * De quoi dessiner une carte de concurrent · sans réseau, sans deviner faux.
 *
 * ── Le problème ──────────────────────────────────────────────────────────────
 *
 * Un concurrent est saisi en texte libre · parfois un nom (« HVMN »), parfois un
 * domaine (« hvmn.com »), parfois une URL entière. La liste les affichait tous
 * pareil, en pastille d'initiales grise. On veut une carte plus lisible : une
 * favicon quand un domaine est là (l'aperçu le moins cher du site), un domaine
 * cliquable, et à défaut un avatar teinté distinct par marque.
 *
 * ── Ce que ce module décide, et ce qu'il ne fait pas ──────────────────────────
 *
 * Il EXTRAIT un domaine seulement quand la saisie en contient vraiment un · un
 * nom sans point ne devient jamais un faux domaine (« nike » ≠ « nike.com »). Il
 * donne des initiales et une teinte déterministe par nom. Il ne construit aucune
 * URL de service ni aucun `<img>` · c'est l'affaire du composant. Pur, testable.
 */

/**
 * Le domaine contenu dans une saisie de concurrent, ou `null`.
 *
 * On n'invente rien : sans point, ce n'est pas un domaine, c'est un nom. On
 * retire le protocole, le chemin, le `www.`, et on n'accepte que ce qui a la
 * forme d'un hôte (au moins un point, un TLD d'au moins deux lettres).
 */
export function domaineConcurrent(saisie: string): string | null {
  let t = saisie.trim().toLowerCase();
  if (!t) return null;
  t = t.replace(/^https?:\/\//, '');
  t = t.split('/')[0]!.split('?')[0]!.split('#')[0]!;
  t = t.replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) ? t : null;
}

/**
 * Les initiales d'un concurrent · l'initiale des deux premiers mots, ou les deux
 * premières lettres d'un mot unique. Toujours en majuscules, jamais vide sur une
 * saisie non vide.
 *
 * ── Le bug que ça répare ─────────────────────────────────────────────────────
 *
 * Un nom comme « HVMN (Nootropics) » ou « Feel (compléments France) » donnait
 * « H( » / « F( » · l'initiale prenait le premier caractère du deuxième « mot »,
 * qui était une parenthèse. On retire d'abord les groupes entre parenthèses (un
 * qualificatif, pas le nom), puis toute ponctuation de tête de chaque mot.
 */
export function initialesConcurrent(nom: string): string {
  const mots = nom
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .split(/\s+/)
    .map((m) => m.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  if (mots.length === 0) {
    // Que de la ponctuation, ou vide · on récupère les lettres/chiffres restants.
    const brut = nom.replace(/[^\p{L}\p{N}]/gu, '');
    return brut ? brut.slice(0, 2).toUpperCase() : '?';
  }
  if (mots.length === 1) return mots[0]!.slice(0, 2).toUpperCase();
  return (mots[0]![0]! + mots[1]![0]!).toUpperCase();
}

export interface TinteConcurrent {
  /** Teinte de départ du dégradé (HSL). */
  de: string;
  /** Teinte d'arrivée du dégradé (HSL). */
  vers: string;
}

/**
 * Une teinte déterministe par nom · deux concurrents voisins n'ont pas la même
 * couleur, et le même nom garde la sienne d'une visite à l'autre. C'est ce qui
 * fait une grille de cartes distinctes plutôt qu'un mur gris uniforme.
 */
export function tinteConcurrent(nom: string): TinteConcurrent {
  // Mélange 32 bits (Math.imul) puis réduction modulo 360 · un hash trop simple
  // regroupait les noms courts dans une seule bande de teintes. On veut couvrir
  // toute la roue pour que la grille soit franchement colorée, pas monochrome.
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (Math.imul(h, 31) + nom.charCodeAt(i)) | 0;
  const base = ((h % 360) + 360) % 360;
  const h2 = (base + 34) % 360;
  return { de: `hsl(${base} 42% 26%)`, vers: `hsl(${h2} 48% 40%)` };
}
