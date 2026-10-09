/**
 * Studios · L8-C · jeux SYNTHÉTIQUES déterministes pour la mesure (UX-06).
 *
 * Pur. Une graine donne toujours le même contenu, au caractère près : deux
 * mesures sur deux machines lisent le même document. Aucun média réel, aucune
 * donnée de marque : des identifiants `a_synth_*`, des textes tirés d'une
 * liste fixe, des géométries entières dans le cadre.
 *
 * Deux échelles, celles du cahier (UX-06) :
 *  · `petit` · 20 plans, 100 calques ;
 *  · `grand` · 200 plans, 1000 calques.
 * Les deux contenus sont VALIDES (`validerContenuVersion`) : on mesure le
 * chemin réel, pas un refus précoce.
 */

import type {
  CalqueStudio, ContenuVersion, DocumentStudio, ModeParole, PlanStudio,
} from '../document';
import { timelineDesPlans } from '../video/timeline';

/** Générateur pseudo-aléatoire mulberry32 · 32 bits, reproductible. */
export function aleatoireDeterministe(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTS = [
  'peau', 'nette', 'sérum', 'éclat', 'matin', 'routine', 'douceur', 'texture', 'résultat', 'jours',
  'flacon', 'goutte', 'lumière', 'miroir', 'sourire', 'confiance', 'naturel', 'formule', 'testé', 'offre',
];
const COULEURS = ['#111111', '#ffffff', '#ff5c8a', '#1c121b', '#f6eef4', '#2a6f97', '#e9c46a', '#264653'];

/** Échelles du cahier · UX-06. */
export const ECHELLES_SYNTHETIQUES = {
  petit: { plans: 20, calques: 100 },
  grand: { plans: 200, calques: 1000 },
} as const;
export type EchelleSynthetique = keyof typeof ECHELLES_SYNTHETIQUES;

/** Médias distincts du document · un document réel réutilise quelques visuels. */
export const MEDIAS_SYNTHETIQUES = 8;
export const idMediaSynthetique = (i: number) => `a_synth_${i}`;
/** Dimensions source du média `i` · entières, stables. */
export function dimensionsMediaSynthetique(i: number): { largeur: number; hauteur: number } {
  return { largeur: 400 + (i % 4) * 100, hauteur: 300 + (i % 3) * 150 };
}

function phrase(r: () => number, min: number, max: number): string {
  const n = min + Math.floor(r() * (max - min + 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(MOTS[Math.floor(r() * MOTS.length)]!);
  return out.join(' ');
}

const entre = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

/**
 * Document à `calques` calques · 40 % texte, 30 % forme, 20 % image, 10 % logo
 * (proportions d'une composition publicitaire chargée). `z` = rang, unique.
 */
export function documentSynthetique(calques: number, graine = 1, format = { largeur: 1080, hauteur: 1920 }): DocumentStudio {
  const r = aleatoireDeterministe(graine);
  const layers: Record<string, CalqueStudio> = {};
  for (let i = 0; i < calques; i++) {
    const w = entre(r, 40, Math.floor(format.largeur / 2));
    const h = entre(r, 30, Math.floor(format.hauteur / 4));
    const base = {
      name: `Calque ${i + 1}`, visible: r() > 0.05, locked: r() < 0.1,
      x: entre(r, 0, format.largeur - w), y: entre(r, 0, format.hauteur - h), width: w, height: h,
      rotationDeg: r() < 0.1 ? entre(r, -30, 30) : 0, opacity: r() < 0.2 ? Math.round(r() * 100) / 100 : 1, z: i,
    };
    const tirage = r();
    if (tirage < 0.4) {
      const id = `texte_${i + 1}`;
      layers[id] = {
        id, kind: 'text', ...base, text: phrase(r, 2, 12), fontId: r() < 0.5 ? 'f_sans' : 'f_gras',
        fontSizePx: entre(r, 16, 72), color: COULEURS[entre(r, 0, COULEURS.length - 1)]!, align: (['left', 'center', 'right'] as const)[entre(r, 0, 2)]!, lineHeight: 1.2,
      };
    } else if (tirage < 0.7) {
      const id = `forme_${i + 1}`;
      layers[id] = { id, kind: 'shape', ...base, shape: r() < 0.5 ? 'rect' : 'ellipse', fill: COULEURS[entre(r, 0, COULEURS.length - 1)]! };
    } else if (tirage < 0.9) {
      const id = `image_${i + 1}`;
      const m = entre(r, 0, MEDIAS_SYNTHETIQUES - 1);
      const d = dimensionsMediaSynthetique(m);
      layers[id] = { id, kind: 'image', ...base, assetId: idMediaSynthetique(m), sourceWidth: d.largeur, sourceHeight: d.hauteur, mask: null };
    } else {
      const id = `logo_${i + 1}`;
      layers[id] = { id, kind: 'logo', ...base, assetId: idMediaSynthetique(entre(r, 0, MEDIAS_SYNTHETIQUES - 1)) };
    }
  }
  return {
    width: format.largeur, height: format.hauteur, colorSpace: 'sRGB', layers,
    fonts: { f_sans: { family: 'Sans', assetId: null }, f_gras: { family: 'Sans Bold', assetId: null } },
  };
}

const IDENTITES = ['c_lea', 'c_tom', 'c_ines'];
const PRODUIT = 'p_synth';

/** Plans `s1…sN` · narration pour les plans parlés, texte écran sur un tiers. */
export function plansSynthetiques(n: number, graine = 1): PlanStudio[] {
  const r = aleatoireDeterministe(graine ^ 0x9e3779b9);
  const out: PlanStudio[] = [];
  for (let i = 0; i < n; i++) {
    const speechMode: ModeParole = r() < 0.6 ? 'voiceover' : r() < 0.5 ? 'lipsync' : 'none';
    const refs = [IDENTITES[i % IDENTITES.length]!, ...(r() < 0.4 ? [PRODUIT] : [])];
    out.push({
      shotId: `s${i + 1}`, purpose: i === 0 ? 'Accroche' : i === n - 1 ? 'Appel à l’action' : 'Preuve',
      subject: phrase(r, 3, 8), action: phrase(r, 4, 10), framing: 'plan moyen', camera: r() < 0.5 ? 'fixe' : 'travelling avant',
      lighting: 'lumière douce du matin', environment: phrase(r, 2, 6), referenceIds: refs,
      narration: speechMode === 'none' ? '' : phrase(r, 6, 18), onScreenText: r() < 0.33 ? [phrase(r, 2, 5)] : [],
      speechMode, estimatedDurationMs: entre(r, 10, 60) * 100,
    });
  }
  return out;
}

/**
 * Contenu de version synthétique · `plans` plans avec leur timeline dérivée
 * (même module que le montage réel), `calques` calques dans le document.
 * `0` plan ⇒ ni plans ni timeline ; `0` calque ⇒ aucun document.
 */
export function contenuSynthetique(o: { plans: number; calques: number; graine?: number }): ContenuVersion {
  const graine = o.graine ?? 1;
  const plans = plansSynthetiques(o.plans, graine);
  const shots = { order: plans.map((p) => p.shotId), byId: Object.fromEntries(plans.map((p) => [p.shotId, p])) };
  const c: ContenuVersion = {
    brief: { objectif: 'mesure synthétique', hypothese: 'aucune' },
    productRef: { productId: PRODUIT, assetId: 'a_synth_produit' },
    styleRef: { palette: ['#ffffff', '#ff5c8a'], lighting: 'douce' },
    characterRefs: Object.fromEntries(IDENTITES.map((id) => [id, { tenue: `tenue ${id}` }])),
    shots,
    document: o.calques > 0 ? documentSynthetique(o.calques, graine) : null,
    timeline: null,
  };
  if (o.plans > 0) c.timeline = { ...timelineDesPlans(c, null), music: { assetId: 'a_synth_musique', gainDb: -12 }, voice: { voiceId: 'v_synth' } };
  return c;
}

/** Les deux échelles du cahier, prêtes à mesurer. */
export function contenuEchelle(e: EchelleSynthetique, graine = 1): ContenuVersion {
  return contenuSynthetique({ ...ECHELLES_SYNTHETIQUES[e], graine });
}
