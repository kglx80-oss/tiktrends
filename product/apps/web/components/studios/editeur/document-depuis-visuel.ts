import { ajouterMedia, ajouterTexte, documentInitial, lireLigneTexte, validerDocument, type DocumentStudio, type FormatDocument } from '@tiktrends/core';
import type { MediaEditeur } from '../../../lib/studios/editeur/types';
/** Composition proposée sans écriture ; sauvegarde explicite par l'éditeur. */
export function documentDepuisVisuel(format: FormatDocument, media: MediaEditeur, textes: string[]): DocumentStudio {
  const fond = ajouterMedia(documentInitial(format), { kind: 'image', assetId: media.assetId, sourceWidth: media.width, sourceHeight: media.height, nom: media.nom });
  if (!fond.ok) throw new Error(fond.message);
  let doc = fond.document;
  const lignes = textes.map((t) => lireLigneTexte(t).texte).filter((t) => t.trim());
  if (lignes.length > 10 || lignes.some((t) => t.length > 5000)) throw new Error('Réduisez les textes à dix blocs de 5 000 caractères maximum.');
  for (const [i, texte] of lignes.entries()) {
    const r = ajouterTexte(doc, { texte });
    if (!r.ok || !r.calqueId) throw new Error(r.ok ? 'Calque texte absent.' : r.message);
    doc = r.document;
    const c = doc.layers[r.calqueId]!;
    if (c.kind !== 'text') throw new Error('Calque texte invalide.');
    const h = Math.round(doc.height * Math.min(0.14, 0.8 / Math.max(1, lignes.length)));
    const size = Math.max(12, Math.min(Math.round(doc.width * (i === 0 ? 0.055 : 0.035)), Math.floor(h / 2.4)));
    doc = { ...doc, layers: { ...doc.layers, [c.id]: { ...c, name: `Texte ${i + 1}`, x: Math.round(doc.width * 0.08), y: Math.round(doc.height * 0.06 + i * h), width: Math.round(doc.width * 0.84), height: h, fontSizePx: size } } };
  }
  if (validerDocument(doc).length) throw new Error('La composition proposée ne peut pas être enregistrée.');
  return doc;
}
