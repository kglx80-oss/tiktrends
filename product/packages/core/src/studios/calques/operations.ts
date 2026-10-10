/**
 * Studios · éditeur de calques · opérations sur un `DocumentStudio`.
 *
 * Pur. Chaque opération reçoit un document et rend SOIT un nouveau document
 * VALIDÉ (`validerDocument`) accompagné du patch JSON Pointer qui y mène
 * (chemins sur identifiants stables), SOIT un refus qui dit quoi faire. Le
 * document d'entrée n'est jamais modifié (édition non destructive : l'appelant
 * garde l'avant pour annuler).
 *
 * ── Règles ──────────────────────────────────────────────────────────────────
 *
 *  · Un calque VERROUILLÉ ne bouge pas : ni position, ni taille, ni rotation,
 *    ni opacité, ni contenu, ni ordre propre, ni suppression. On peut le
 *    renommer, le masquer, le déverrouiller, le dupliquer (la copie est libre).
 *    Un voisin qui passe devant ou derrière lui échange son `z` avec le sien :
 *    l'ordre relatif est le geste du voisin, la géométrie du verrouillé reste.
 *  · Le texte reste du TEXTE : aucune opération ne change le type d'un calque
 *    ni ne remplace un texte par une image.
 *  · Les SOURCES ne sont jamais modifiées : `assetId`, `sourceWidth`,
 *    `sourceHeight` et `mask` d'un calque image sont recopiés tels quels ; seul
 *    le placement (transformations réversibles) change.
 *  · Aucune opération ne touche autre chose que le document : un changement de
 *    texte, de police ou de position n'appelle aucun modèle d'image
 *    (`impactEdition` le calcule avec le graphe L1 · composition et export
 *    seulement).
 *  · Géométrie déterministe : position et taille au pixel entier, rotation au
 *    dixième de degré, opacité au centième (cahier §7 : pixels du document
 *    source, origine haut gauche, degrés, `z` entier explicite).
 */

import {
  validerDocument, estIdStable,
  type CalqueForme, type CalqueImage, type CalqueLogo, type CalqueStudio, type CalqueTexte,
  type ContenuVersion, type DocumentStudio, type ViolationStudio,
} from '../document';
import type { ChangementPatch } from '../patch';
import { calculerPlanImpact, generationsDuPlan } from '../impact';
import { patchDocument, calquesParZ } from './patch-document';
import { POLICE_PAR_DEFAUT, policeEditeur, tailleSelonLargeur } from './formats';

export type CodeRefusCalque = 'CALQUE_INTROUVABLE' | 'CALQUE_VERROUILLE' | 'TYPE_INCOMPATIBLE' | 'VALEUR_INVALIDE' | 'DOCUMENT_INVALIDE';

export type ResultatOperation =
  | { ok: true; document: DocumentStudio; changes: ChangementPatch[]; libelle: string; calqueId: string | null }
  | { ok: false; code: CodeRefusCalque; message: string; violations: ViolationStudio[] };

const Z_MAX = 1_000_000;
const NOM_MAX = 200;
/** Décalage d'une copie · visible sans masquer l'original. */
export const DECALAGE_COPIE_PX = 24;

/* ─────────────────────────────── Outils ──────────────────────────────────── */

const fini = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const arrondiPx = (n: number) => Math.round(n);
export const arrondiDegres = (n: number) => Math.round(n * 10) / 10;
export const arrondiOpacite = (n: number) => Math.min(1, Math.max(0, Math.round(n * 100) / 100));

function refus(code: CodeRefusCalque, message: string, violations: ViolationStudio[] = []): ResultatOperation {
  return { ok: false, code, message, violations };
}

function lireCalque(doc: DocumentStudio, id: string): CalqueStudio | null {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(doc.layers, id) ? doc.layers[id]! : null;
}

const VERROU = 'Ce calque est verrouillé · déverrouille-le pour le modifier.';
const INTROUVABLE = 'Ce calque n’existe plus dans le document · choisis-en un autre.';

/** Nouveau document · seuls les calques donnés changent (partage des autres, rien n'est muté). */
function avecCalques(doc: DocumentStudio, calques: Record<string, CalqueStudio | null>, fonts?: DocumentStudio['fonts']): DocumentStudio {
  const layers: Record<string, CalqueStudio> = { ...doc.layers };
  for (const [id, c] of Object.entries(calques)) {
    if (c === null) delete layers[id];
    else layers[id] = c;
  }
  return { ...doc, layers, fonts: fonts ?? doc.fonts };
}

function conclure(avant: DocumentStudio, apres: DocumentStudio, libelle: string, calqueId: string | null): ResultatOperation {
  // L8-C · un document hérité déjà au-delà des limites peut toujours DESCENDRE : la base est passée.
  const v = validerDocument(apres, '/document', { base: avant });
  if (v.length) return refus('DOCUMENT_INVALIDE', 'La modification rendrait le document invalide · rien n’a changé.', v);
  return { ok: true, document: apres, changes: patchDocument(avant, apres, libelle), libelle, calqueId };
}

/** Prochain identifiant libre `<prefixe>_<n>` · déterministe, jamais purement numérique. */
export function prochainIdCalque(doc: DocumentStudio, prefixe: string): string {
  for (let n = 1; ; n++) {
    const id = `${prefixe}_${n}`;
    if (!Object.prototype.hasOwnProperty.call(doc.layers, id)) return id;
  }
}

function zMax(doc: DocumentStudio): number {
  const zs = Object.values(doc.layers).map((l) => l.z);
  return zs.length ? Math.max(...zs) : -1;
}

/** `z` au-dessus de tout · renumérote (ordre conservé) si la borne serait dépassée. */
function zAuDessus(doc: DocumentStudio): { doc: DocumentStudio; z: number } {
  const m = zMax(doc);
  if (m + 1 <= Z_MAX) return { doc, z: m + 1 };
  const renum: Record<string, CalqueStudio> = {};
  calquesParZ(doc).forEach((l, i) => { renum[l.id] = { ...l, z: i }; });
  const d = { ...doc, layers: renum };
  return { doc: d, z: Object.keys(renum).length };
}

const nomBorne = (s: string) => s.trim().slice(0, NOM_MAX);

const PREFIXES: Readonly<Record<CalqueStudio['kind'], string>> = { text: 'texte', shape: 'forme', image: 'image', logo: 'logo' };

/* ───────────────────────────── Ajouter ───────────────────────────────────── */

export interface OptionsTexte { texte?: string; fontId?: string }

/** Ajoute un calque texte centré, au-dessus de tout, dans une police fournie. */
export function ajouterTexte(doc: DocumentStudio, o: OptionsTexte = {}): ResultatOperation {
  const fontId = o.fontId ?? POLICE_PAR_DEFAUT;
  const police = policeEditeur(fontId);
  if (!police && !Object.prototype.hasOwnProperty.call(doc.fonts, fontId)) return refus('VALEUR_INVALIDE', 'Police inconnue · choisis une police fournie.');
  const fonts = police && !(fontId in doc.fonts) ? { ...doc.fonts, [fontId]: { family: police.family, assetId: null } } : doc.fonts;
  const { doc: base, z } = zAuDessus(doc);
  const id = prochainIdCalque(base, PREFIXES.text);
  const n = id.split('_')[1];
  const fontSizePx = Math.max(12, Math.round(doc.width * 0.06));
  const lineHeight = 1.2;
  const width = Math.round(doc.width * 0.8);
  const height = Math.round(fontSizePx * lineHeight * 2);
  const c: CalqueTexte = {
    id, kind: 'text', name: `Texte ${n}`, visible: true, locked: false,
    x: Math.round((doc.width - width) / 2), y: Math.round((doc.height - height) / 2), width, height,
    rotationDeg: 0, opacity: 1, z,
    text: (o.texte ?? 'Votre texte').slice(0, 5000), fontId, fontSizePx, color: '#111111', align: 'center', lineHeight,
  };
  return conclure(doc, avecCalques(base, { [id]: c }, fonts), `Ajouter « ${c.name} »`, id);
}

/** Ajoute un rectangle ou une ellipse, au-dessus de tout. */
export function ajouterForme(doc: DocumentStudio, forme: CalqueForme['shape'] = 'rect', fill = '#ff5c8a'): ResultatOperation {
  if (forme !== 'rect' && forme !== 'ellipse') return refus('VALEUR_INVALIDE', 'Forme inconnue · rectangle ou ellipse.');
  const { doc: base, z } = zAuDessus(doc);
  const id = prochainIdCalque(base, PREFIXES.shape);
  const width = Math.round(doc.width * (forme === 'rect' ? 0.6 : 0.4));
  const height = forme === 'rect' ? Math.round(doc.height * 0.12) : width;
  const c: CalqueForme = {
    id, kind: 'shape', name: `${forme === 'rect' ? 'Rectangle' : 'Ellipse'} ${id.split('_')[1]}`, visible: true, locked: false,
    x: Math.round((doc.width - width) / 2), y: Math.round((doc.height - height) / 2), width, height,
    rotationDeg: 0, opacity: 1, z, shape: forme, fill: fill.toLowerCase(),
  };
  return conclure(doc, avecCalques(base, { [id]: c }), `Ajouter « ${c.name} »`, id);
}

export interface MediaAAjouter {
  kind: 'image' | 'logo';
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  nom: string;
}

/**
 * Pose un média EXISTANT (référencé par son identifiant, jamais copié) · une
 * image tient entière dans le document, un logo prend 20 % de la largeur.
 * Proportions de la source conservées.
 */
export function ajouterMedia(doc: DocumentStudio, m: MediaAAjouter): ResultatOperation {
  if (m.kind !== 'image' && m.kind !== 'logo') return refus('VALEUR_INVALIDE', 'Type de média inconnu · image ou logo.');
  if (!estIdStable(m.assetId)) return refus('VALEUR_INVALIDE', 'Média inconnu · choisis un média du projet.');
  if (!Number.isInteger(m.sourceWidth) || !Number.isInteger(m.sourceHeight) || m.sourceWidth < 1 || m.sourceHeight < 1) {
    return refus('VALEUR_INVALIDE', 'Les dimensions de ce média sont inconnues · il ne peut pas être placé sans déformation.');
  }
  const { doc: base, z } = zAuDessus(doc);
  const id = prochainIdCalque(base, PREFIXES[m.kind]);
  const echelle = Math.min(doc.width / m.sourceWidth, doc.height / m.sourceHeight);
  const t = m.kind === 'logo'
    ? tailleSelonLargeur(doc.width, 0.2, m.sourceWidth, m.sourceHeight)
    : { width: Math.max(1, Math.round(m.sourceWidth * echelle)), height: Math.max(1, Math.round(m.sourceHeight * echelle)) };
  const commun = {
    id, name: nomBorne(m.nom) || (m.kind === 'logo' ? 'Logo' : 'Image'), visible: true, locked: false,
    x: Math.round((doc.width - t.width) / 2), y: Math.round((doc.height - t.height) / 2), width: t.width, height: t.height,
    rotationDeg: 0, opacity: 1, z,
  };
  const c: CalqueImage | CalqueLogo = m.kind === 'logo'
    ? { ...commun, kind: 'logo', assetId: m.assetId }
    : { ...commun, kind: 'image', assetId: m.assetId, sourceWidth: m.sourceWidth, sourceHeight: m.sourceHeight, mask: null };
  return conclure(doc, avecCalques(base, { [id]: c }), `Ajouter « ${c.name} »`, id);
}

/* ─────────────────────── Nom, visibilité, verrou ─────────────────────────── */

export function renommerCalque(doc: DocumentStudio, id: string, nom: string): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  const n = typeof nom === 'string' ? nomBorne(nom) : '';
  if (!n) return refus('VALEUR_INVALIDE', 'Un calque a besoin d’un nom · écris au moins un caractère.');
  return conclure(doc, avecCalques(doc, { [id]: { ...c, name: n } }), `Renommer « ${c.name} »`, id);
}

export function definirVisibilite(doc: DocumentStudio, id: string, visible: boolean): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  return conclure(doc, avecCalques(doc, { [id]: { ...c, visible: visible === true } }), `${visible ? 'Afficher' : 'Masquer'} « ${c.name} »`, id);
}

export function definirVerrou(doc: DocumentStudio, id: string, locked: boolean): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  return conclure(doc, avecCalques(doc, { [id]: { ...c, locked: locked === true } }), `${locked ? 'Verrouiller' : 'Déverrouiller'} « ${c.name} »`, id);
}

/* ──────────────────── Dupliquer, supprimer, réordonner ───────────────────── */

/** Copie libre (non verrouillée), décalée, au-dessus de tout · l'original ne bouge pas. */
export function dupliquerCalque(doc: DocumentStudio, id: string): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  const { doc: base, z } = zAuDessus(doc);
  const nouvelId = prochainIdCalque(base, PREFIXES[c.kind]);
  const copie = JSON.parse(JSON.stringify(c)) as CalqueStudio;
  const d: CalqueStudio = {
    ...copie, id: nouvelId, name: `${c.name} · copie`.slice(0, NOM_MAX), locked: false,
    x: c.x + DECALAGE_COPIE_PX, y: c.y + DECALAGE_COPIE_PX, z,
  };
  return conclure(doc, avecCalques(base, { [nouvelId]: d }), `Dupliquer « ${c.name} »`, nouvelId);
}

export function supprimerCalque(doc: DocumentStudio, id: string): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (c.locked) return refus('CALQUE_VERROUILLE', VERROU);
  return conclure(doc, avecCalques(doc, { [id]: null }), `Supprimer « ${c.name} »`, null);
}

export type SensOrdre = 'monter' | 'descendre' | 'premier-plan' | 'arriere-plan';

/**
 * Change l'ordre d'empilement · `monter`/`descendre` échangent le `z` avec le
 * voisin direct, `premier-plan`/`arriere-plan` passent au-dessus/au-dessous de
 * tout. Déjà au bout : document inchangé, patch vide.
 */
export function reordonnerCalque(doc: DocumentStudio, id: string, sens: SensOrdre): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (c.locked) return refus('CALQUE_VERROUILLE', VERROU);
  const pile = calquesParZ(doc);
  const i = pile.findIndex((l) => l.id === id);
  const libelle = { monter: 'Monter', descendre: 'Descendre', 'premier-plan': 'Passer au premier plan', 'arriere-plan': 'Passer à l’arrière-plan' }[sens];
  if (!libelle) return refus('VALEUR_INVALIDE', 'Sens inconnu · monter, descendre, premier plan ou arrière-plan.');
  const haut = i === pile.length - 1;
  const bas = i === 0;
  if (((sens === 'monter' || sens === 'premier-plan') && haut) || ((sens === 'descendre' || sens === 'arriere-plan') && bas)) {
    return { ok: true, document: doc, changes: [], libelle: `${libelle} « ${c.name} »`, calqueId: id };
  }
  if (sens === 'monter' || sens === 'descendre') {
    const v = pile[sens === 'monter' ? i + 1 : i - 1]!;
    return conclure(doc, avecCalques(doc, { [c.id]: { ...c, z: v.z }, [v.id]: { ...v, z: c.z } }), `${libelle} « ${c.name} »`, id);
  }
  if (sens === 'premier-plan') {
    const { doc: base, z } = zAuDessus(doc);
    const cc = base.layers[id]!;
    return conclure(doc, avecCalques(base, { [id]: { ...cc, z } }), `${libelle} « ${c.name} »`, id);
  }
  const zMin = Math.min(...pile.map((l) => l.z));
  if (zMin - 1 >= -Z_MAX) return conclure(doc, avecCalques(doc, { [id]: { ...c, z: zMin - 1 } }), `${libelle} « ${c.name} »`, id);
  const renum: Record<string, CalqueStudio> = {};
  [c, ...pile.filter((l) => l.id !== id)].forEach((l, k) => { renum[l.id] = { ...l, z: k }; });
  return conclure(doc, { ...doc, layers: renum }, `${libelle} « ${c.name} »`, id);
}

/* ───────────────────────── Transformer, aligner ──────────────────────────── */

export interface Transformation {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotationDeg?: number;
  opacity?: number;
}

function libelleTransformation(t: Transformation, nom: string): string {
  const k = Object.keys(t);
  if (k.every((x) => x === 'x' || x === 'y')) return `Déplacer « ${nom} »`;
  if (k.every((x) => x === 'width' || x === 'height' || x === 'x' || x === 'y')) return `Redimensionner « ${nom} »`;
  if (k.length === 1 && k[0] === 'rotationDeg') return `Pivoter « ${nom} »`;
  if (k.length === 1 && k[0] === 'opacity') return `Opacité de « ${nom} »`;
  return `Transformer « ${nom} »`;
}

/** Valeurs EXACTES, arrondies selon la règle du module · refus si verrouillé ou valeur non finie. */
export function transformerCalque(doc: DocumentStudio, id: string, t: Transformation): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (c.locked) return refus('CALQUE_VERROUILLE', VERROU);
  const propre: Transformation = {};
  for (const k of ['x', 'y', 'width', 'height', 'rotationDeg', 'opacity'] as const) {
    if (t[k] === undefined) continue;
    if (!fini(t[k])) return refus('VALEUR_INVALIDE', 'Valeur numérique attendue · corrige le champ puis réessaie.');
    propre[k] = t[k];
  }
  if ((propre.width !== undefined && propre.width < 1) || (propre.height !== undefined && propre.height < 1)) {
    return refus('VALEUR_INVALIDE', 'Largeur et hauteur doivent valoir au moins 1 pixel.');
  }
  if (propre.opacity !== undefined && (propre.opacity < 0 || propre.opacity > 1)) return refus('VALEUR_INVALIDE', 'L’opacité va de 0 à 100 %.');
  const n: CalqueStudio = { ...c };
  if (propre.x !== undefined) n.x = arrondiPx(propre.x);
  if (propre.y !== undefined) n.y = arrondiPx(propre.y);
  if (propre.width !== undefined) n.width = Math.max(1, arrondiPx(propre.width));
  if (propre.height !== undefined) n.height = Math.max(1, arrondiPx(propre.height));
  if (propre.rotationDeg !== undefined) n.rotationDeg = arrondiDegres(propre.rotationDeg);
  if (propre.opacity !== undefined) n.opacity = arrondiOpacite(propre.opacity);
  return conclure(doc, avecCalques(doc, { [id]: n }), libelleTransformation(propre, c.name), id);
}

/**
 * Largeur = `part` × largeur du document, proportions conservées (celles de la
 * SOURCE pour une image, celles du calque sinon), centre conservé. Tolérance :
 * l'arrondi au pixel entier (IMG-05).
 */
export function redimensionnerSelonDocument(doc: DocumentStudio, id: string, part: number): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (!fini(part) || part <= 0 || part > 4) return refus('VALEUR_INVALIDE', 'Part de la largeur attendue entre 1 et 400 %.');
  const [sw, sh] = c.kind === 'image' ? [c.sourceWidth, c.sourceHeight] : [c.width, c.height];
  const t = tailleSelonLargeur(doc.width, part, sw, sh);
  const cx = c.x + c.width / 2;
  const cy = c.y + c.height / 2;
  return transformerCalque(doc, id, { width: t.width, height: t.height, x: cx - t.width / 2, y: cy - t.height / 2 });
}

export type ModeAlignement = 'gauche' | 'centre-horizontal' | 'droite' | 'haut' | 'centre-vertical' | 'bas';

/**
 * Aligne la boîte du calque sur le document. La boîte est celle AVANT rotation
 * (la rotation se fait autour du centre) : un centrage est exact quelle que soit
 * la rotation, un alignement sur un bord l'est pour un calque non pivoté.
 */
export function alignerCalque(doc: DocumentStudio, id: string, mode: ModeAlignement): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (c.locked) return refus('CALQUE_VERROUILLE', VERROU);
  const t: Transformation = {};
  switch (mode) {
    case 'gauche': t.x = 0; break;
    case 'centre-horizontal': t.x = (doc.width - c.width) / 2; break;
    case 'droite': t.x = doc.width - c.width; break;
    case 'haut': t.y = 0; break;
    case 'centre-vertical': t.y = (doc.height - c.height) / 2; break;
    case 'bas': t.y = doc.height - c.height; break;
    default: return refus('VALEUR_INVALIDE', 'Alignement inconnu.');
  }
  const r = transformerCalque(doc, id, t);
  return r.ok ? { ...r, libelle: `Aligner « ${c.name} »`, changes: r.changes.map((x) => ({ ...x, reason: `Aligner « ${c.name} »` })) } : r;
}

/* ─────────────────────────────── Texte ───────────────────────────────────── */

export interface ModificationTexte {
  text?: string;
  fontId?: string;
  fontSizePx?: number;
  color?: string;
  align?: CalqueTexte['align'];
  lineHeight?: number;
}

const COULEUR = /^#[0-9a-fA-F]{6}$/;

/**
 * Contenu, police, taille, couleur, alignement, interligne · le calque RESTE un
 * calque texte (jamais rasterisé). Une police fournie absente du document y est
 * déclarée.
 */
export function modifierTexte(doc: DocumentStudio, id: string, m: ModificationTexte): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (c.kind !== 'text') return refus('TYPE_INCOMPATIBLE', 'Ce calque n’est pas un texte.');
  if (c.locked) return refus('CALQUE_VERROUILLE', VERROU);
  const n: CalqueTexte = { ...c };
  let fonts = doc.fonts;
  if (m.text !== undefined) {
    if (typeof m.text !== 'string' || m.text.length > 5000) return refus('VALEUR_INVALIDE', 'Texte de 5 000 caractères au plus.');
    n.text = m.text;
  }
  if (m.fontId !== undefined) {
    const police = policeEditeur(m.fontId);
    if (!police && !Object.prototype.hasOwnProperty.call(doc.fonts, m.fontId)) return refus('VALEUR_INVALIDE', 'Police inconnue · choisis une police fournie.');
    if (police && !(m.fontId in doc.fonts)) fonts = { ...doc.fonts, [m.fontId]: { family: police.family, assetId: null } };
    n.fontId = m.fontId;
  }
  if (m.fontSizePx !== undefined) {
    if (!fini(m.fontSizePx) || m.fontSizePx < 1 || m.fontSizePx > 2000) return refus('VALEUR_INVALIDE', 'Taille de police entre 1 et 2 000 pixels.');
    n.fontSizePx = Math.round(m.fontSizePx);
  }
  if (m.color !== undefined) {
    if (typeof m.color !== 'string' || !COULEUR.test(m.color)) return refus('VALEUR_INVALIDE', 'Couleur au format #RRGGBB attendue.');
    n.color = m.color.toLowerCase();
  }
  if (m.align !== undefined) {
    if (m.align !== 'left' && m.align !== 'center' && m.align !== 'right') return refus('VALEUR_INVALIDE', 'Alignement gauche, centre ou droite.');
    n.align = m.align;
  }
  if (m.lineHeight !== undefined) {
    if (!fini(m.lineHeight) || m.lineHeight < 0.5 || m.lineHeight > 4) return refus('VALEUR_INVALIDE', 'Interligne entre 0,5 et 4.');
    n.lineHeight = Math.round(m.lineHeight * 100) / 100;
  }
  const k = Object.keys(m);
  const libelle = k.length === 1 && k[0] === 'text' ? `Modifier le texte de « ${c.name} »` : `Typographie de « ${c.name} »`;
  return conclure(doc, avecCalques(doc, { [id]: n }, fonts), libelle, id);
}

export function modifierRemplissage(doc: DocumentStudio, id: string, fill: string): ResultatOperation {
  const c = lireCalque(doc, id);
  if (!c) return refus('CALQUE_INTROUVABLE', INTROUVABLE);
  if (c.kind !== 'shape') return refus('TYPE_INCOMPATIBLE', 'Ce calque n’est pas une forme.');
  if (c.locked) return refus('CALQUE_VERROUILLE', VERROU);
  if (typeof fill !== 'string' || !COULEUR.test(fill)) return refus('VALEUR_INVALIDE', 'Couleur au format #RRGGBB attendue.');
  return conclure(doc, avecCalques(doc, { [id]: { ...c, fill: fill.toLowerCase() } }), `Couleur de « ${c.name} »`, id);
}

/* ─────────────────────────────── Impact ──────────────────────────────────── */

export interface ImpactEdition {
  /** Sorties PAYANTES à refaire (images, clips, voix, fiches) · vide pour une édition de calques. */
  generations: string[];
  /** Calculs déterministes à refaire (composition, export). */
  recalculs: string[];
}

/**
 * Ce que coûte une édition du document, selon le graphe L1 (`impact.ts`) :
 * le contenu de la version avec son document remplacé par le document édité.
 */
export function impactEdition(contenu: ContenuVersion, documentApres: DocumentStudio): ImpactEdition {
  const plan = calculerPlanImpact(contenu, { ...contenu, document: documentApres });
  return {
    generations: generationsDuPlan(plan),
    recalculs: plan.aRefaire.filter((n) => n.nature === 'calcul').map((n) => n.id),
  };
}
