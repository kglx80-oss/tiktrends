/**
 * Marque · modifier un persona, son rang et son segment (lot 9 V5 · VB P05, P11, P12).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Ce que la règle dit ──────────────────────────────────────────────────────
 *
 *  · `validerPersona` · la saisie d'une modification, validée AVANT toute
 *    écriture · un nom (réservé exclu), une description, un segment, des listes
 *    bornées (désirs, freins, objections, un élément par ligne), un rang. Une
 *    saisie invalide ne touche à rien et dit pourquoi, champ par champ.
 *  · `rangsApres` · le rang d'un persona change · les autres se décalent pour
 *    que les rangs restent 1, 2, 3… sans trou ni doublon. « Sans rang » retire
 *    le persona du classement, les suivants remontent. Les personas sans rang
 *    gardent `null`.
 *  · `ordonnerPersonas` · l'ordre de lecture PARTOUT (fiche, sélecteur « Pour
 *    qui ? » du brief) · les personas classés d'abord, par rang, puis les
 *    autres, par nom.
 *
 * Le persona est la ligne `personas` (le modèle « Avatar » d'Adsmap, décision
 * D2 · il n'y a qu'une table). Le rang et le segment sont deux colonnes de
 * cette ligne (migration 0071, additive, NULL partout à son passage).
 */

export const NOM_PERSONA_MAX = 80;
export const DESCRIPTION_PERSONA_MAX = 600;
export const SEGMENT_PERSONA_MAX = 60;
/** Un désir, un frein, une objection · une ligne. */
export const ELEMENT_PERSONA_MAX = 160;
/** Lignes gardées par liste · au-delà, la saisie est refusée (jamais tronquée en silence). */
export const ELEMENTS_PERSONA_MAX = 12;
/** Le rang le plus grand qu'une saisie peut demander · le serveur le ramène au nombre de personas classés. */
export const RANG_PERSONA_MAX = 50;
/**
 * Le nom du persona PROVISOIRE que les Studios créent en rattachant une créa à
 * la carte (`lib/adsmap-path.ts`, `lib/studios/variantes/tests.ts`). Il ne dit
 * rien de la cible · un vrai persona ne peut pas le prendre.
 */
export const NOM_PERSONA_PROVISOIRE = 'À qualifier';

/** Le refus d'un persona hors de la marque (autre marque, autre espace, inconnu) · une seule phrase, rien ne fuit. */
export const REFUS_PERSONA_INTROUVABLE = 'Ce persona n’existe pas dans cette marque.';

export interface PersonaValide {
  nom: string;
  description: string | null;
  segment: string | null;
  desirs: string[];
  freins: string[];
  objections: string[];
  rang: number | null;
}

export type ChampPersona = 'nom' | 'description' | 'segment' | 'desirs' | 'freins' | 'objections' | 'rang';
export type ValidationPersona = { ok: true; persona: PersonaValide } | { ok: false; erreurs: Array<{ champ: ChampPersona; raison: string }> };

const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]+/g;
const ligne = (v: string) => v.replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim();

/** Une liste saisie · un tableau, ou un texte (un élément par ligne). Vides et doublons retirés, ordre gardé. */
function liste(v: unknown): string[] | null {
  const brut = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : v == null ? [] : null;
  if (!brut || brut.some((x) => typeof x !== 'string')) return null;
  const vus = new Set<string>();
  const out: string[] = [];
  for (const x of brut as string[]) {
    const t = ligne(x);
    if (!t || vus.has(t.toLocaleLowerCase('fr'))) continue;
    vus.add(t.toLocaleLowerCase('fr'));
    out.push(t);
  }
  return out;
}

/** Le rang saisi · vide = sans rang · sinon un entier de 1 à `RANG_PERSONA_MAX`. `undefined` = invalide. */
function rangSaisi(v: unknown): number | null | undefined {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= RANG_PERSONA_MAX ? n : undefined;
}

/** La saisie d'une modification de persona · tout est vérifié avant d'écrire, rien n'est tronqué en silence. */
export function validerPersona(brut: unknown): ValidationPersona {
  const x = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const erreurs: Array<{ champ: ChampPersona; raison: string }> = [];

  const nom = typeof x.nom === 'string' ? ligne(x.nom) : '';
  if (!nom) erreurs.push({ champ: 'nom', raison: 'Le nom du persona est obligatoire.' });
  else if (nom.length > NOM_PERSONA_MAX) erreurs.push({ champ: 'nom', raison: `Le nom tient en ${NOM_PERSONA_MAX} signes au plus.` });
  else if (nom.toLocaleLowerCase('fr') === NOM_PERSONA_PROVISOIRE.toLocaleLowerCase('fr')) {
    erreurs.push({ champ: 'nom', raison: `« ${NOM_PERSONA_PROVISOIRE} » est réservé au persona provisoire des Studios · choisis un vrai nom.` });
  }

  const description = typeof x.description === 'string' ? x.description.replace(CONTROLE, ' ').trim() : x.description == null ? '' : null;
  if (description === null) erreurs.push({ champ: 'description', raison: 'La description doit être un texte.' });
  else if (description.length > DESCRIPTION_PERSONA_MAX) erreurs.push({ champ: 'description', raison: `La description tient en ${DESCRIPTION_PERSONA_MAX} signes au plus.` });

  const segment = typeof x.segment === 'string' ? ligne(x.segment) : x.segment == null ? '' : null;
  if (segment === null) erreurs.push({ champ: 'segment', raison: 'Le segment doit être un texte.' });
  else if (segment.length > SEGMENT_PERSONA_MAX) erreurs.push({ champ: 'segment', raison: `Le segment tient en ${SEGMENT_PERSONA_MAX} signes au plus.` });

  const listes = {} as Record<'desirs' | 'freins' | 'objections', string[]>;
  for (const [champ, libelle] of [['desirs', 'désirs'], ['freins', 'freins'], ['objections', 'objections']] as const) {
    const l = liste(x[champ]);
    if (!l) { erreurs.push({ champ, raison: `Les ${libelle} doivent être des lignes de texte.` }); continue; }
    if (l.length > ELEMENTS_PERSONA_MAX) erreurs.push({ champ, raison: `${ELEMENTS_PERSONA_MAX} ${libelle} au plus · il y en a ${l.length}.` });
    const long = l.find((t) => t.length > ELEMENT_PERSONA_MAX);
    if (long) erreurs.push({ champ, raison: `Une ligne des ${libelle} dépasse ${ELEMENT_PERSONA_MAX} signes · « ${long.slice(0, 30)}… ».` });
    listes[champ] = l;
  }

  const rang = rangSaisi(x.rang);
  if (rang === undefined) erreurs.push({ champ: 'rang', raison: `Le rang est un nombre entier de 1 à ${RANG_PERSONA_MAX}, ou vide pour « Sans rang ».` });

  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    persona: {
      nom, description: description || null, segment: segment || null,
      desirs: listes.desirs, freins: listes.freins, objections: listes.objections, rang: rang ?? null,
    },
  };
}

export interface PersonaClasse { id: string; rang: number | null }

/**
 * Les rangs de TOUS les personas de la marque après qu'un persona prend le rang
 * `rang` (`null` · sans rang) · les classés restent 1, 2, 3… sans trou ni
 * doublon, l'ordre relatif des autres est gardé. Un rang plus grand que le
 * classement place le persona en dernier. Les personas sans rang gardent `null`.
 */
export function rangsApres(personas: readonly PersonaClasse[], id: string, rang: number | null): Array<{ id: string; rang: number | null }> {
  const classes = personas
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.rang != null && p.id !== id)
    .sort((a, b) => a.rang! - b.rang! || a.i - b.i)
    .map((p) => p.id);
  if (rang != null && personas.some((p) => p.id === id)) classes.splice(Math.min(Math.max(rang, 1), classes.length + 1) - 1, 0, id);
  const nouveau = new Map(classes.map((x, i) => [x, i + 1]));
  return personas.map((p) => ({ id: p.id, rang: nouveau.get(p.id) ?? null }));
}

/** Les seuls personas dont le rang change · ce que le serveur écrit. */
export function rangsAEcrire(personas: readonly PersonaClasse[], id: string, rang: number | null): Array<{ id: string; rang: number | null }> {
  const avant = new Map(personas.map((p) => [p.id, p.rang ?? null]));
  return rangsApres(personas, id, rang).filter((p) => p.id !== id && avant.get(p.id) !== p.rang);
}

/** L'ordre de lecture des personas, partout · classés par rang, puis les autres par nom. */
export function ordonnerPersonas<T extends { rang: number | null; nom: string }>(personas: readonly T[]): T[] {
  return [...personas].sort((a, b) => {
    if (a.rang != null && b.rang != null) return a.rang - b.rang;
    if (a.rang != null) return -1;
    if (b.rang != null) return 1;
    return a.nom.localeCompare(b.nom, 'fr');
  });
}

/** « n°1 » · `null` sans rang. */
export const libelleRangPersona = (rang: number | null | undefined): string | null => (rang != null ? `n°${rang}` : null);

/** Les choix du rang dans la fenêtre de modification · « Sans rang », puis 1 à N (N = personas de la marque). */
export function choixRangPersona(nombre: number): Array<{ valeur: string; libelle: string }> {
  const n = Math.max(1, Math.min(RANG_PERSONA_MAX, Math.floor(nombre)));
  return [{ valeur: '', libelle: 'Sans rang' }, ...Array.from({ length: n }, (_, i) => ({ valeur: String(i + 1), libelle: `n°${i + 1}` }))];
}
