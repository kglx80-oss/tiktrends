/**
 * Studios · L5-A · détourage : capacité DÉCLARÉE et contrôle du résultat
 * (cahier 01 §11.1 « Détourage » ; recette IMG-09).
 *
 * Pur.
 *
 * ── Ce qui est disponible, dit honnêtement ───────────────────────────────────
 *
 * Aucun modèle de détourage n'est déployé : aucun poids licencié n'est embarqué,
 * aucun fournisseur de détourage n'est branché, et le cahier interdit le
 * téléchargement surprise d'un poids. La capacité est donc `disponible: false`,
 * avec sa raison et ses replis, jamais simulée. Les replis ne bloquent pas
 * l'interface : importer un PNG déjà détouré (contrôlé ci-dessous, côté
 * serveur, sans WebGPU ni thread d'interface), ou tracer un masque à la main
 * (rectangle, lasso, pinceau · `masque.ts`).
 *
 * Brancher un moteur = l'ajouter à `MOTEURS_DETOURAGE_DEPLOYES` avec sa licence,
 * dans une PR qui le prouve sur la fixture de recette.
 */

export interface MoteurDetourage { id: string; licence: string }

/** Moteurs réellement déployés · AUCUN aujourd'hui. */
export const MOTEURS_DETOURAGE_DEPLOYES: readonly MoteurDetourage[] = [];

export interface RepliDetourage { id: 'import_png_transparent' | 'masque_manuel'; libelle: string; bloquant: false }

export type CapaciteDetourage =
  | { operation: 'detourage'; disponible: true; moteur: MoteurDetourage; replis: RepliDetourage[] }
  | { operation: 'detourage'; disponible: false; raison: string; replis: RepliDetourage[] };

export const REPLIS_DETOURAGE: readonly RepliDetourage[] = [
  { id: 'import_png_transparent', libelle: 'Importer la photo produit déjà détourée (PNG avec transparence) · contrôlée à l’import', bloquant: false },
  { id: 'masque_manuel', libelle: 'Tracer la zone à la main (rectangle, lasso ou pinceau) à la résolution de la source', bloquant: false },
];

export function capaciteDetourage(moteurs: readonly MoteurDetourage[] = MOTEURS_DETOURAGE_DEPLOYES): CapaciteDetourage {
  const m = moteurs[0];
  if (m) return { operation: 'detourage', disponible: true, moteur: m, replis: [...REPLIS_DETOURAGE] };
  return {
    operation: 'detourage', disponible: false,
    raison: 'Détourage automatique indisponible · aucun modèle de détourage licencié n’est déployé. Importe une photo déjà détourée ou trace la zone à la main.',
    replis: [...REPLIS_DETOURAGE],
  };
}

/* ─────────────────────── Contrôle d'un détourage ──────────────────────── */

export interface ControleDetourage {
  pixels: number;
  transparents: number;
  opaques: number;
  /** Alpha strictement entre 0 et 255 · bords adoucis, cheveux, ombre douce. */
  partiels: number;
  /** Pixels opaques au contact d'un pixel non opaque (contour du sujet). */
  contour: number;
  /** Pixels partiels voisins d'un pixel opaque · bord anti-crénelé. */
  bordAdouci: number;
  /** Pixels partiels sans voisin opaque · ombre ou voile conservé à part. */
  ombreOuVoile: number;
  /** Le sujet opaque touche le bord de l'image (détourage possiblement tronqué). */
  toucheLeBord: boolean;
  verdict: 'exploitable' | 'a_verifier' | 'refuse';
  constats: string[];
}

/**
 * Contrôle un canal alpha décodé (un octet par pixel). Ne décide pas de la
 * QUALITÉ esthétique (cheveux mangés, halo coloré) : elle se voit, elle se
 * relit. Il refuse ce qui n'est pas un détourage, et signale ce qui doit être
 * regardé.
 */
export function controlerDetourage(alpha: Uint8Array, largeur: number, hauteur: number): ControleDetourage {
  if (alpha.length !== largeur * hauteur) throw new Error('canal alpha aux dimensions de l’image attendu');
  let transparents = 0; let opaques = 0; let partiels = 0; let contour = 0; let bordAdouci = 0; let ombre = 0;
  let toucheLeBord = false;
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= largeur || y >= hauteur ? 0 : alpha[y * largeur + x]!);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const v = alpha[y * largeur + x]!;
      if (v === 0) { transparents++; continue; }
      const voisins = [a(x - 1, y), a(x + 1, y), a(x, y - 1), a(x, y + 1)];
      if (v === 255) {
        opaques++;
        if (voisins.some((n) => n < 255)) contour++;
        if (x === 0 || y === 0 || x === largeur - 1 || y === hauteur - 1) toucheLeBord = true;
        continue;
      }
      partiels++;
      if (voisins.some((n) => n === 255)) bordAdouci++;
      else ombre++;
    }
  }
  const constats: string[] = [];
  let verdict: ControleDetourage['verdict'] = 'exploitable';
  if (transparents === 0) { verdict = 'refuse'; constats.push('aucun pixel transparent · ce n’est pas une image détourée'); }
  if (opaques === 0) { verdict = 'refuse'; constats.push('aucun pixel opaque · le sujet a disparu'); }
  if (verdict !== 'refuse') {
    if (toucheLeBord) { verdict = 'a_verifier'; constats.push('le sujet touche le bord de l’image · vérifier qu’il n’est pas coupé'); }
    if (bordAdouci === 0) { verdict = 'a_verifier'; constats.push('bords francs, sans anti-crénelage · vérifier les cheveux et les bords fins'); }
    if (ombre > 0) constats.push('transparence partielle détachée du sujet (ombre ou voile) · conservée telle quelle');
  }
  return { pixels: alpha.length, transparents, opaques, partiels, contour, bordAdouci, ombreOuVoile: ombre, toucheLeBord, verdict, constats };
}
