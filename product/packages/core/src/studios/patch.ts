/**
 * Studios · patches JSON Pointer bornés (cahier 06 §8, contrat `$defs.Proposal`).
 *
 * Pur. Une proposition (Jarvis, agent ou humain) ne réécrit jamais un document
 * entier : elle énumère des changements `add | replace | remove` sur des chemins
 * RFC 6901, et le serveur vérifie, avant toute nouvelle version :
 *
 *  · chaque chemin est bien formé, sans segment `__proto__`, `constructor` ou
 *    `prototype`, et sans INDICE POSITIONNEL (`/shots/3`, `/-`) : les
 *    collections sont indexées par identifiant stable, une position change
 *    quand on réordonne et viserait alors le mauvais objet ;
 *  · chaque chemin est couvert par `allowedPaths` (préfixe par segments, `*`
 *    vaut UN identifiant) ;
 *  · `remove` porte `newValue: null` ; sous `replace`, `null` est une VALEUR ;
 *  · `add` crée (la cible n'existe pas), `replace` et `remove` visent une cible
 *    existante ;
 *  · après application, tout champ hors `allowedPaths` est STRICTEMENT égal à
 *    l'original (`verifierHorsCheminsInchanges`), contrôle indépendant de la
 *    manière dont le résultat a été obtenu.
 *
 * Le type et le domaine des valeurs se vérifient par le validateur du contenu
 * (`validerContenuVersion`) sur le RÉSULTAT, et par `validerValeur` si l'appelant
 * veut refuser plus tôt.
 */

import { SEGMENTS_INTERDITS, clesInterditesEnProfondeur, type ViolationStudio } from './document';
import { jsonCanonique } from './version';

export type OperationPatch = 'add' | 'replace' | 'remove';

export interface ChangementPatch {
  op: OperationPatch;
  path: string;
  newValue: unknown;
  reason: string;
}

export const MAX_CHANGEMENTS_PATCH = 100;
const PROFONDEUR_MAX = 32;
const LONGUEUR_CHEMIN_MAX = 1000;
const LONGUEUR_RAISON_MAX = 12_000;

/* ─────────────────────────────── Pointeurs ───────────────────────────────── */

export type ResultatPointeur = { ok: true; segments: string[] } | { ok: false; raison: string };

/**
 * Découpe un pointeur RFC 6901 et applique les interdits. `joker` autorise le
 * segment `*` (réservé aux motifs d'`allowedPaths`).
 */
export function lirePointeur(path: unknown, joker = false): ResultatPointeur {
  if (typeof path !== 'string' || path.length === 0 || path.length > LONGUEUR_CHEMIN_MAX) return { ok: false, raison: 'chemin JSON Pointer attendu' };
  if (!path.startsWith('/')) return { ok: false, raison: 'un chemin commence par « / »' };
  const bruts = path.slice(1).split('/');
  if (bruts.length > PROFONDEUR_MAX) return { ok: false, raison: 'chemin trop profond' };
  const segments: string[] = [];
  for (const b of bruts) {
    if (/~[^01]|~$/.test(b)) return { ok: false, raison: 'échappement « ~ » invalide' };
    const s = b.replace(/~1/g, '/').replace(/~0/g, '~');
    if (s.length === 0) return { ok: false, raison: 'segment vide' };
    if (SEGMENTS_INTERDITS.has(s)) return { ok: false, raison: `segment « ${s} » interdit` };
    if (s === '-' || /^\d+$/.test(s)) return { ok: false, raison: 'indice positionnel interdit · viser un identifiant stable' };
    if (s === '*' && !joker) return { ok: false, raison: 'joker « * » réservé aux chemins autorisés' };
    segments.push(s);
  }
  return { ok: true, segments };
}

/** Le chemin est-il couvert par le motif (préfixe par segments, `*` = un identifiant) ? */
export function cheminCouvertPar(segments: readonly string[], motif: readonly string[]): boolean {
  if (motif.length > segments.length) return false;
  return motif.every((m, i) => m === '*' || m === segments[i]);
}

export function cheminAutorise(segments: readonly string[], motifs: readonly (readonly string[])[]): boolean {
  return motifs.some((m) => cheminCouvertPar(segments, m));
}

/** Lit `allowedPaths` · un motif invalide est une violation, jamais ignoré. */
export function lireCheminsAutorises(allowedPaths: unknown): { motifs: string[][]; violations: ViolationStudio[] } {
  const motifs: string[][] = [];
  const violations: ViolationStudio[] = [];
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0 || allowedPaths.length > 100) {
    return { motifs, violations: [{ chemin: 'allowedPaths', raison: 'liste de 1 à 100 chemins attendue' }] };
  }
  allowedPaths.forEach((p, i) => {
    const r = lirePointeur(p, true);
    if (r.ok) motifs.push(r.segments);
    else violations.push({ chemin: `allowedPaths/${i}`, raison: r.raison });
  });
  return { motifs, violations };
}

/* ───────────────────────────── Différences ───────────────────────────────── */

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

function egalJson(a: unknown, b: unknown): boolean {
  try { return jsonCanonique(a) === jsonCanonique(b); } catch { return false; }
}

/**
 * Chemins où `a` et `b` diffèrent. Les objets sont comparés clé par clé ; une
 * liste est une VALEUR (comparée entière) puisqu'on n'adresse pas ses positions.
 */
export function cheminsDifferents(a: unknown, b: unknown, chemin = ''): string[] {
  if (estObjet(a) && estObjet(b)) {
    const out: string[] = [];
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const ch = `${chemin}/${echapper(k)}`;
      if (!(k in a) || !(k in b)) out.push(ch);
      else out.push(...cheminsDifferents(a[k], b[k], ch));
    }
    return out;
  }
  return egalJson(a, b) ? [] : [chemin];
}

/** Valeur au chemin (segments non échappés) · `undefined` si absente. */
export function valeurAuChemin(racine: unknown, chemin: string): unknown {
  if (chemin === '') return racine;
  let v: unknown = racine;
  for (const b of chemin.slice(1).split('/')) {
    const s = b.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!estObjet(v) || !Object.prototype.hasOwnProperty.call(v, s)) return undefined;
    v = v[s];
  }
  return v;
}

/**
 * Tout champ hors `allowedPaths` est-il resté identique ? Renvoie les chemins
 * fautifs. Un remplacement d'un parent entier (ex. `/brief` alors que seul
 * `/brief/hook` est permis) est fautif : le parent n'est pas couvert.
 */
export function verifierHorsCheminsInchanges(avant: unknown, apres: unknown, allowedPaths: readonly string[]): ViolationStudio[] {
  const { motifs, violations } = lireCheminsAutorises(allowedPaths);
  if (violations.length) return violations;
  const out: ViolationStudio[] = [];
  for (const ch of cheminsDifferents(avant, apres)) {
    const segs = ch === '' ? [] : ch.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!cheminAutorise(segs, motifs)) out.push({ chemin: ch || '/', raison: 'champ hors allowedPaths modifié' });
  }
  return out;
}

/* ───────────────────────────── Application ───────────────────────────────── */

export type ResultatPatch<T> = { ok: true; resultat: T; cheminsModifies: string[] } | { ok: false; violations: ViolationStudio[] };

export interface OptionsPatch {
  /** Refus précoce d'une valeur pour un chemin donné · message ou null. */
  validerValeur?: (segments: readonly string[], valeur: unknown) => string | null;
}

/**
 * Valide puis applique les changements sur une COPIE de `base`. Tout ou rien :
 * une seule violation et rien n'est appliqué.
 */
export function appliquerPatch<T>(base: T, changes: unknown, allowedPaths: unknown, opts: OptionsPatch = {}): ResultatPatch<T> {
  const { motifs, violations } = lireCheminsAutorises(allowedPaths);
  if (violations.length) return { ok: false, violations };
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGEMENTS_PATCH) {
    return { ok: false, violations: [{ chemin: 'changes', raison: `liste de 1 à ${MAX_CHANGEMENTS_PATCH} changements attendue` }] };
  }

  let copie: unknown;
  try { copie = JSON.parse(jsonCanonique(base)); } catch { return { ok: false, violations: [{ chemin: '', raison: 'base non JSON' }] }; }

  const out: ViolationStudio[] = [];
  const modifies: string[] = [];
  changes.forEach((c: unknown, i: number) => {
    const ici = `changes/${i}`;
    if (!estObjet(c)) { out.push({ chemin: ici, raison: 'changement attendu' }); return; }
    const inconnus = Object.keys(c).filter((k) => !['op', 'path', 'newValue', 'reason'].includes(k));
    if (inconnus.length) { out.push({ chemin: ici, raison: `champ inconnu : ${inconnus.join(', ')}` }); return; }
    if (!('newValue' in c)) { out.push({ chemin: ici, raison: 'newValue requis (null pour remove)' }); return; }
    const op = c.op;
    if (op !== 'add' && op !== 'replace' && op !== 'remove') { out.push({ chemin: ici, raison: 'op add, replace ou remove' }); return; }
    if (typeof c.reason !== 'string' || c.reason.length > LONGUEUR_RAISON_MAX) { out.push({ chemin: ici, raison: 'raison textuelle attendue' }); return; }
    const p = lirePointeur(c.path);
    if (!p.ok) { out.push({ chemin: ici, raison: p.raison }); return; }
    const segs = p.segments;
    if (!cheminAutorise(segs, motifs)) { out.push({ chemin: ici, raison: `chemin ${String(c.path)} hors allowedPaths` }); return; }
    if (op === 'remove' && c.newValue !== null) { out.push({ chemin: ici, raison: 'remove exige newValue null' }); return; }
    if (op !== 'remove') {
      const interdites = clesInterditesEnProfondeur(c.newValue);
      if (interdites.length) { out.push({ chemin: ici, raison: `valeur avec clé interdite en ${interdites[0]!.chemin}` }); return; }
      try { jsonCanonique(c.newValue); } catch { out.push({ chemin: ici, raison: 'valeur hors JSON' }); return; }
      const refus = opts.validerValeur?.(segs, c.newValue);
      if (refus) { out.push({ chemin: ici, raison: refus }); return; }
    }

    // Descente · chaque étape intermédiaire est un objet propre (jamais une liste).
    let parent: unknown = copie;
    for (const s of segs.slice(0, -1)) {
      if (!estObjet(parent) || !Object.prototype.hasOwnProperty.call(parent, s)) { parent = undefined; break; }
      parent = parent[s];
    }
    if (!estObjet(parent)) { out.push({ chemin: ici, raison: 'parent absent ou non adressable par identifiant' }); return; }
    const cle = segs[segs.length - 1]!;
    const existe = Object.prototype.hasOwnProperty.call(parent, cle);
    if (op === 'add' && existe) { out.push({ chemin: ici, raison: 'add vise une cible existante · utiliser replace' }); return; }
    if (op !== 'add' && !existe) { out.push({ chemin: ici, raison: `${op} vise une cible absente` }); return; }
    if (op === 'remove') delete parent[cle];
    else Object.defineProperty(parent, cle, { value: JSON.parse(jsonCanonique(c.newValue)), enumerable: true, writable: true, configurable: true });
    modifies.push(c.path as string);
  });
  if (out.length) return { ok: false, violations: out };

  const hors = verifierHorsCheminsInchanges(base, copie, allowedPaths as string[]);
  if (hors.length) return { ok: false, violations: hors };
  return { ok: true, resultat: copie as T, cheminsModifies: modifies };
}

/** Diff détaillé pour une réponse 409 · borné, valeurs JSON telles quelles. */
export function differencesDetaillees(base: unknown, courant: unknown, max = 50): Array<{ chemin: string; base: unknown; courant: unknown }> {
  return cheminsDifferents(base, courant).slice(0, max).map((ch) => ({
    chemin: ch || '/',
    base: valeurAuChemin(base, ch) ?? null,
    courant: valeurAuChemin(courant, ch) ?? null,
  }));
}
