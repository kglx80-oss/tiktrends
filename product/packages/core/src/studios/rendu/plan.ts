/**
 * Studios · L5-A · plan de rendu d'un document (cahier 01 §11.1).
 *
 * Pur. Le compositeur serveur n'interprète rien : il exécute ce plan. Chaque
 * calque visible devient une opération aux coordonnées ENTIÈRES du document,
 * dans l'ordre d'empilement, avec, pour un texte, la mise en page déjà faite
 * (lignes et glyphes placés par les métriques embarquées).
 *
 * Refus explicites (aucune substitution) : document invalide, police non
 * embarquée, document trop grand pour la mémoire du rendu.
 *
 * Le masque d'un calque image (`mask`) ne change PAS le rendu : c'est la zone
 * d'une retouche ciblée (devis, instantané, composition stricte · `masque.ts`).
 */

import { validerDocument, type DocumentStudio, type ViolationStudio } from '../document';
import { ordreEmpilement, rectPixels, type Rect } from './geometrie';
import { policeDuDocument } from './polices';
import { mettreEnPage, type MiseEnPage } from './texte';

/**
 * Borne mémoire du rendu · 36 mégapixels (6000 × 6000, 144 Mo en RVBA). Choix de
 * capacité du serveur, pas une mesure de qualité ; un 9:16 à 2160 × 3840 tient
 * huit fois.
 */
export const PIXELS_MAX_RENDU = 36_000_000;

interface Commun { id: string; rect: Rect; rotationDeg: number; opacity: number }

export type OperationRendu =
  | (Commun & { kind: 'image'; assetId: string; sourceWidth: number; sourceHeight: number })
  | (Commun & { kind: 'logo'; assetId: string })
  | (Commun & { kind: 'shape'; forme: 'rect' | 'ellipse'; fill: string })
  | (Commun & { kind: 'text'; color: string; famille: string; fichier: string; miseEnPage: MiseEnPage });

export type PlanRendu =
  | { ok: true; largeur: number; hauteur: number; operations: OperationRendu[]; assets: string[]; avertissements: string[] }
  | { ok: false; violations: ViolationStudio[] };

export function planRendu(doc: DocumentStudio): PlanRendu {
  const violations = validerDocument(doc);
  if (violations.length) return { ok: false, violations };
  if (doc.width * doc.height > PIXELS_MAX_RENDU) {
    return { ok: false, violations: [{ chemin: '/document', raison: `document trop grand pour le rendu (${PIXELS_MAX_RENDU} pixels au plus)` }] };
  }
  const operations: OperationRendu[] = [];
  const assets = new Set<string>();
  const avertissements: string[] = [];
  for (const l of ordreEmpilement(doc)) {
    const commun: Commun = { id: l.id, rect: rectPixels(l), rotationDeg: l.rotationDeg, opacity: l.opacity };
    if (l.opacity === 0) continue;
    if (l.kind === 'image') {
      assets.add(l.assetId);
      operations.push({ ...commun, kind: 'image', assetId: l.assetId, sourceWidth: l.sourceWidth, sourceHeight: l.sourceHeight });
    } else if (l.kind === 'logo') {
      assets.add(l.assetId);
      operations.push({ ...commun, kind: 'logo', assetId: l.assetId });
    } else if (l.kind === 'shape') {
      operations.push({ ...commun, kind: 'shape', forme: l.shape, fill: l.fill });
    } else {
      const p = policeDuDocument(doc.fonts, l.fontId);
      if (!p.ok) return { ok: false, violations: [{ chemin: `/document/layers/${l.id}/fontId`, raison: p.raison }] };
      const r = commun.rect;
      const mep = mettreEnPage({ ...l, width: r.width, height: r.height }, p.metriques);
      if (mep.deborde) avertissements.push(`${l.id} · le texte déborde de son cadre`);
      if (mep.nonCouverts.length) avertissements.push(`${l.id} · caractères absents de la police (dessinés en boîte vide) : ${mep.nonCouverts.map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}`);
      operations.push({ ...commun, kind: 'text', color: l.color, famille: p.famille, fichier: p.metriques.fichier, miseEnPage: mep });
    }
  }
  return { ok: true, largeur: doc.width, hauteur: doc.height, operations, assets: [...assets].sort(), avertissements };
}
