/**
 * Spatial · Veille · TAGS, NOTE et COLLECTIONS d'une sauvegarde (lot 6 V5 ·
 * VB TG01 à TG04, V20, C09, F15, S03, S06, S07, S10). Règles PURES · ni base,
 * ni réseau · l'action (`saveAd`, `majSauvegarde`, `app/actions/inspo.ts`) ne
 * fait qu'appliquer ce qui est décidé ici.
 *
 * ── Un tag ──────────────────────────────────────────────────────────────────
 * Posé À LA MAIN (aucun modèle, 0 $), dans le vocabulaire de l'espace ET de la
 * marque de la sauvegarde (une autre marque a le sien). Deux saisies qui ne
 * diffèrent que par la casse, les espaces ou les accents désignent le MÊME tag
 * (« Hook UGC » = « hook  ugc » = « Hook ÜGC ») · la clé (`cleTag`) est stockée
 * à côté du libellé, la première écriture garde son libellé.
 *
 * Un tag qui ne porte plus aucune sauvegarde RESTE dans le vocabulaire (choix
 * du lot · ni suppression, ni archive) · `/tags` le montre à « 0 », il se
 * renomme et se repose. Retirer un tag d'une sauvegarde n'enlève que le lien ·
 * ni la sauvegarde, ni sa note, ni ses collections.
 *
 * ── Les bornes, et pourquoi ─────────────────────────────────────────────────
 * Aucune base réelle n'est lisible depuis la session · ces bornes ne sont pas
 * des seuils statistiques mais des limites de saisie, choisies sur ce qui les
 * affiche, et dites à l'écran quand elles refusent (jamais de troncature muette) :
 *  · 40 signes par tag · un tag se lit en PASTILLE sur la carte (≈ 260 px utiles
 *    à 375 px de large) · au-delà, c'est une note, pas un tag ;
 *  · 10 tags par sauvegarde · au-delà, la rangée de pastilles passe sur plus de
 *    deux lignes de carte et le filtre ne sépare plus rien ;
 *  · 1 000 signes de note · une note de veille (« pourquoi je la garde »), pas
 *    un brief · le brief vit dans Studios ;
 *  · 60 signes par collection · la borne existante de `setSavedAdFolder` ;
 *    10 collections par sauvegarde.
 */

export const LONGUEUR_MAX_TAG = 40;
export const TAGS_MAX_PAR_SAUVEGARDE = 10;
export const LONGUEUR_MAX_NOTE = 1000;
export const LONGUEUR_MAX_COLLECTION = 60;
export const COLLECTIONS_MAX_PAR_SAUVEGARDE = 10;

export interface TagVeille { cle: string; nom: string }

// Caractères de contrôle (dont retours à la ligne dans un libellé) · remplacés par une espace.
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/g;

/** Le libellé tel qu'il sera écrit · NFC, contrôles retirés, espaces fusionnées, bords nus. */
export function nettoyerLibelle(brut: string): string {
  return brut.normalize('NFC').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * La clé de comparaison d'un tag · libellé nettoyé, sans accents, en minuscules.
 * « Hook UGC », « hook  ugc » et « Hook ÜGC » donnent « hook ugc ».
 */
export function cleTag(nom: string): string {
  return nettoyerLibelle(nom).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
}

export type Valide<T> = { ok: true } & T | { ok: false; raison: string };

/** Un tag saisi · refusé avec sa phrase s'il est vide, trop long ou sans lettre ni chiffre. */
export function validerTag(brut: unknown): Valide<{ tag: TagVeille }> {
  if (typeof brut !== 'string') return { ok: false, raison: 'Tag illisible · écris-le en toutes lettres.' };
  const nom = nettoyerLibelle(brut);
  if (!nom) return { ok: false, raison: 'Un tag ne peut pas être vide.' };
  if ([...nom].length > LONGUEUR_MAX_TAG) return { ok: false, raison: `Un tag tient en ${LONGUEUR_MAX_TAG} signes au plus · « ${[...nom].slice(0, 20).join('')}… » est trop long.` };
  const cle = cleTag(nom);
  if (!/[\p{L}\p{N}]/u.test(cle)) return { ok: false, raison: 'Un tag doit contenir au moins une lettre ou un chiffre.' };
  return { ok: true, tag: { cle, nom } };
}

/**
 * La liste de tags d'une sauvegarde · chaque entrée validée, les doublons
 * (même clé) fusionnés en gardant la PREMIÈRE écriture, plafond tenu.
 */
export function validerTags(bruts: unknown): Valide<{ tags: TagVeille[] }> {
  if (!Array.isArray(bruts)) return { ok: false, raison: 'Liste de tags illisible · recharge la page.' };
  const vus = new Map<string, TagVeille>();
  for (const b of bruts) {
    const v = validerTag(b);
    if (!v.ok) return v;
    if (!vus.has(v.tag.cle)) vus.set(v.tag.cle, v.tag);
  }
  if (vus.size > TAGS_MAX_PAR_SAUVEGARDE) return { ok: false, raison: `${TAGS_MAX_PAR_SAUVEGARDE} tags au plus par sauvegarde · retire-en ${vus.size - TAGS_MAX_PAR_SAUVEGARDE}.` };
  return { ok: true, tags: [...vus.values()] };
}

/**
 * La note · `null` ou vide = pas de note. Les retours à la ligne sont gardés
 * (normalisés en `\n`), les bords nus · trop longue, elle est REFUSÉE (jamais coupée).
 */
export function validerNote(brut: unknown): Valide<{ note: string | null }> {
  if (brut === null || brut === undefined) return { ok: true, note: null };
  if (typeof brut !== 'string') return { ok: false, raison: 'Note illisible · recharge la page.' };
  // eslint-disable-next-line no-control-regex
  const note = brut.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!note) return { ok: true, note: null };
  const n = [...note].length;
  if (n > LONGUEUR_MAX_NOTE) return { ok: false, raison: `La note tient en ${LONGUEUR_MAX_NOTE.toLocaleString('fr-FR')} signes au plus · elle en compte ${n.toLocaleString('fr-FR')}.` };
  return { ok: true, note };
}

/** Les collections cochées · libellés nettoyés, doublons exacts fusionnés, ordre gardé (la première devient le dossier). */
export function validerCollections(bruts: unknown): Valide<{ collections: string[] }> {
  if (!Array.isArray(bruts)) return { ok: false, raison: 'Liste de collections illisible · recharge la page.' };
  const out: string[] = [];
  for (const b of bruts) {
    if (typeof b !== 'string') return { ok: false, raison: 'Collection illisible · recharge la page.' };
    const nom = nettoyerLibelle(b);
    if (!nom) continue;
    if ([...nom].length > LONGUEUR_MAX_COLLECTION) return { ok: false, raison: `Un nom de collection tient en ${LONGUEUR_MAX_COLLECTION} signes au plus.` };
    if (!out.includes(nom)) out.push(nom);
  }
  if (out.length > COLLECTIONS_MAX_PAR_SAUVEGARDE) return { ok: false, raison: `${COLLECTIONS_MAX_PAR_SAUVEGARDE} collections au plus par sauvegarde.` };
  return { ok: true, collections: out };
}

/**
 * Les collections d'une sauvegarde · les liens de 0070 quand il y en a, sinon
 * son dossier (`saved_ads.folder`, les sauvegardes d'avant le lot). Le dossier
 * reste écrit (= la première collection) · les écrans qui ne lisent que lui
 * (Formats, Studios) voient la sauvegarde rangée comme avant.
 */
export function collectionsDeSauvegarde(folder: string | null | undefined, liees: readonly string[] | null | undefined): string[] {
  const l = [...new Set((liees ?? []).map((x) => x.trim()).filter(Boolean))];
  const f = folder?.trim();
  // Le dossier est la PREMIÈRE collection choisie · il passe en tête quand il est lié.
  if (l.length) return f && l.includes(f) ? [f, ...l.filter((x) => x !== f)] : l;
  return f ? [f] : [];
}

/** Ce qui s'écrit pour des collections choisies · le dossier (première) et les liens (toutes). */
export function ecritureCollections(collections: readonly string[]): { folder: string | null; liens: string[] } {
  return { folder: collections[0] ?? null, liens: [...collections] };
}

/**
 * Rattacher des tags demandés au VOCABULAIRE existant (même espace, même
 * marque) · une clé connue réemploie le tag (son libellé d'origine), une clé
 * nouvelle est à créer.
 */
export function rattacherTags(vocabulaire: ReadonlyArray<TagVeille & { id: string }>, demandes: readonly TagVeille[]): { existants: string[]; aCreer: TagVeille[] } {
  const parCle = new Map(vocabulaire.map((t) => [t.cle, t.id]));
  const existants: string[] = []; const aCreer: TagVeille[] = [];
  for (const d of demandes) { const id = parCle.get(d.cle); if (id) existants.push(id); else aCreer.push(d); }
  return { existants, aCreer };
}

/** Renommer un tag · la nouvelle clé ne doit désigner AUCUN autre tag du même vocabulaire. */
export function validerRenommage(id: string, brut: unknown, vocabulaire: ReadonlyArray<TagVeille & { id: string }>): Valide<{ tag: TagVeille }> {
  const v = validerTag(brut);
  if (!v.ok) return v;
  const autre = vocabulaire.find((t) => t.cle === v.tag.cle && t.id !== id);
  if (autre) return { ok: false, raison: `Le tag « ${autre.nom} » existe déjà · choisis un autre nom.` };
  return v;
}

/** Les tags affichés · par libellé, dans l'ordre du français. */
export function trierTags<T extends { nom: string }>(tags: readonly T[]): T[] {
  return [...tags].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
}

/** La mention de la pop-up (S08) · ce qui est vraiment gardé, et ce que la source ne donne pas. */
export const MENTION_CONSERVATION = 'La source, la plateforme et la date de sauvegarde sont conservées · la source ne donne pas les dates de diffusion.';

/** Le message dit après « Sauvegarder » ou « Mettre à jour » · seulement après le oui du serveur. */
export function messageSauvegarde(p: { nouvelle: boolean; tags: number; note: boolean; collections: number }): string {
  const parts: string[] = [];
  if (p.tags) parts.push(`${p.tags} tag${p.tags > 1 ? 's' : ''}`);
  if (p.collections) parts.push(`${p.collections} collection${p.collections > 1 ? 's' : ''}`);
  if (p.note) parts.push('une note');
  const base = p.nouvelle ? 'Pub gardée dans tes sauvegardes' : 'Sauvegarde mise à jour';
  return parts.length ? `${base} · ${parts.join(', ')}` : base;
}

/* ───────────────────────── /saved · filtre par tag ───────────────────────── */

/** Le paramètre d'adresse du filtre par tag des Sauvegardes (`/saved?tag=hook ugc`, lien « Voir » de `/tags`). */
export const PARAM_TAG_SAUVEGARDES = 'tag';
export const TAG_TOUS = 'tous';
export const MESSAGE_TAG_IGNORE = 'Ce tag n’existe pas pour cette marque · toutes les sauvegardes sont affichées.';

/** Le lien « Voir » d'un tag · les Sauvegardes filtrées sur sa clé. */
export function lienSauvegardesTag(cle: string): string {
  return `/saved?${PARAM_TAG_SAUVEGARDES}=${encodeURIComponent(cle)}`;
}

/**
 * Le tag demandé par l'adresse, validé contre les tags RÉELS des sauvegardes
 * lues ici · inconnu (autre marque, autre espace, faute de frappe) → aucun
 * filtre, et `ignore` le dit.
 */
export function lireTagSauvegardes(sp: Readonly<Record<string, string | string[] | undefined>>, disponibles: ReadonlyArray<{ cle: string }>): { cle: string; ignore: boolean } {
  const brut = sp[PARAM_TAG_SAUVEGARDES];
  const v = (Array.isArray(brut) ? brut[0] : brut) ?? '';
  if (!v.trim()) return { cle: TAG_TOUS, ignore: false };
  const cle = cleTag(v);
  return disponibles.some((t) => t.cle === cle) ? { cle, ignore: false } : { cle: TAG_TOUS, ignore: true };
}

/** Une sauvegarde passe-t-elle le filtre par tag ? */
export function porteTag(tags: ReadonlyArray<{ cle: string }> | null | undefined, cle: string): boolean {
  return cle === TAG_TOUS || (tags ?? []).some((t) => t.cle === cle);
}

/** Les tags présents sur des sauvegardes (pour le menu « Tags ») · une entrée par clé, avec son effectif. */
export function tagsPresents(items: ReadonlyArray<{ tags?: ReadonlyArray<TagVeille> | null }>): Array<TagVeille & { n: number }> {
  const m = new Map<string, TagVeille & { n: number }>();
  for (const i of items) for (const t of i.tags ?? []) { const x = m.get(t.cle); if (x) x.n++; else m.set(t.cle, { ...t, n: 1 }); }
  return trierTags([...m.values()]);
}
