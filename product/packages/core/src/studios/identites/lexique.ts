/**
 * Studios · L6-B · lexique fermé des couleurs et découpage d'un texte de plan.
 *
 * Pur. Un contrôle de contradiction ne s'appuie que sur ce qu'il sait lire :
 * une liste FERMÉE de couleurs françaises, chacune avec ses formes accordées
 * (genre, nombre). Une couleur hors liste n'est ni devinée ni comparée ; la
 * fiche d'identité refuse d'ailleurs de l'enregistrer (le contrôle serait
 * aveugle sur elle).
 */

export type Genre = 'm' | 'f';
export type Nombre = 's' | 'p';

export interface FormeCouleur {
  forme: string;
  canon: string;
  /** `null` = forme épicène (jaune, rouge…) ou invariable. */
  genre: Genre | null;
  nombre: Nombre | null;
}

/** canon → [ms, fs, mp, fp] · une case vide reprend la forme précédente (épicène, invariable). */
const TABLE: ReadonlyArray<readonly [string, string, string, string]> = [
  ['vert', 'verte', 'verts', 'vertes'],
  ['jaune', '', 'jaunes', ''],
  ['rouge', '', 'rouges', ''],
  ['bleu', 'bleue', 'bleus', 'bleues'],
  ['noir', 'noire', 'noirs', 'noires'],
  ['blanc', 'blanche', 'blancs', 'blanches'],
  ['gris', 'grise', '', 'grises'],
  ['rose', '', 'roses', ''],
  ['orange', '', 'oranges', ''],
  ['violet', 'violette', 'violets', 'violettes'],
  ['marron', '', 'marrons', ''],
  ['beige', '', 'beiges', ''],
  ['turquoise', '', 'turquoises', ''],
  ['kaki', '', '', ''],
  ['bordeaux', '', '', ''],
  ['blond', 'blonde', 'blonds', 'blondes'],
  ['brun', 'brune', 'bruns', 'brunes'],
  ['roux', 'rousse', '', 'rousses'],
  ['châtain', 'châtaine', 'châtains', 'châtaines'],
  ['doré', 'dorée', 'dorés', 'dorées'],
  ['argenté', 'argentée', 'argentés', 'argentées'],
];

/** Sans accents, en minuscules · la comparaison ne dépend ni de la casse ni des diacritiques. */
export function normaliser(x: string): string {
  return x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function construire(): FormeCouleur[] {
  const out: FormeCouleur[] = [];
  for (const [ms, fsBrut, mpBrut, fpBrut] of TABLE) {
    const fs = fsBrut || ms;
    const mp = mpBrut || ms;
    const fp = fpBrut || (fsBrut ? `${fs}s` : mp);
    const canon = ms;
    const cases: Array<[string, Genre, Nombre]> = [[ms, 'm', 's'], [fs, 'f', 's'], [mp, 'm', 'p'], [fp, 'f', 'p']];
    const parForme = new Map<string, { genres: Set<Genre>; nombres: Set<Nombre> }>();
    for (const [f, g, n] of cases) {
      const e = parForme.get(f) ?? { genres: new Set<Genre>(), nombres: new Set<Nombre>() };
      e.genres.add(g); e.nombres.add(n);
      parForme.set(f, e);
    }
    for (const [forme, e] of parForme) {
      out.push({ forme, canon, genre: e.genres.size === 1 ? [...e.genres][0]! : null, nombre: e.nombres.size === 1 ? [...e.nombres][0]! : null });
    }
  }
  return out;
}

export const FORMES_COULEUR: readonly FormeCouleur[] = construire();
const PAR_NORME = new Map(FORMES_COULEUR.map((f) => [normaliser(f.forme), f]));

/** Toutes les formes reconnues, dans l'ordre du tableau (pour la liste proposée à l'écran). */
export const LISTE_FORMES_COULEUR: readonly string[] = FORMES_COULEUR.map((f) => f.forme);

export function lireCouleur(mot: string): FormeCouleur | null {
  return PAR_NORME.get(normaliser(mot.trim())) ?? null;
}

/**
 * La forme de `canon` accordée au genre et au nombre voulus · une case absente
 * (épicène, invariable) reprend la forme qui couvre ce genre ou ce nombre.
 */
export function accorder(canon: string, genre: Genre | null, nombre: Nombre | null): string {
  const formes = FORMES_COULEUR.filter((f) => f.canon === canon);
  const score = (f: FormeCouleur) => (genre && f.genre === genre ? 2 : f.genre === null ? 1 : 0) + (nombre && f.nombre === nombre ? 2 : f.nombre === null ? 1 : 0);
  return [...formes].sort((a, b) => score(b) - score(a))[0]?.forme ?? canon;
}

/* ───────────────────────────── Découpage ────────────────────────────────── */

export interface Jeton {
  brut: string;
  norme: string;
  debut: number;
  fin: number;
  /** Rang de la proposition · une ponctuation ouvre la suivante. */
  clause: number;
}

const RE_JETON = /[\p{L}\p{N}]+|[.,;:!?()«»"\n…]/gu;

export function decouper(texte: string): Jeton[] {
  const out: Jeton[] = [];
  let clause = 0;
  for (const m of texte.matchAll(RE_JETON)) {
    const brut = m[0];
    if (!/[\p{L}\p{N}]/u.test(brut)) { clause += 1; continue; }
    out.push({ brut, norme: normaliser(brut), debut: m.index!, fin: m.index! + brut.length, clause });
  }
  return out;
}

/** Singulier approximatif d'un nom (vestes → veste, chapeaux → chapeau) · pour comparer un élément. */
export function radical(mot: string): string {
  const n = normaliser(mot);
  if (n.length > 3 && (n.endsWith('s') || n.endsWith('x'))) return n.slice(0, -1);
  return n;
}
