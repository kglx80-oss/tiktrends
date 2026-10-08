/**
 * Studios · L6-B · fiche d'identité d'un personnage récurrent (cahier 01 §4.5 ·
 * « fiche identité versionnée : traits, cheveux, tenue, accessoires, vues »).
 *
 * Pur. La fiche vit dans `ContenuVersion.characterRefs[<identityId>]` (L1) :
 * aucune table, aucune colonne nouvelle. Le graphe d'impact (L1) hache déjà
 * chaque entrée de `characterRefs` et relie une identité aux plans qui la
 * CITENT (`plan.referenceIds` contient l'identifiant) : lier une identité à un
 * plan, c'est écrire son identifiant dans les références du plan, rien d'autre.
 *
 * ── Attributs immuables ──────────────────────────────────────────────────────
 *
 * Chaque attribut (tenue, cheveux, accessoire, trait) est structuré : un
 * ÉLÉMENT (veste, cheveux, lunettes) et une COULEUR prise dans le lexique
 * fermé (`lexique.ts`). « Immuable » veut dire qu'un plan ne le change pas :
 * seule une modification explicite de la fiche le fait, et elle donne une
 * nouvelle version de la fiche (`version + 1`), donc une nouvelle version du
 * projet, et le graphe d'impact rend obsolètes les plans qui la citent.
 *
 * ── Fiches anciennes ─────────────────────────────────────────────────────────
 *
 * Une entrée `characterRefs` d'une autre forme (ex. `{ tenue: 'pull bleu' }`)
 * est relue en lecture SEULE : ses champs texte connus (tenue, cheveux,
 * accessoire(s), trait(s)) sont découpés en élément + couleur quand le lexique
 * les reconnaît, pour que le contrôle des contradictions ne soit pas aveugle.
 * Elle n'est jamais réécrite sans geste explicite.
 */

import { ID_STABLE, type ContenuVersion, type ViolationStudio } from '../document';
import { jsonCanonique } from '../version';
import { decouper, lireCouleur, normaliser } from './lexique';
import type { ChangementPatch } from '../patch';

export const SCHEMA_IDENTITE = 'identite_studio/1' as const;
export const CATEGORIES_ATTRIBUT = ['tenue', 'cheveux', 'accessoire', 'trait'] as const;
export type CategorieAttribut = (typeof CATEGORIES_ATTRIBUT)[number];
export const LIBELLES_CATEGORIE: Readonly<Record<CategorieAttribut, string>> = { tenue: 'Tenue', cheveux: 'Cheveux', accessoire: 'Accessoire', trait: 'Trait' };
export const VUES_IDENTITE = ['front', 'three_quarter', 'profile', 'back'] as const;
export type VueIdentite = (typeof VUES_IDENTITE)[number];
export const LIBELLES_VUE: Readonly<Record<VueIdentite, string>> = { front: 'Face', three_quarter: 'Trois quarts', profile: 'Profil', back: 'Dos' };

/** Bornes de saisie · contrat `character_spec_output` (12 000 par texte, 100 par liste), resserrées pour l'écran. */
export const BORNES_IDENTITE = { nom: 80, element: 60, detail: 200, description: 2000, attributs: 30 } as const;

export interface AttributIdentite {
  id: string;
  categorie: CategorieAttribut;
  /** Ce qui porte l'attribut · « veste », « cheveux », « lunettes ». */
  element: string;
  /** Forme du lexique (« verte »), ou `null` (attribut sans couleur, ex. « lunettes rondes »). */
  couleur: string | null;
  /** Précision libre (« coupe au carré »), jamais lue par le contrôle. */
  detail: string;
}

export interface IdentiteStudio {
  schema: typeof SCHEMA_IDENTITE;
  identityId: string;
  nom: string;
  /** Version de la FICHE · +1 à chaque changement réel. */
  version: number;
  attributs: AttributIdentite[];
  vues: VueIdentite[];
  description: string;
}

/** Une identité telle que le contrôle la lit · structurée ou relue d'une ancienne forme. */
export interface IdentiteLue {
  identityId: string;
  nom: string;
  structuree: boolean;
  fiche: IdentiteStudio | null;
  attributs: AttributIdentite[];
  /** Plans qui citent l'identité, dans l'ORDRE du montage. */
  plans: string[];
}

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const estTexte = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;

/* ───────────────────────────── Validation ───────────────────────────────── */

export function validerIdentite(x: unknown, cle?: string): ViolationStudio[] {
  const v: ViolationStudio[] = [];
  const err = (chemin: string, raison: string) => v.push({ chemin, raison });
  if (!estObjet(x)) return [{ chemin: '', raison: 'fiche d’identité attendue' }];
  const permis = ['schema', 'identityId', 'nom', 'version', 'attributs', 'vues', 'description'];
  for (const k of Object.keys(x)) if (!permis.includes(k)) err(`/${k}`, 'champ inconnu');
  if (x.schema !== SCHEMA_IDENTITE) err('/schema', `schéma ${SCHEMA_IDENTITE} attendu`);
  if (typeof x.identityId !== 'string' || !ID_STABLE.test(x.identityId) || /^\d+$/.test(x.identityId)) err('/identityId', 'identifiant stable attendu');
  else if (cle !== undefined && x.identityId !== cle) err('/identityId', 'doit égaler la clé de characterRefs');
  if (!estTexte(x.nom, BORNES_IDENTITE.nom) || x.nom.trim().length === 0) err('/nom', `nom attendu (${BORNES_IDENTITE.nom} caractères au plus)`);
  if (!Number.isInteger(x.version) || (x.version as number) < 1) err('/version', 'version entière à partir de 1');
  if (!estTexte(x.description, BORNES_IDENTITE.description)) err('/description', `description de ${BORNES_IDENTITE.description} caractères au plus`);
  if (!Array.isArray(x.vues) || x.vues.some((w) => !(VUES_IDENTITE as readonly unknown[]).includes(w)) || new Set(x.vues).size !== x.vues.length) err('/vues', 'vues parmi face, trois quarts, profil, dos, sans doublon');
  if (!Array.isArray(x.attributs) || x.attributs.length > BORNES_IDENTITE.attributs) { err('/attributs', `liste de ${BORNES_IDENTITE.attributs} attributs au plus`); return v; }
  const vus = new Set<string>();
  x.attributs.forEach((a, i) => {
    const ch = `/attributs/${i}`;
    if (!estObjet(a)) { err(ch, 'attribut attendu'); return; }
    for (const k of Object.keys(a)) if (!['id', 'categorie', 'element', 'couleur', 'detail'].includes(k)) err(`${ch}/${k}`, 'champ inconnu');
    if (typeof a.id !== 'string' || !ID_STABLE.test(a.id) || /^\d+$/.test(a.id)) err(`${ch}/id`, 'identifiant stable attendu');
    else if (vus.has(a.id)) err(`${ch}/id`, 'identifiant d’attribut en double');
    else vus.add(a.id);
    if (!(CATEGORIES_ATTRIBUT as readonly unknown[]).includes(a.categorie)) err(`${ch}/categorie`, 'catégorie tenue, cheveux, accessoire ou trait');
    if (!estTexte(a.element, BORNES_IDENTITE.element) || teteElement(a.element) === '') err(`${ch}/element`, `élément attendu (${BORNES_IDENTITE.element} caractères au plus)`);
    if (a.couleur !== null && (typeof a.couleur !== 'string' || !lireCouleur(a.couleur))) err(`${ch}/couleur`, 'couleur du lexique attendue · une couleur hors liste ne serait pas contrôlée');
    if (!estTexte(a.detail, BORNES_IDENTITE.detail)) err(`${ch}/detail`, `précision de ${BORNES_IDENTITE.detail} caractères au plus`);
  });
  return v;
}

export function estIdentiteStructuree(x: unknown): x is IdentiteStudio {
  return estObjet(x) && x.schema === SCHEMA_IDENTITE && validerIdentite(x).length === 0;
}

/* ───────────────────────────── Lecture ──────────────────────────────────── */

const DETERMINANTS = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'sa', 'son', 'ses', 'leur', 'leurs']);

/** Le nom qui porte l'élément (« une veste en jean » → « veste »), normalisé. */
export function teteElement(element: string): string {
  const j = decouper(element).find((t) => !DETERMINANTS.has(t.norme) && !lireCouleur(t.brut));
  return j ? j.norme : '';
}

/** Ancienne forme · `tenue: 'pull bleu'` → élément « pull », couleur « bleu ». */
const CLES_ANCIENNES: Readonly<Record<string, CategorieAttribut>> = {
  tenue: 'tenue', vetement: 'tenue', vetements: 'tenue', cheveux: 'cheveux', coiffure: 'cheveux',
  accessoire: 'accessoire', accessoires: 'accessoire', trait: 'trait', traits: 'trait',
};

function attributsAnciens(ref: Record<string, unknown>): AttributIdentite[] {
  const out: AttributIdentite[] = [];
  for (const [k, val] of Object.entries(ref)) {
    const cat = CLES_ANCIENNES[normaliser(k)];
    if (!cat) continue;
    const textes = typeof val === 'string' ? [val] : Array.isArray(val) ? val.filter((x): x is string => typeof x === 'string') : [];
    textes.forEach((t, i) => {
      const jetons = decouper(t);
      const couleur = jetons.find((j) => lireCouleur(j.brut));
      const element = cat === 'cheveux' && !jetons.some((j) => normaliser(j.brut).startsWith('cheveu')) ? 'cheveux' : t;
      if (!teteElement(element)) return;
      out.push({ id: `${normaliser(k).replace(/[^a-z0-9]/g, '')}_${i + 1}`, categorie: cat, element, couleur: couleur ? couleur.brut : null, detail: '' });
    });
  }
  return out;
}

/** Les identités d'un contenu, avec les plans qui les citent (ordre du montage). */
export function lireIdentites(c: ContenuVersion): IdentiteLue[] {
  const ordre = c.shots.order.filter((s) => c.shots.byId[s]);
  return Object.entries(c.characterRefs).map(([id, ref]) => {
    const plans = ordre.filter((s) => c.shots.byId[s]!.referenceIds.includes(id));
    if (estIdentiteStructuree(ref) && ref.identityId === id) {
      return { identityId: id, nom: ref.nom, structuree: true, fiche: ref, attributs: ref.attributs, plans };
    }
    const nom = typeof ref.nom === 'string' && ref.nom.trim() ? ref.nom.slice(0, BORNES_IDENTITE.nom) : id;
    return { identityId: id, nom, structuree: false, fiche: null, attributs: attributsAnciens(ref), plans };
  });
}

/* ──────────────────────────── Écriture ──────────────────────────────────── */

export interface SaisieAttribut { id?: unknown; categorie: unknown; element: unknown; couleur: unknown; detail?: unknown }
export interface SaisieIdentite { nom: unknown; attributs: unknown; vues?: unknown; description?: unknown }

export type ResultatFiche = { ok: true; fiche: IdentiteStudio; inchangee: boolean } | { ok: false; violations: ViolationStudio[] };

/**
 * Fiche à enregistrer à partir d'une saisie · les identifiants d'attributs
 * existants sont gardés, les nouveaux alloués (`attr_<n>`, n croissant) ;
 * la version n'avance que si le contenu de la fiche change réellement.
 */
export function construireFiche(identityId: string, s: SaisieIdentite, precedente: IdentiteStudio | null): ResultatFiche {
  const brut = Array.isArray(s.attributs) ? s.attributs : null;
  if (!brut) return { ok: false, violations: [{ chemin: '/attributs', raison: 'liste d’attributs attendue' }] };
  const existants = new Set((precedente?.attributs ?? []).map((a) => a.id));
  let n = Math.max(0, ...[...existants].map((id) => Number(/^attr_(\d+)$/.exec(id)?.[1] ?? 0)));
  const attributs: AttributIdentite[] = brut.map((a) => {
    const x = (estObjet(a) ? a : {}) as unknown as SaisieAttribut;
    const id = typeof x.id === 'string' && existants.has(x.id) ? x.id : `attr_${++n}`;
    const couleur = typeof x.couleur === 'string' && x.couleur.trim() ? x.couleur.trim() : null;
    return {
      id,
      categorie: x.categorie as CategorieAttribut,
      element: typeof x.element === 'string' ? x.element.trim() : (x.element as string),
      couleur: couleur ? (lireCouleur(couleur)?.forme ?? couleur) : null,
      detail: typeof x.detail === 'string' ? x.detail.trim() : '',
    };
  });
  const corps = {
    schema: SCHEMA_IDENTITE, identityId,
    nom: typeof s.nom === 'string' ? s.nom.trim() : (s.nom as string),
    attributs,
    vues: Array.isArray(s.vues) ? (s.vues as VueIdentite[]) : (precedente?.vues ?? []),
    description: typeof s.description === 'string' ? s.description.trim() : (precedente?.description ?? ''),
  };
  const sansVersion = (f: Omit<IdentiteStudio, 'version'>) => jsonCanonique({ ...f });
  const inchangee = !!precedente && sansVersion({ ...corps }) === sansVersion({ schema: precedente.schema, identityId: precedente.identityId, nom: precedente.nom, attributs: precedente.attributs, vues: precedente.vues, description: precedente.description });
  const fiche: IdentiteStudio = { ...corps, version: precedente ? (inchangee ? precedente.version : precedente.version + 1) : 1 };
  const violations = validerIdentite(fiche, identityId);
  return violations.length ? { ok: false, violations } : { ok: true, fiche, inchangee };
}

const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/** Le changement qui pose la fiche · `add` si nouvelle, `replace` sinon (L1 · `add` crée, `replace` vise l'existant). */
export function changementFiche(c: ContenuVersion, fiche: IdentiteStudio, raison: string): ChangementPatch {
  const existe = Object.prototype.hasOwnProperty.call(c.characterRefs, fiche.identityId);
  return { op: existe ? 'replace' : 'add', path: `/characterRefs/${echapper(fiche.identityId)}`, newValue: fiche, reason: raison };
}

export const cheminFiche = (identityId: string) => `/characterRefs/${echapper(identityId)}`;
export const cheminReferencesPlan = (shotId: string) => `/shots/byId/${echapper(shotId)}/referenceIds`;

/**
 * Liaison d'une identité à un ensemble de plans · seules les références des
 * plans qui CHANGENT sont réécrites (ajout ou retrait de l'identifiant), les
 * autres références du plan (produit, style) restent à leur place.
 */
export function changementsLiaison(c: ContenuVersion, identityId: string, shotIds: readonly string[]): { ok: true; changes: ChangementPatch[]; allowedPaths: string[] } | { ok: false; violations: ViolationStudio[] } {
  const inconnus = shotIds.filter((s) => !c.shots.byId[s]);
  if (inconnus.length) return { ok: false, violations: inconnus.map((s) => ({ chemin: 'shotIds', raison: `plan « ${s} » inconnu dans cette version` })) };
  if (!Object.prototype.hasOwnProperty.call(c.characterRefs, identityId)) return { ok: false, violations: [{ chemin: 'identityId', raison: 'identité inconnue dans cette version' }] };
  const voulus = new Set(shotIds);
  const changes: ChangementPatch[] = [];
  for (const sid of c.shots.order) {
    const p = c.shots.byId[sid];
    if (!p) continue;
    const a = p.referenceIds.includes(identityId);
    if (a === voulus.has(sid)) continue;
    const refs = a ? p.referenceIds.filter((r) => r !== identityId) : [...p.referenceIds, identityId];
    changes.push({ op: 'replace', path: cheminReferencesPlan(sid), newValue: refs, reason: a ? `Identité retirée du plan ${sid}` : `Identité liée au plan ${sid}` });
  }
  return { ok: true, changes, allowedPaths: changes.map((x) => x.path) };
}

/** Libellé lisible d'un attribut · « veste verte », « lunettes ». */
export function libelleAttribut(a: Pick<AttributIdentite, 'element' | 'couleur'>): string {
  const el = a.element.trim();
  if (!a.couleur) return el;
  return decouper(el).some((j) => lireCouleur(j.brut)) ? el : `${el} ${a.couleur}`;
}
