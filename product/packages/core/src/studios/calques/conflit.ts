/**
 * Studios · éditeur de calques · statut d'enregistrement et conflit de version.
 *
 * Pur. Le serveur refuse d'écraser (409 `VERSION_CONFLICT`, différences base →
 * courante). L'éditeur offre alors deux choix, jamais un écrasement :
 *
 *  · recharger la version courante (mes modifications restent dans la
 *    sauvegarde locale de l'appareil) ;
 *  · recharger ET réappliquer mes modifications, seulement si aucun champ que
 *    j'ai touché n'a été touché par l'autre session (`reappliquerModifications`).
 *    Pas de fusion d'un même champ : le cahier §10 demande de « choisir/fusionner
 *    les champs non conflictuels », pas de CRDT.
 */

import { validerDocument, type DocumentStudio, type ViolationStudio } from '../document';
import { appliquerPatch, cheminsDifferents, type ChangementPatch } from '../patch';
import { patchDocument, memeValeur, RACINE_DOCUMENT } from './patch-document';
import { policeEditeur } from './formats';

/* ───────────────────────────── Statut ────────────────────────────────────── */

export type EtatEnregistrement = 'vide' | 'enregistre' | 'modifie' | 'enregistrement' | 'conflit' | 'erreur';

export interface StatutEnregistrement {
  etat: EtatEnregistrement;
  /** Mots affichés · le statut n'est jamais porté par la seule couleur. */
  libelle: string;
}

/**
 * L'état affiché à côté du bouton « Enregistrer ». `base` = document de la
 * version chargée ; `present` = document édité.
 */
export function statutEnregistrement(o: {
  base: DocumentStudio | null;
  present: DocumentStudio | null;
  enCours: boolean;
  conflit: boolean;
  erreur: boolean;
}): StatutEnregistrement {
  if (o.conflit) return { etat: 'conflit', libelle: 'Conflit · une autre session a enregistré' };
  if (o.enCours) return { etat: 'enregistrement', libelle: 'Enregistrement…' };
  if (o.present === null) return { etat: 'vide', libelle: 'Aucun document' };
  const modifie = o.base === null || !memeValeur(o.base, o.present);
  if (o.erreur && modifie) return { etat: 'erreur', libelle: 'Échec de l’enregistrement · modifications conservées' };
  return modifie
    ? { etat: 'modifie', libelle: 'Modifications non enregistrées' }
    : { etat: 'enregistre', libelle: 'Enregistré' };
}

/* ─────────────────────────── Réapplication ───────────────────────────────── */

const segments = (ch: string) => (ch === '' || ch === '/' ? [] : ch.slice(1).split('/'));
function lies(a: string, b: string): boolean {
  const x = segments(a);
  const y = segments(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
  return true;
}

export type ResultatReapplication =
  | { ok: true; document: DocumentStudio; changes: ChangementPatch[] }
  | { ok: false; conflits: string[]; violations: ViolationStudio[] };

/**
 * Rejoue sur `courant` ce que j'ai changé entre `base` et `mien`. Refus si un
 * de mes chemins recoupe un chemin changé par l'autre session (même champ, ou
 * l'un contient l'autre), ou si le résultat n'est pas un document valide (deux
 * calques ajoutés au même ordre d'empilement, par exemple).
 */
export function reappliquerModifications(base: DocumentStudio | null, mien: DocumentStudio, courant: DocumentStudio | null): ResultatReapplication {
  if (base === null || courant === null) {
    if (base === null && courant === null) return { ok: true, document: mien, changes: patchDocument(null, mien) };
    return { ok: false, conflits: [RACINE_DOCUMENT], violations: [] };
  }
  const miens = patchDocument(base, mien);
  if (miens.length === 0) return { ok: true, document: courant, changes: [] };
  const leurs = cheminsDifferents(base, courant).map((c) => `${RACINE_DOCUMENT}${c}`);
  const conflits = [...new Set(miens.map((c) => c.path).filter((p) => leurs.some((l) => lies(p, l))))];
  if (conflits.length) return { ok: false, conflits, violations: [] };
  const r = appliquerPatch({ document: courant }, miens, [RACINE_DOCUMENT]);
  if (!r.ok) return { ok: false, conflits: r.violations.map((v) => v.chemin), violations: r.violations };
  const doc = r.resultat.document;
  const v = validerDocument(doc);
  if (v.length) return { ok: false, conflits: v.map((x) => x.chemin), violations: v };
  return { ok: true, document: doc, changes: patchDocument(courant, doc) };
}

/* ─────────────────────────── Différences en mots ─────────────────────────── */

const CHAMPS: Readonly<Record<string, string>> = {
  x: 'position horizontale', y: 'position verticale', width: 'largeur', height: 'hauteur',
  rotationDeg: 'rotation', opacity: 'opacité', z: 'ordre d’empilement', name: 'nom',
  visible: 'visibilité', locked: 'verrou', text: 'texte', fontId: 'police', fontSizePx: 'taille du texte',
  color: 'couleur du texte', align: 'alignement du texte', lineHeight: 'interligne', fill: 'couleur de remplissage',
  shape: 'forme', assetId: 'média', sourceWidth: 'largeur de la source', sourceHeight: 'hauteur de la source', mask: 'masque',
};
const RACINES: Readonly<Record<string, string>> = {
  brief: 'Le brief', productRef: 'Le produit', styleRef: 'Le style', characterRefs: 'Les personnages',
  shots: 'Les plans', timeline: 'La timeline',
};
const ALIGN: Readonly<Record<string, string>> = { left: 'gauche', center: 'centre', right: 'droite' };

function valeurEnMots(champ: string, v: unknown): string {
  if (v === null || v === undefined) return 'absent';
  if (champ === 'visible') return v ? 'visible' : 'masqué';
  if (champ === 'locked') return v ? 'verrouillé' : 'libre';
  if (champ === 'opacity' && typeof v === 'number') return `${Math.round(v * 100)} %`;
  if (champ === 'rotationDeg' && typeof v === 'number') return `${v}°`;
  if (champ === 'align' && typeof v === 'string') return ALIGN[v] ?? v;
  if (champ === 'fontId' && typeof v === 'string') return policeEditeur(v)?.libelle ?? v;
  if (typeof v === 'number') return ['x', 'y', 'width', 'height', 'fontSizePx'].includes(champ) ? `${v} px` : String(v);
  if (typeof v === 'string') return `« ${v.length > 60 ? `${v.slice(0, 57)}…` : v} »`;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  return 'modifié';
}

const lirePointeurSimple = (ch: string) => segments(ch).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));

/**
 * Une différence du 409 en une phrase · « Calque « CTA » · position
 * horizontale : 120 px → 300 px ». `docs` sert à retrouver le nom d'un calque.
 */
export function decrireDifference(d: { chemin: string; base: unknown; courant: unknown }, docs: Array<DocumentStudio | null>): string {
  const s = lirePointeurSimple(d.chemin);
  if (s[0] !== 'document') return `${RACINES[s[0] ?? ''] ?? 'Une autre partie du projet'} a changé.`;
  if (s.length === 1) {
    if (d.base === null) return 'Un document a été créé par l’autre session.';
    if (d.courant === null) return 'Le document a été retiré par l’autre session.';
    return 'Le document entier a changé.';
  }
  if (s[1] === 'width' || s[1] === 'height') return `Format du document · ${s[1] === 'width' ? 'largeur' : 'hauteur'} : ${valeurEnMots('width', d.base)} → ${valeurEnMots('width', d.courant)}`;
  if (s[1] === 'fonts') return 'Polices du document modifiées.';
  if (s[1] === 'layers') {
    const id = s[2];
    if (!id) return 'Calques du document modifiés.';
    const nom = docs.map((x) => (x && Object.prototype.hasOwnProperty.call(x.layers, id) ? x.layers[id]!.name : null)).find((n) => n) ?? id;
    const champ = s[3];
    if (!champ) {
      if (d.base === null) return `Calque « ${nom} » ajouté.`;
      if (d.courant === null) return `Calque « ${nom} » supprimé.`;
      return `Calque « ${nom} » modifié.`;
    }
    return `Calque « ${nom} » · ${CHAMPS[champ] ?? champ} : ${valeurEnMots(champ, d.base)} → ${valeurEnMots(champ, d.courant)}`;
  }
  return 'Le document a changé.';
}

/** Les différences d'un 409 en phrases, sans doublon (un brief changé en trois champs = une phrase). */
export function decrireDifferences(diffs: ReadonlyArray<{ chemin: string; base: unknown; courant: unknown }>, docs: Array<DocumentStudio | null>): string[] {
  return [...new Set(diffs.map((d) => decrireDifference(d, docs)))];
}
