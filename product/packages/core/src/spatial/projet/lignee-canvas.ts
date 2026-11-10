import { LIBELLES_CATEGORIE_LIGNEE, LIBELLES_TYPE_LIGNEE, type CategorieLien, type ModeleLignee, type NoeudLignee, type TypeNoeudLignee } from '../../studios/canvas/lignee';
import { LIBELLE_STATUT_LOT } from '../../studios/variantes/vue';
import type { DispositionCanvas, RectCanvas } from '../../studios/canvas/disposition';
import type { ModeleCanvas } from '../../studios/canvas/modele';
import type { TailleCanvas, VueCanvas } from '../../studios/canvas/vue';
import type { CleCouloir, CouloirSpatial, GroupeCouloir, NoeudSpatial } from './noeuds';

/**
 * Spatial · fiche projet · lot 11 V5 · le CANVAS DE LIGNÉE · groupes de lot,
 * légende des liens, mini-carte, équivalent en liste. Pur · ni base, ni
 * réseau, ni horloge.
 *
 * ── Tout est CALCULÉ, rien n'est saisi ──────────────────────────────────────
 *
 * La lignée vient de `projeterLignee` (données existantes · versions et
 * `parentId`, variantes, lots de production, liens de test, verdicts, lots de
 * test Adsmap, lectures et relectures, `sourceRefs`, brief). Ce module n'ajoute
 * AUCUN nœud ni AUCUN lien :
 *  · un GROUPE est un ensemble de nœuds déjà projetés · le lot de production
 *    (nœud « Lot » et les créations que la lignée lui relie) ou le lot de test
 *    Adsmap (résultats dont la fiche est dans ce lot, et leurs apprentissages) ;
 *  · la LÉGENDE ne liste que les catégories qui ont au moins un lien en
 *    données, avec leur nombre · une catégorie sans lien se tait ;
 *  · la MINI-CARTE réduit les cartes posées et la fenêtre visible · DÉCORATIVE
 *    (`aria-hidden`, aucun geste) · se déplacer passe par la vue (molette,
 *    glisser, « Ajuster », « Centrer la sélection ») et par la liste ;
 *  · la LISTE dit la même lignée, nœud par nœud, avec « Vient de » / « A
 *    donné » et la catégorie de chaque lien en toutes lettres, et l'écran
 *    EXISTANT que chaque nœud ouvre.
 *
 * Seules les POSITIONS s'enregistrent (`enregistrerDispositionCanvas`, la même
 * clé personnelle que le canvas de production) · les identifiants de lignée et
 * de production ne se recouvrent jamais (`estIdLignee`), si bien que ranger
 * l'un ne déplace pas l'autre, et que réinitialiser l'un garde l'autre.
 *
 * Un lien de lignée dit d'où vient un nœud · ce n'est PAS une dépendance de
 * calcul · rien ne se recalcule, rien n'est rendu obsolète par un déplacement.
 */

/* ─────────────────────────────── Groupes ─────────────────────────────────── */

export type NatureGroupeLignee = 'production' | 'test';

export interface GroupeLignee {
  /** `lot:<job>` (production) ou `lot-test:<lot Adsmap>`. */
  id: string;
  nature: NatureGroupeLignee;
  couloir: Extract<CleCouloir, 'creations' | 'mesure'>;
  etiquette: string;
  titre: string;
  texte: string;
  /** L'écran EXISTANT du groupe · `null` quand la personne ne peut pas l'ouvrir. */
  lien: { href: string; libelle: string } | null;
  /** Nœuds de la lignée, dans l'ordre d'affichage · rien qui ne soit déjà projeté. */
  membres: string[];
}

/** La conclusion d'un lot de test, déjà lue par le serveur (`conclusionLot`) · titre et phrase. */
export interface ConclusionGroupe { titre: string; phrase: string }

export interface OptionsGroupes {
  /** Conclusions des lots de test, par identifiant de lot · absentes, le cadre ne dit que le statut. */
  conclusions?: Readonly<Record<string, ConclusionGroupe>>;
  /** La personne ouvre-t-elle les Résultats de cette marque ? Sinon, aucun lien vers la fiche du lot. */
  resultatsOuverts: boolean;
}

const suffixe = (id: string) => id.slice(id.indexOf(':') + 1);

/**
 * Les groupes de lot · CALCULÉS depuis la lignée. Un lot de production ne
 * groupe que les créations que la lignée lui relie (lien « Création ») ; un
 * lot de test ne groupe que les résultats dont la fiche est dans ce lot, et
 * l'apprentissage que la lignée relie à chacun. Ordre déterministe.
 */
export function groupesLignee(m: ModeleLignee, o: OptionsGroupes): GroupeLignee[] {
  const parId = new Map(m.noeuds.map((n) => [n.id, n]));
  const sorties = (id: string, type: TypeNoeudLignee) => m.liens.filter((l) => l.de === id && parId.get(l.vers)?.type === type).map((l) => l.vers);
  const ordre = new Map(m.noeuds.map((n, i) => [n.id, i]));
  const trier = (ids: string[]) => [...ids].sort((a, b) => ordre.get(a)! - ordre.get(b)!);

  const production: GroupeLignee[] = m.noeuds.filter((n) => n.type === 'groupe').flatMap((g) => {
    const creations = trier(sorties(g.id, 'creation'));
    if (creations.length === 0) return [];
    return [{
      id: `lot:${suffixe(g.id)}`, nature: 'production' as const, couloir: 'creations' as const, etiquette: 'LOT',
      titre: g.titre, texte: g.resume,
      lien: g.destination ? { href: g.destination, libelle: 'Voir le lot dans Créations' } : null,
      membres: [g.id, ...creations],
    }];
  });

  const parLot = new Map<string, { numero: number; statut: string; resultats: NoeudLignee[] }>();
  for (const n of m.noeuds) {
    if (n.type !== 'resultat' || !n.lotTest) continue;
    const g = parLot.get(n.lotTest.id) ?? { numero: n.lotTest.numero, statut: n.lotTest.statut, resultats: [] };
    g.resultats.push(n);
    parLot.set(n.lotTest.id, g);
  }
  const test: GroupeLignee[] = [...parLot.entries()]
    .sort(([a, x], [b, y]) => x.numero - y.numero || (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, g]) => {
      const c = o.conclusions?.[id] ?? null;
      const statut = LIBELLE_STATUT_LOT[g.statut] ?? 'statut inconnu';
      return {
        id: `lot-test:${id}`, nature: 'test' as const, couloir: 'mesure' as const, etiquette: 'LOT DE TEST',
        titre: `Lot de test n° ${g.numero}`,
        texte: c ? `${statut} · ${c.titre} · ${c.phrase}` : `${statut} · ${g.resultats.length} résultat${g.resultats.length > 1 ? 's' : ''} de ce projet dans ce lot.`,
        lien: o.resultatsOuverts ? { href: `/adsmap/lots/${id}`, libelle: 'Ouvrir le lot de test' } : null,
        membres: trier(g.resultats.map((r) => r.id)).flatMap((r) => [r, ...trier(sorties(r, 'apprentissage'))]),
      };
    });

  return [...production, ...test];
}

/**
 * Pose les groupes sur les couloirs · chaque couloir garde ses nœuds, chaque
 * groupe ne garde que ses membres présents dans SON couloir, et les membres
 * d'un groupe deviennent CONTIGUS (le groupe prend la place de son premier
 * membre, l'ordre de la lignée est gardé dans le groupe et autour).
 */
export function grouperCouloirs(couloirs: readonly CouloirSpatial[], groupes: readonly GroupeLignee[]): CouloirSpatial[] {
  return couloirs.map((c) => {
    const ici = new Set(c.noeuds.map((n) => n.id));
    const gs: GroupeCouloir[] = groupes.filter((g) => g.couloir === c.cle)
      .map((g) => ({ id: g.id, nature: g.nature, etiquette: g.etiquette, titre: g.titre, texte: g.texte, lien: g.lien, membres: g.membres.filter((x) => ici.has(x)) }))
      .filter((g) => g.membres.length > 0);
    if (gs.length === 0) return { ...c, noeuds: [...c.noeuds] };
    const deGroupe = new Map<string, GroupeCouloir>();
    for (const g of gs) for (const x of g.membres) if (!deGroupe.has(x)) deGroupe.set(x, g);
    const parId = new Map(c.noeuds.map((n) => [n.id, n]));
    const vus = new Set<string>();
    const noeuds: NoeudSpatial[] = [];
    for (const n of c.noeuds) {
      if (vus.has(n.id)) continue;
      const g = deGroupe.get(n.id);
      const bloc = g ? g.membres.filter((x) => deGroupe.get(x) === g) : [n.id];
      for (const x of bloc) { vus.add(x); noeuds.push(parId.get(x)!); }
    }
    return { ...c, noeuds, groupes: gs };
  });
}

export type ElementCouloir =
  | { type: 'noeud'; noeud: NoeudSpatial }
  | { type: 'groupe'; groupe: GroupeCouloir; noeuds: NoeudSpatial[] };

/**
 * Ce que l'écran pose dans un couloir, dans l'ordre · un nœud seul, ou le
 * CADRE d'un groupe avec ses membres encore visibles (après « Replier les
 * perdants »). Un cadre n'apparaît qu'avec au moins un membre présent · le nœud
 * « Lot » et les résultats ne se replient jamais, seuls des créations battues
 * quittent un cadre.
 */
export function elementsCouloir(c: CouloirSpatial): ElementCouloir[] {
  const deGroupe = new Map<string, GroupeCouloir>();
  for (const g of c.groupes ?? []) for (const x of g.membres) if (!deGroupe.has(x)) deGroupe.set(x, g);
  const out: ElementCouloir[] = [];
  const poses = new Set<string>();
  for (const n of c.noeuds) {
    const g = deGroupe.get(n.id);
    if (!g) { out.push({ type: 'noeud', noeud: n }); continue; }
    if (poses.has(g.id)) continue;
    poses.add(g.id);
    out.push({ type: 'groupe', groupe: g, noeuds: c.noeuds.filter((x) => deGroupe.get(x.id) === g) });
  }
  return out;
}

/* ─────────────────────────────── Légende ─────────────────────────────────── */

/**
 * Le style d'un lien de lignée · la COULEUR appuie, le MOTIF du trait et le
 * MOT de la légende portent l'information (jamais la seule couleur). Couleurs
 * par jetons de la feuille Spatiale.
 */
export const STYLE_LIEN_LIGNEE: Readonly<Record<CategorieLien, { couleur: string; tirets: string | null; trait: string; sens: string }>> = {
  contexte: { couleur: 'var(--fg3)', tirets: null, trait: 'trait plein', sens: 'ce qui cadre le brief · marque, références, hypothèse, direction' },
  visuel: { couleur: 'var(--chg)', tirets: '7 4', trait: 'tirets', sens: 'du brief à ses lots, et du lot à ses créations' },
  mesure: { couleur: 'var(--good)', tirets: '2 4', trait: 'pointillés', sens: 'de la création à son résultat mesuré, puis à son apprentissage' },
  iteration: { couleur: 'var(--warn)', tirets: '10 4 2 4', trait: 'tirets et points', sens: 'de la version parente à la version itérée qui en vient' },
};

const ORDRE_CATEGORIES: readonly CategorieLien[] = ['contexte', 'visuel', 'mesure', 'iteration'];

export interface EntreeLegende { categorie: CategorieLien; libelle: string; nombre: number; trait: string; sens: string; couleur: string; tirets: string | null }

/** La légende · seulement les catégories qui ont au moins un lien EN DONNÉES, avec leur nombre. */
export function legendeLignee(m: Pick<ModeleLignee, 'liens'>): EntreeLegende[] {
  return ORDRE_CATEGORIES.flatMap((categorie) => {
    const nombre = m.liens.filter((l) => l.categorie === categorie).length;
    if (nombre === 0) return [];
    const s = STYLE_LIEN_LIGNEE[categorie];
    return [{ categorie, libelle: LIBELLES_CATEGORIE_LIGNEE[categorie], nombre, trait: s.trait, sens: s.sens, couleur: s.couleur, tirets: s.tirets }];
  });
}

/** La phrase de la légende · « Contexte · trait plein · 3 liens · ce qui cadre le brief… ». */
export function phraseLegende(e: EntreeLegende): string {
  return `${e.libelle} · ${e.trait} · ${e.nombre} lien${e.nombre > 1 ? 's' : ''} · ${e.sens}`;
}

/** Ce que la légende dit quand la lignée n'a aucun lien · rien n'est dessiné, rien n'est inventé. */
export const LEGENDE_VIDE = 'Aucun lien en données · la lignée n’a encore qu’un point de départ.';

/* ─────────────────────────────── Cadres (canvas) ─────────────────────────── */

/**
 * Marges d'un cadre · la grille automatique laisse 36 px entre deux rangées et
 * 82 px entre deux colonnes (`disposition.ts`) · un cadre déborde de 10 px sur
 * les côtés et de 24 px en haut (la ligne de son titre, 18 px), si bien qu'il
 * tient dans l'espace libre sans toucher la carte voisine.
 */
export const MARGE_CADRE_LIGNEE = 10;
export const ENTETE_CADRE_LIGNEE = 14;

const boite = (r: readonly RectCanvas[]): RectCanvas => {
  const x0 = Math.min(...r.map((x) => x.x)) - MARGE_CADRE_LIGNEE;
  const y0 = Math.min(...r.map((x) => x.y)) - MARGE_CADRE_LIGNEE - ENTETE_CADRE_LIGNEE;
  const x1 = Math.max(...r.map((x) => x.x + x.w)) + MARGE_CADRE_LIGNEE;
  const y1 = Math.max(...r.map((x) => x.y + x.h)) + MARGE_CADRE_LIGNEE;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const recouvre = (a: RectCanvas, b: RectCanvas) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface CadreLignee {
  /** L'identifiant du groupe · un groupe peut avoir plusieurs cadres. */
  id: string;
  /** Le premier cadre du groupe porte l'en-tête (titre, lien) · les suivants le rappellent. */
  entete: boolean;
  rect: RectCanvas;
}

/**
 * Les cadres de chaque groupe sur le canvas · la boîte de ses membres POSÉS
 * (positions enregistrées comprises). Un cadre ne recouvre JAMAIS une carte qui
 * n'est pas du groupe · sinon on essaie une boîte par colonne (cartes à la même
 * abscisse), puis une boîte par membre. Ordre et découpe déterministes.
 */
export function cadresLignee(groupes: readonly GroupeLignee[], posees: ReadonlyMap<string, RectCanvas>): CadreLignee[] {
  return groupes.flatMap((g) => {
    const membres = new Set(g.membres);
    const r = g.membres.map((id) => posees.get(id)).filter((x): x is RectCanvas => !!x);
    if (r.length === 0) return [];
    const autres = [...posees.entries()].filter(([id]) => !membres.has(id)).map(([, x]) => x);
    const libre = (b: RectCanvas) => !autres.some((x) => recouvre(b, x));
    const parColonne = [...r.reduce((m, x) => m.set(x.x, [...(m.get(x.x) ?? []), x]), new Map<number, RectCanvas[]>()).entries()]
      .sort(([a], [b]) => a - b).map(([, l]) => l);
    const essais: RectCanvas[][][] = [[r], parColonne, r.map((x) => [x])];
    const choix = essais.find((e) => e.map(boite).every(libre)) ?? essais[2]!;
    return choix.map((l, i) => ({ id: g.id, entete: i === 0, rect: boite(l) }));
  });
}

/* ─────────────────────────────── Mini-carte ──────────────────────────────── */

export const MINI_CARTE = { largeur: 168, hauteur: 104, marge: 6 } as const;

export interface MiniCarte {
  largeur: number;
  hauteur: number;
  cartes: Array<RectCanvas & { id: string }>;
  cadres: Array<RectCanvas & { id: string }>;
  /** La fenêtre visible de la zone, dans la mini-carte · `null` quand rien n'est visible. */
  fenetre: RectCanvas | null;
}

/**
 * La mini-carte · les cartes posées et les cadres, réduits dans un rectangle
 * fixe (proportions gardées), et la fenêtre que la zone montre (vue et taille
 * de la zone). Décorative · elle ne commande rien.
 */
export function miniCarteLignee(o: {
  cartes: ReadonlyArray<RectCanvas & { id: string }>;
  cadres: ReadonlyArray<{ id: string; rect: RectCanvas }>;
  vue: VueCanvas;
  taille: TailleCanvas;
}): MiniCarte | null {
  const tous = [...o.cartes, ...o.cadres.map((c) => c.rect)];
  if (o.cartes.length === 0) return null;
  const x0 = Math.min(...tous.map((r) => r.x));
  const y0 = Math.min(...tous.map((r) => r.y));
  const x1 = Math.max(...tous.map((r) => r.x + r.w));
  const y1 = Math.max(...tous.map((r) => r.y + r.h));
  const L = MINI_CARTE.largeur - 2 * MINI_CARTE.marge;
  const H = MINI_CARTE.hauteur - 2 * MINI_CARTE.marge;
  const e = Math.min(L / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0));
  const ox = MINI_CARTE.marge + (L - (x1 - x0) * e) / 2;
  const oy = MINI_CARTE.marge + (H - (y1 - y0) * e) / 2;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const reduit = (r: RectCanvas): RectCanvas => ({ x: r2(ox + (r.x - x0) * e), y: r2(oy + (r.y - y0) * e), w: r2(Math.max(1, r.w * e)), h: r2(Math.max(1, r.h * e)) });
  // Fenêtre visible · le monde vu par la zone (`vue` · translation puis échelle), bornée à la mini-carte.
  const k = o.vue.k > 0 ? o.vue.k : 1;
  const vf = reduit({ x: -o.vue.x / k, y: -o.vue.y / k, w: o.taille.largeur / k, h: o.taille.hauteur / k });
  const fx0 = Math.max(0, vf.x); const fy0 = Math.max(0, vf.y);
  const fx1 = Math.min(MINI_CARTE.largeur, vf.x + vf.w); const fy1 = Math.min(MINI_CARTE.hauteur, vf.y + vf.h);
  const fenetre = fx1 > fx0 && fy1 > fy0 ? { x: r2(fx0), y: r2(fy0), w: r2(fx1 - fx0), h: r2(fy1 - fy0) } : null;
  return {
    largeur: MINI_CARTE.largeur, hauteur: MINI_CARTE.hauteur,
    cartes: o.cartes.map((c) => ({ id: c.id, ...reduit(c) })),
    cadres: o.cadres.map((c) => ({ id: c.id, ...reduit(c.rect) })),
    fenetre,
  };
}

/* ─────────────────────────────── Liste ───────────────────────────────────── */

/** Le libellé du lien vers l'écran EXISTANT, par type de nœud. */
export const LIBELLE_ECRAN_NOEUD: Readonly<Record<TypeNoeudLignee, string>> = {
  marque: 'Ouvrir la fiche marque', reference: 'Voir la source', brief: 'Ouvrir le brief', hypothese: 'Ouvrir l’hypothèse au brief',
  direction: 'Ouvrir la direction au brief', groupe: 'Voir le lot dans Créations', creation: 'Voir la variante',
  resultat: 'Ouvrir le test dans Adsmap', apprentissage: 'Voir l’apprentissage de la variante', iteration: 'Ouvrir cette version',
};

/** Pourquoi un nœud n'ouvre aucun écran · dit en clair, jamais un lien mort. */
export const SANS_ECRAN_NOEUD = 'Aucun écran à ouvrir pour toi · la donnée est lue ici.';

export interface LienListe { id: string; titre: string; categorie: string }

export interface ElementListeLignee {
  id: string;
  type: string;
  titre: string;
  /** Ce que la liste écrit en tête · le titre, précédé du type seulement s'il ne le dit pas déjà. */
  intitule: string;
  resume: string;
  lien: { href: string; libelle: string } | null;
  vientDe: LienListe[];
  aDonne: LienListe[];
  /** Les groupes (lots) qui contiennent ce nœud · leur titre. */
  dans: string[];
  badge: string | null;
}

/**
 * La lignée EN LISTE · l'équivalent lisible au clavier et au lecteur d'écran ·
 * mêmes nœuds, même ordre que le canvas, chaque lien dit dans les deux sens
 * avec sa catégorie en toutes lettres. `destinations` remplace l'écran d'un
 * nœud quand le serveur le connaît mieux (fiche marque · admin seulement).
 */
export function ligneeEnListe(m: ModeleLignee, groupes: readonly GroupeLignee[], destinations: Readonly<Record<string, string | null>> = {}): ElementListeLignee[] {
  const parId = new Map(m.noeuds.map((n) => [n.id, n]));
  const lien = (id: string, categorie: CategorieLien): LienListe => ({ id, titre: parId.get(id)?.titre ?? id, categorie: LIBELLES_CATEGORIE_LIGNEE[categorie] });
  return m.noeuds.map((n) => {
    const href = Object.prototype.hasOwnProperty.call(destinations, n.id) ? destinations[n.id]! : n.destination;
    return {
      id: n.id, type: LIBELLES_TYPE_LIGNEE[n.type], titre: n.titre, resume: n.resume, badge: n.badge,
      intitule: `${n.titre.startsWith(LIBELLES_TYPE_LIGNEE[n.type]) ? n.titre : `${LIBELLES_TYPE_LIGNEE[n.type]} · ${n.titre}`}${n.badge ? ` · ${n.badge}` : ''}`,
      lien: href ? { href, libelle: LIBELLE_ECRAN_NOEUD[n.type] } : null,
      vientDe: m.liens.filter((l) => l.vers === n.id).map((l) => lien(l.de, l.categorie)),
      aDonne: m.liens.filter((l) => l.de === n.id).map((l) => lien(l.vers, l.categorie)),
      dans: groupes.filter((g) => g.membres.includes(n.id)).map((g) => g.titre),
    };
  });
}

/** « Vient de · Brief · version 1 (Contexte) » · la phrase d'un sens de lien. */
export function phraseLiens(sens: 'Vient de' | 'A donné', liens: readonly LienListe[]): string {
  if (liens.length === 0) return sens === 'Vient de' ? 'Vient de · rien, c’est un point de départ.' : 'A donné · rien pour l’instant.';
  return `${sens} · ${liens.map((l) => `${l.titre} (${l.categorie})`).join(', ')}`;
}

/* ─────────────────────── Graphe affiché et positions ─────────────────────── */

export type GrapheLibre = 'production' | 'lignee';

/** Le paramètre d'adresse qui porte le graphe du canvas libre · `?graphe=lignee`. */
export const PARAM_GRAPHE = 'graphe';

export function modeGraphe(valeur: unknown): GrapheLibre {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return v === 'lignee' ? 'lignee' : 'production';
}

/** La recherche d'adresse pour un graphe · les autres paramètres sont gardés. */
export function rechercheGraphe(recherche: string, graphe: GrapheLibre): string {
  const p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  if (graphe === 'lignee') p.set(PARAM_GRAPHE, 'lignee');
  else p.delete(PARAM_GRAPHE);
  const s = p.toString();
  return s ? `?${s}` : '';
}

const ID_LIGNEE = /^(marque$|(reference|brief|hypothese|direction|groupe|creation|resultat|apprentissage|iteration):.)/;

/** Un identifiant de carte de LIGNÉE · jamais un identifiant du canvas de production (`deriverCanvas`). */
export const estIdLignee = (id: string): boolean => ID_LIGNEE.test(id);

/**
 * Ce que « Réinitialiser » laisse dans la disposition personnelle · le graphe
 * affiché reprend sa place automatique, l'AUTRE graphe garde ses positions
 * (même clé `app_settings`). `null` · plus rien à garder (l'effacement complet
 * existant convient).
 */
export function dispositionApresReinitialisation(d: DispositionCanvas, graphe: GrapheLibre): DispositionCanvas | null {
  const garde = Object.entries(d.positions).filter(([id]) => (graphe === 'lignee' ? !estIdLignee(id) : estIdLignee(id)));
  return garde.length ? { positions: Object.fromEntries(garde) } : null;
}

/* ─────────────────────── Le modèle de canvas de la lignée ───────────────── */

/** Ce que la carte d'un nœud de lignée écrit en tête · le MOT du type (jamais nature · étape, sans objet ici). */
export function etiquetteCarteLignee(m: ModeleLignee, id: string): string {
  const n = m.noeuds.find((x) => x.id === id);
  return n ? LIBELLES_TYPE_LIGNEE[n.type].toUpperCase() : '';
}

/** La catégorie d'un lien de lignée du modèle de canvas (`de>vers`) · `null` s'il n'existe pas en données. */
export function categorieLienLignee(m: ModeleLignee, de: string, vers: string): CategorieLien | null {
  return m.liens.find((l) => l.de === de && l.vers === vers)?.categorie ?? null;
}

/** Les cartes d'un modèle de canvas avec leurs dimensions · une carte avec aperçu est plus haute. */
export function dimensionsLignee(m: ModeleCanvas, apercus: Readonly<Record<string, string>>): ModeleCanvas {
  return { ...m, dimensions: Object.fromEntries(m.cartes.map((k) => [k.id, { w: 220, h: apercus[k.id] ? 340 : 160 }])) };
}
