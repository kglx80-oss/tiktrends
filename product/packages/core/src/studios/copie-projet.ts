import type { ContenuVersion, DocumentStudio, PlanStudio } from './document';

/**
 * Studios · lot 8 V5 · renommer et dupliquer un projet (CA S10, menu de la
 * carte « Renommer / Dupliquer »).
 *
 * Pur. Deux règles :
 *
 *  · le TITRE · 1 à 200 caractères une fois resserré (la borne de
 *    `studio_projects.title` dans le dépôt), le même pour renommer et pour la
 *    copie ; la copie se dit « Copie de … », tronquée sans dépasser la borne ;
 *  · le CONTENU copié · la STRUCTURE du projet (brief, produit, style,
 *    identités, document et ses calques, plans), JAMAIS ce qui a été produit
 *    ou payé : un calque qui affiche un média GÉNÉRÉ ou un fichier exporté est
 *    retiré, les liens des plans vers leurs médias produits (image clé, clip,
 *    voix) sont vidés, le montage (`timeline`, fait de ces médias) n'est pas
 *    repris. Les générations, exports, variantes, tests, mesures et verdicts
 *    sont des LIGNES d'autres tables · la copie n'en crée aucune.
 */

export const TITRE_PROJET_MAX = 200;

/** Titre saisi · resserré, borné · sinon la raison. */
export function titreProjetValide(x: unknown): { ok: true; titre: string } | { ok: false; raison: string } {
  const t = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
  if (!t) return { ok: false, raison: 'Donne un nom au projet · il ne peut pas rester vide.' };
  if (t.length > TITRE_PROJET_MAX) return { ok: false, raison: `Le nom du projet tient en ${TITRE_PROJET_MAX} caractères au plus.` };
  return { ok: true, titre: t };
}

const PREFIXE_COPIE = 'Copie de ';

/** « Copie de Rentrée des clubs » · borné à la longueur d'un titre (« … » quand l'original est trop long). */
export function titreCopieProjet(titre: string): string {
  const base = titre.replace(/\s+/g, ' ').trim() || 'projet';
  const place = TITRE_PROJET_MAX - PREFIXE_COPIE.length;
  return `${PREFIXE_COPIE}${base.length > place ? `${base.slice(0, place - 1).trimEnd()}…` : base}`;
}

/** Ce que le serveur sait des médias cités · origine relue dans `studio_assets` (absent · média du catalogue ou inconnu). */
export type OrigineMediaCopie = 'upload' | 'generated' | 'legacy' | 'import' | 'render';

/** Un média PRODUIT (généré, payé) ou un fichier exporté · jamais repris par une copie. */
export const ORIGINES_PRODUITES: ReadonlySet<OrigineMediaCopie> = new Set<OrigineMediaCopie>(['generated', 'render']);

export interface BilanCopieProjet {
  /** Calques retirés parce qu'ils affichaient un média produit ou exporté. */
  calquesRetires: string[];
  /** Plans dont les liens vers leurs médias produits ont été vidés. */
  plansVides: string[];
  /** Le montage n'est pas repris (il est fait des médias produits). */
  montageRetire: boolean;
}

/** Les médias qu'un contenu cite et dont la copie doit connaître l'origine. */
export function mediasCitesCopie(c: ContenuVersion): string[] {
  const ids = new Set<string>();
  for (const l of Object.values(c.document?.layers ?? {})) {
    if (l.kind === 'image') { ids.add(l.assetId); if (l.mask) ids.add(l.mask.assetId); }
    if (l.kind === 'logo') ids.add(l.assetId);
  }
  return [...ids];
}

function documentCopie(doc: DocumentStudio, produit: (id: string) => boolean, retires: string[]): DocumentStudio {
  const layers: DocumentStudio['layers'] = {};
  for (const [id, l] of Object.entries(doc.layers)) {
    const cite = l.kind === 'image' ? [l.assetId, ...(l.mask ? [l.mask.assetId] : [])] : l.kind === 'logo' ? [l.assetId] : [];
    if (cite.some(produit)) { retires.push(id); continue; }
    layers[id] = l;
  }
  return { ...doc, layers };
}

function planCopie(p: PlanStudio, vides: string[]): PlanStudio {
  const { keyframeAssetId, clipAssetId, voiceAssetId, actualDurationMs, ...reste } = p;
  if (keyframeAssetId || clipAssetId || voiceAssetId || (actualDurationMs !== undefined && actualDurationMs !== null)) vides.push(p.shotId);
  return { ...reste };
}

/**
 * Le contenu de la version 1 d'une copie · la structure, sans rien de produit.
 * `origines` · l'origine RELUE de chaque média cité (`mediasCitesCopie`).
 */
export function contenuCopieProjet(c: ContenuVersion, origines: Readonly<Record<string, OrigineMediaCopie | undefined>>): { contenu: ContenuVersion; bilan: BilanCopieProjet } {
  const produit = (id: string) => { const o = origines[id]; return o !== undefined && ORIGINES_PRODUITES.has(o); };
  const calquesRetires: string[] = [];
  const plansVides: string[] = [];
  const byId: Record<string, PlanStudio> = {};
  for (const [id, p] of Object.entries(c.shots.byId)) byId[id] = planCopie(p, plansVides);
  return {
    contenu: {
      brief: c.brief, productRef: c.productRef, styleRef: c.styleRef, characterRefs: c.characterRefs,
      shots: { order: [...c.shots.order], byId },
      document: c.document ? documentCopie(c.document, produit, calquesRetires) : null,
      timeline: null,
    },
    bilan: { calquesRetires, plansVides, montageRetire: c.timeline !== null },
  };
}

/** La raison de la version 1 de la copie · d'où elle vient, ce qu'elle ne reprend pas. */
export function raisonCopieProjet(source: { titre: string; versionN: number }, b: BilanCopieProjet): string {
  const sans: string[] = [];
  if (b.calquesRetires.length) sans.push(`${b.calquesRetires.length} calque${b.calquesRetires.length > 1 ? 's' : ''} d’image produite retiré${b.calquesRetires.length > 1 ? 's' : ''}`);
  if (b.plansVides.length) sans.push(`médias de ${b.plansVides.length} plan${b.plansVides.length > 1 ? 's' : ''} vidés`);
  if (b.montageRetire) sans.push('montage non repris');
  return `Copie de « ${source.titre} » (version ${source.versionN}) · structure seule, sans générations, exports, tests ni mesures${sans.length ? ` · ${sans.join(' · ')}` : ''}`;
}
