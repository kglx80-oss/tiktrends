/**
 * Studios · éditeur de calques · du document édité au patch enregistré.
 *
 * Pur. L'éditeur n'envoie JAMAIS le contenu entier : il envoie le patch JSON
 * Pointer (`patch.ts`, plan 06 §8) qui mène du document de la version de base
 * au document édité. Les chemins visent des IDENTIFIANTS stables
 * (`/document/layers/l_cta/x`), jamais une position : réordonner change `z`,
 * pas l'adresse d'un calque.
 *
 * Granularité : un champ par changement (le journal d'audit et le diff d'un
 * 409 nomment alors le champ touché). Au-delà de `MAX_CHANGEMENTS_PATCH`, le
 * patch se regroupe par calque, puis par collection · jamais tronqué.
 *
 * Le serveur reste juge : il réapplique le patch (`appliquerPatch`) sur SA
 * version courante et revalide le contenu.
 */

import type { CalqueStudio, DocumentStudio } from '../document';
import { MAX_CHANGEMENTS_PATCH, type ChangementPatch } from '../patch';
import { jsonCanonique } from '../version';

export const RACINE_DOCUMENT = '/document';

const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function memeValeur(a: unknown, b: unknown): boolean {
  try { return jsonCanonique(a) === jsonCanonique(b); } catch { return false; }
}

const CHAMPS_DOCUMENT = ['width', 'height', 'colorSpace'] as const;

type Granularite = 'champ' | 'calque' | 'collection';

function construire(avant: DocumentStudio, apres: DocumentStudio, raison: string, g: Granularite): ChangementPatch[] {
  const out: ChangementPatch[] = [];
  const pose = (op: ChangementPatch['op'], path: string, v: unknown) =>
    out.push({ op, path, newValue: op === 'remove' ? null : copie(v), reason: raison });

  for (const k of CHAMPS_DOCUMENT) if (avant[k] !== apres[k]) pose('replace', `${RACINE_DOCUMENT}/${k}`, apres[k]);

  if (g === 'collection') {
    if (!memeValeur(avant.fonts, apres.fonts)) pose('replace', `${RACINE_DOCUMENT}/fonts`, apres.fonts);
    if (!memeValeur(avant.layers, apres.layers)) pose('replace', `${RACINE_DOCUMENT}/layers`, apres.layers);
    return out;
  }

  const fonts = `${RACINE_DOCUMENT}/fonts`;
  for (const id of Object.keys(avant.fonts).sort()) if (!(id in apres.fonts)) pose('remove', `${fonts}/${echapper(id)}`, null);
  for (const id of Object.keys(apres.fonts).sort()) {
    const ch = `${fonts}/${echapper(id)}`;
    if (!(id in avant.fonts)) pose('add', ch, apres.fonts[id]);
    else if (!memeValeur(avant.fonts[id], apres.fonts[id])) pose('replace', ch, apres.fonts[id]);
  }

  const layers = `${RACINE_DOCUMENT}/layers`;
  for (const id of Object.keys(avant.layers).sort()) if (!(id in apres.layers)) pose('remove', `${layers}/${echapper(id)}`, null);
  for (const id of Object.keys(apres.layers).sort()) {
    const ch = `${layers}/${echapper(id)}`;
    const a = avant.layers[id];
    const b = apres.layers[id]!;
    if (!a) { pose('add', ch, b); continue; }
    if (memeValeur(a, b)) continue;
    if (g === 'calque' || a.kind !== b.kind) { pose('replace', ch, b); continue; }
    const ra = a as unknown as Record<string, unknown>;
    const rb = b as unknown as Record<string, unknown>;
    for (const k of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
      const chk = `${ch}/${echapper(k)}`;
      if (!(k in ra)) pose('add', chk, rb[k]);
      else if (!(k in rb)) pose('remove', chk, null);
      else if (!memeValeur(ra[k], rb[k])) pose('replace', chk, rb[k]);
    }
  }
  return out;
}

/**
 * Le patch qui mène de `avant` à `apres` · vide si les deux sont égaux. Sans
 * document de base (`avant = null`), un seul `replace /document`.
 */
export function patchDocument(avant: DocumentStudio | null, apres: DocumentStudio, raison = 'Éditeur de calques'): ChangementPatch[] {
  if (avant === null) return [{ op: 'replace', path: RACINE_DOCUMENT, newValue: copie(apres), reason: raison }];
  for (const g of ['champ', 'calque', 'collection'] as const) {
    const p = construire(avant, apres, raison, g);
    if (p.length <= MAX_CHANGEMENTS_PATCH) return p;
  }
  // Inatteignable : au niveau collection, cinq changements au plus.
  return construire(avant, apres, raison, 'collection');
}

/** Les calques d'un document, du dessous vers le dessus (ordre d'empilement `z`). */
export function calquesParZ(doc: DocumentStudio): CalqueStudio[] {
  return Object.values(doc.layers).sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}
