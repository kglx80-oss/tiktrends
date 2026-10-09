/**
 * Studios · canvas métier du projet (cahier 01 §127, UX-04).
 *
 * Pur. Le canvas n'est PAS un éditeur de workflow : ses cartes et ses liens
 * sont DÉRIVÉS du contenu de la version, jamais saisis. Un lien A → B existe
 * si et seulement si la sortie B LIT A dans le graphe d'impact
 * (`impact.ts` · `grapheImpact`) : changer A rend B obsolète. Le test
 * `l8d-canvas-noyau` le vérifie par perturbation, contre le graphe réel.
 *
 * Trois familles de cartes :
 *  · ENTRÉES · ce que l'on écrit (brief, produit, style, mise en page, voix
 *    choisie, plans) ;
 *  · GÉNÉRATIONS · ce qui coûte (fiches d'identité, images clés, voix, clips) ;
 *  · CALCULS · ce qui se recalcule sans rien générer (composition, montage,
 *    mix, sous-titres, export).
 *
 * Les colonnes sont des ÉTAPES fixes (contexte → plans → images et voix →
 * clips → assemblage → finitions → export) : tout lien va strictement de gauche à
 * droite. L'ordre des cartes (la « chronologie ») est celui de la lecture du
 * canvas automatique · colonne, puis rangée. Déplacer une carte ne le change
 * pas : les positions vivent à part (`disposition.ts`), hors du contenu.
 */

import type { ContenuVersion, PlanStudio } from '../document';
import { styleCommun, consigneRetenueDuPlan } from '../impact';
import { ciblesDisponibles } from '../propositions/cible';
import { empreinteContenu } from '../version';

export type NatureCarteCanvas = 'entree' | 'generation' | 'calcul';

export type EtapeCanvas = 'contexte' | 'plans' | 'images' | 'clips' | 'assemblage' | 'finitions' | 'export';

/** Les étapes, dans l'ordre des colonnes. */
export const ETAPES_CANVAS: readonly EtapeCanvas[] = ['contexte', 'plans', 'images', 'clips', 'assemblage', 'finitions', 'export'];

export const LIBELLES_ETAPE_CANVAS: Readonly<Record<EtapeCanvas, string>> = {
  contexte: 'Contexte et fiches',
  plans: 'Plans',
  images: 'Images clés et voix',
  clips: 'Clips animés',
  assemblage: 'Assemblage',
  finitions: 'Mix et sous-titres',
  export: 'Export',
};

export const LIBELLES_NATURE_CANVAS: Readonly<Record<NatureCarteCanvas, string>> = {
  entree: 'Entrée',
  generation: 'Génération',
  calcul: 'Calcul',
};

/** État d'un média lié · écrit en toutes lettres, jamais porté par la seule couleur. */
export type EtatMediaCanvas = 'lie' | 'absent' | 'sans_objet';

export interface CarteCanvas {
  /** Identifiant stable · pour une sortie, celui du nœud du graphe d'impact. */
  id: string;
  nature: NatureCarteCanvas;
  etape: EtapeCanvas;
  titre: string;
  /** Une phrase · ce que la carte représente, ce qu'elle lit. */
  resume: string;
  media: EtatMediaCanvas;
  /** Le plan concerné, s'il y en a un (identifiant, jamais la position). */
  shotId: string | null;
  /** Cible du panneau Jarvis (`shot:…`, `character:…`, `brief`) · `null` si la carte n'en a pas. */
  cibleJarvis: string | null;
  /** Libellé de cette cible tel que le panneau Jarvis l'affiche. */
  libelleCibleJarvis: string | null;
}

export interface LienCanvas {
  de: string;
  vers: string;
}

export interface ModeleCanvas {
  /** Cartes dans l'ORDRE du canvas (colonne, puis rangée) · le même pour la liste. */
  cartes: CarteCanvas[];
  /** Liens dérivés, triés · jamais saisis. */
  liens: LienCanvas[];
  /** Colonne et rangée de chaque carte dans la disposition automatique. */
  grille: Record<string, { colonne: number; rangee: number }>;
  /** Étapes effectivement présentes, dans l'ordre des colonnes. */
  etapes: EtapeCanvas[];
  /** Empreinte de la STRUCTURE (cartes, ordre, liens) · indépendante des positions. */
  empreinte: string;
}

/* ─────────────────────────── Dérivation ──────────────────────────────────── */

const parle = (p: PlanStudio) => p.speechMode !== 'none' && p.narration.trim().length > 0;

const possede = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function citeProduit(p: PlanStudio, c: ContenuVersion): boolean {
  if (!c.productRef) return false;
  const refs = new Set(p.referenceIds);
  return refs.has(c.productRef.productId) || (typeof c.productRef.assetId === 'string' && refs.has(c.productRef.assetId));
}

function nomIdentite(id: string, ref: Record<string, unknown>): string {
  for (const k of ['nom', 'name', 'label', 'libelle']) {
    const v = ref[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 60);
  }
  return id;
}

const court = (s: string, n = 70) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

interface Brouillon extends CarteCanvas {
  /** Carte dont la rangée guide celle-ci (alignement des couloirs de plan). */
  principal: string | null;
  /** Décalage de rangée souhaité sous le principal (voix sous l'image clé). */
  sous: number;
}

/**
 * Le modèle du canvas d'une version · cartes, liens dérivés, grille
 * automatique. Déterministe : même contenu ⇒ même modèle, même empreinte.
 */
export function deriverCanvas(c: ContenuVersion): ModeleCanvas {
  const cibles = new Map(ciblesDisponibles(c).map((x) => [x.cible, x.libelle]));
  const cible = (k: string) => (cibles.has(k) ? { cibleJarvis: k, libelleCibleJarvis: cibles.get(k)! } : { cibleJarvis: null, libelleCibleJarvis: null });

  const cartes: Brouillon[] = [];
  const liens: LienCanvas[] = [];
  const pose = (b: Omit<Brouillon, 'cibleJarvis' | 'libelleCibleJarvis' | 'principal' | 'sous'> & { cible?: string; principal?: string | null; sous?: number }) => {
    const { cible: k, principal = null, sous = 0, ...reste } = b;
    cartes.push({ ...reste, ...(k ? cible(k) : { cibleJarvis: null, libelleCibleJarvis: null }), principal, sous });
  };
  const relie = (de: string, vers: string) => liens.push({ de, vers });

  const video = c.timeline !== null;
  const ordre = c.shots.order.filter((sid) => possede(c.shots.byId, sid));
  // Un plan présent dans `byId` mais absent de l'ordre a quand même ses sorties (le graphe d'impact les pose).
  const horsOrdre = Object.keys(c.shots.byId).filter((sid) => !ordre.includes(sid)).sort();
  const plans = [...ordre, ...horsOrdre];
  const numero = (sid: string) => {
    const i = ordre.indexOf(sid);
    return i >= 0 ? `plan ${i + 1}` : `plan ${sid}`;
  };
  const style = styleCommun(c.styleRef);
  const identites = Object.keys(c.characterRefs).sort();
  const voixPlans = plans.filter((sid) => parle(c.shots.byId[sid]!));

  // ── Entrées ─────────────────────────────────────────────────────────────
  pose({
    id: 'brief', nature: 'entree', etape: 'contexte', titre: 'Brief',
    resume: c.brief ? 'Oriente les propositions · le modifier ne rend aucune sortie obsolète.' : 'Pas encore de brief pour cette version.',
    media: 'sans_objet', shotId: null, cible: 'brief',
  });
  if (c.productRef) {
    pose({ id: 'entree:produit', nature: 'entree', etape: 'contexte', titre: 'Produit', resume: 'Lu par les images clés des plans qui le citent.', media: 'sans_objet', shotId: null });
  }
  if (style) {
    pose({ id: 'entree:style', nature: 'entree', etape: 'contexte', titre: 'Style commun', resume: 'Lu par toutes les images clés.', media: 'sans_objet', shotId: null });
  }
  if (c.document) {
    pose({ id: 'entree:document', nature: 'entree', etape: 'contexte', titre: 'Mise en page', resume: `${Object.keys(c.document.layers).length} calque(s) · lue par la composition.`, media: 'sans_objet', shotId: null });
  }
  if (video && voixPlans.length > 0) {
    pose({ id: 'entree:voix', nature: 'entree', etape: 'contexte', titre: 'Voix choisie', resume: c.timeline!.voice ? 'Lue par toutes les voix des plans.' : 'Aucune voix choisie · lue par toutes les voix des plans.', media: 'sans_objet', shotId: null });
  }
  for (const cid of identites) {
    pose({
      id: `identite:${cid}`, nature: 'generation', etape: 'contexte', titre: `Identité · ${nomIdentite(cid, c.characterRefs[cid]!)}`,
      resume: 'Fiche d’identité · lue par les images clés des plans qui la citent.', media: 'sans_objet', shotId: null, cible: `character:${cid}`,
    });
  }
  for (const sid of plans) {
    const p = c.shots.byId[sid]!;
    const quoi = court(p.purpose || p.subject || p.action || '');
    pose({
      id: `plan:${sid}`, nature: 'entree', etape: 'plans', titre: `${numero(sid).replace(/^p/, 'P')}${quoi ? ` · ${quoi}` : ''}`,
      resume: consigneRetenueDuPlan(c, sid) !== null ? 'Visuel, narration et consigne d’image retenue du plan.' : 'Visuel, narration et texte à l’écran du plan.',
      media: 'sans_objet', shotId: sid, cible: `shot:${sid}`,
    });
  }

  // ── Images clés et voix ─────────────────────────────────────────────────
  for (const sid of plans) {
    const p = c.shots.byId[sid]!;
    pose({
      id: `keyframe:${sid}`, nature: 'generation', etape: 'images', titre: `Image clé · ${numero(sid)}`,
      resume: 'Lit le visuel du plan, le style, le produit et les identités cités.',
      media: p.keyframeAssetId ? 'lie' : 'absent', shotId: sid, cible: `shot:${sid}`, principal: `plan:${sid}`,
    });
    relie(`plan:${sid}`, `keyframe:${sid}`);
    if (style) relie('entree:style', `keyframe:${sid}`);
    if (citeProduit(p, c)) relie('entree:produit', `keyframe:${sid}`);
    for (const r of [...new Set(p.referenceIds)].sort()) if (possede(c.characterRefs, r)) relie(`identite:${r}`, `keyframe:${sid}`);
    if (parle(p)) {
      pose({
        id: `voix:${sid}`, nature: 'generation', etape: 'images', titre: `Voix · ${numero(sid)}`,
        resume: p.speechMode === 'lipsync' ? 'Narration du plan, synchronisée aux lèvres.' : 'Narration du plan, en voix off.',
        media: p.voiceAssetId ? 'lie' : 'absent', shotId: sid, cible: `shot:${sid}`, principal: `plan:${sid}`, sous: 1,
      });
      relie(`plan:${sid}`, `voix:${sid}`);
      // `voix` lit `timeline.voice`, même nulle · la carte « Voix choisie » n'existe qu'en vidéo.
      if (video) relie('entree:voix', `voix:${sid}`);
    }
  }

  // ── Clips ───────────────────────────────────────────────────────────────
  if (video) {
    for (const sid of plans) {
      const p = c.shots.byId[sid]!;
      pose({
        id: `clip:${sid}`, nature: 'generation', etape: 'clips', titre: `Clip · ${numero(sid)}`,
        resume: p.speechMode === 'lipsync' && parle(p) ? 'Anime l’image clé · synchronisé à la voix du plan.' : 'Anime l’image clé du plan.',
        media: p.clipAssetId ? 'lie' : 'absent', shotId: sid, cible: `shot:${sid}`, principal: `keyframe:${sid}`,
      });
      relie(`keyframe:${sid}`, `clip:${sid}`);
      relie(`plan:${sid}`, `clip:${sid}`);
      if (p.speechMode === 'lipsync' && parle(p)) relie(`voix:${sid}`, `clip:${sid}`);
    }
  }

  // ── Assemblage, finitions, export ───────────────────────────────────────
  if (c.document) {
    pose({ id: 'composition', nature: 'calcul', etape: 'assemblage', titre: 'Composition', resume: 'Assemble les calques de la mise en page · ne génère rien.', media: 'sans_objet', shotId: null, principal: 'entree:document' });
    relie('entree:document', 'composition');
  }
  if (c.timeline) {
    const premier = ordre[0] ?? plans[0];
    pose({ id: 'montage', nature: 'calcul', etape: 'assemblage', titre: 'Montage', resume: 'Ordre des plans, clips, voix, texte à l’écran et pistes.', media: 'sans_objet', shotId: null, principal: premier ? `clip:${premier}` : null });
    // Le montage lit l'ordre et le contenu de chaque plan de l'ordre (texte écran, durée réelle).
    for (const sid of ordre) {
      relie(`plan:${sid}`, 'montage');
      relie(`clip:${sid}`, 'montage');
      if (parle(c.shots.byId[sid]!)) relie(`voix:${sid}`, 'montage');
    }
    pose({ id: 'mix', nature: 'calcul', etape: 'finitions', titre: 'Mix audio', resume: c.timeline.music ? 'Musique, gain et montage.' : 'Montage · aucune musique choisie.', media: 'sans_objet', shotId: null, principal: 'montage' });
    relie('montage', 'mix');
    if (c.timeline.subtitles.enabled) {
      pose({ id: 'sous_titres', nature: 'calcul', etape: 'finitions', titre: 'Sous-titres', resume: 'Narration des plans dans l’ordre, calée sur le montage.', media: 'sans_objet', shotId: null, principal: 'montage', sous: 1 });
      relie('montage', 'sous_titres');
      for (const sid of ordre) {
        relie(`plan:${sid}`, 'sous_titres');
        if (parle(c.shots.byId[sid]!)) relie(`voix:${sid}`, 'sous_titres');
      }
    }
  }
  if (c.document || c.timeline) {
    pose({ id: 'export', nature: 'calcul', etape: 'export', titre: 'Export', resume: 'Le fichier final · recalculé depuis l’assemblage.', media: 'sans_objet', shotId: null, principal: c.timeline ? 'montage' : 'composition' });
    if (c.document) relie('composition', 'export');
    if (c.timeline) {
      relie('montage', 'export');
      relie('mix', 'export');
      if (c.timeline.subtitles.enabled) relie('sous_titres', 'export');
    }
  }

  return finaliser(cartes, liens);
}

/* ─────────────────────────── Grille automatique ──────────────────────────── */

function finaliser(brouillons: Brouillon[], liensBruts: LienCanvas[]): ModeleCanvas {
  const ids = new Set(brouillons.map((b) => b.id));
  const vus = new Set<string>();
  const liens = liensBruts
    .filter((l) => ids.has(l.de) && ids.has(l.vers))
    .filter((l) => { const k = `${l.de}>${l.vers}`; if (vus.has(k)) return false; vus.add(k); return true; })
    .sort((a, b) => (a.de < b.de ? -1 : a.de > b.de ? 1 : a.vers < b.vers ? -1 : a.vers > b.vers ? 1 : 0));

  // Colonnes · les étapes présentes, sans trou.
  const etapes = ETAPES_CANVAS.filter((e) => brouillons.some((b) => b.etape === e));
  const colonneDe = new Map(etapes.map((e, i) => [e, i]));
  const ordinal = new Map(brouillons.map((b, i) => [b.id, i]));
  const rangee = new Map<string, number>();

  // Contexte · une rangée par carte. Plans · un couloir par plan, de deux
  // rangées quand il parle (image clé et voix l'une sous l'autre ensuite).
  let r = 0;
  for (const b of brouillons.filter((x) => x.etape === 'contexte')) rangee.set(b.id, r++);
  r = 0;
  for (const b of brouillons.filter((x) => x.etape === 'plans')) {
    rangee.set(b.id, r);
    r += b.shotId !== null && ids.has(`voix:${b.shotId}`) ? 2 : 1;
  }
  for (const e of etapes.filter((x) => x !== 'contexte' && x !== 'plans')) {
    const col = brouillons.filter((x) => x.etape === e);
    const voulue = (b: Brouillon) => (b.principal !== null && rangee.has(b.principal) ? rangee.get(b.principal)! : 0) + b.sous;
    col.sort((a, b) => voulue(a) - voulue(b) || ordinal.get(a.id)! - ordinal.get(b.id)!);
    let prec = -1;
    for (const b of col) {
      const v = Math.max(voulue(b), prec + 1);
      rangee.set(b.id, v);
      prec = v;
    }
  }

  const grille: ModeleCanvas['grille'] = {};
  for (const b of brouillons) grille[b.id] = { colonne: colonneDe.get(b.etape)!, rangee: rangee.get(b.id)! };

  const cartes: CarteCanvas[] = brouillons
    .slice()
    .sort((a, b) => grille[a.id]!.colonne - grille[b.id]!.colonne || grille[a.id]!.rangee - grille[b.id]!.rangee)
    .map(({ principal: _p, sous: _s, ...carte }) => carte);

  const empreinte = empreinteContenu({ cartes: cartes.map((x) => [x.id, x.nature, x.etape]), liens: liens.map((l) => [l.de, l.vers]) });
  return { cartes, liens, grille, etapes, empreinte };
}

/* ─────────────────────────── Lectures ────────────────────────────────────── */

/** Les cartes que LIT une carte (ses dépendances directes), dans l'ordre du canvas. */
export function entreesDeCarte(m: ModeleCanvas, id: string): CarteCanvas[] {
  const de = new Set(m.liens.filter((l) => l.vers === id).map((l) => l.de));
  return m.cartes.filter((x) => de.has(x.id));
}

/** Les cartes qui LISENT celle-ci (à refaire si elle change), dans l'ordre du canvas. */
export function sortiesDeCarte(m: ModeleCanvas, id: string): CarteCanvas[] {
  const vers = new Set(m.liens.filter((l) => l.de === id).map((l) => l.vers));
  return m.cartes.filter((x) => vers.has(x.id));
}

/** Toutes les cartes rendues obsolètes si celle-ci change (fermeture transitive). */
export function descendantsDeCarte(m: ModeleCanvas, id: string): Set<string> {
  const out = new Set<string>();
  const pile = [id];
  while (pile.length) {
    const x = pile.pop()!;
    for (const l of m.liens) if (l.de === x && !out.has(l.vers)) { out.add(l.vers); pile.push(l.vers); }
  }
  return out;
}

/** Les sorties du graphe d'impact sont-elles toutes des cartes ? (aucune dépendance cachée) */
export function idsSortiesCanvas(m: ModeleCanvas): string[] {
  return m.cartes.filter((x) => x.nature !== 'entree').map((x) => x.id);
}
