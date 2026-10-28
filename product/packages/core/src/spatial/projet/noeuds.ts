import type { ModeleLignee, NoeudLignee, TypeNoeudLignee } from '../../studios/canvas/lignee';

/**
 * Spatial · le CANVAS du projet (maquette `projet`, onglet « Canvas ») · cinq
 * couloirs (Contexte, Hypothèse, Créations, Mesure, Itération) peuplés par la
 * LIGNÉE réelle du projet (`projeterLignee`, noyau studios). Pur.
 *
 * Rien n'est inventé : chaque nœud est un nœud de la lignée (brief, hypothèse,
 * direction, lot, création, résultat, apprentissage, itération, références de
 * Veille, marque). Sans lignée lisible (capacité « canvas » coupée, lecture en
 * échec), `noeudsDepuisProjet` pose les seuls nœuds que la fiche projet porte
 * (brief, hypothèse, produit, sources). Une donnée absente laisse le couloir
 * vide · jamais un exemple de la maquette.
 */

export type CleCouloir = 'contexte' | 'hypothese' | 'creations' | 'mesure' | 'iteration';

export const COULOIRS: ReadonlyArray<{ cle: CleCouloir; titre: string }> = [
  { cle: 'contexte', titre: 'Contexte' },
  { cle: 'hypothese', titre: 'Hypothèse' },
  { cle: 'creations', titre: 'Créations' },
  { cle: 'mesure', titre: 'Mesure' },
  { cle: 'iteration', titre: 'Itération' },
];

/** Le couloir de chaque type de nœud de lignée · lu de gauche à droite, comme la lignée. */
export const COULOIR_DU_TYPE: Readonly<Record<TypeNoeudLignee, CleCouloir>> = {
  marque: 'contexte', reference: 'contexte', brief: 'contexte',
  hypothese: 'hypothese', direction: 'hypothese',
  groupe: 'creations', creation: 'creations',
  resultat: 'mesure', apprentissage: 'mesure',
  iteration: 'iteration',
};

/** L'étiquette en capitales de la maquette (`span.k`) · le MOT porte le type. */
export const ETIQUETTE_NOEUD: Readonly<Record<TypeNoeudLignee | 'produit', string>> = {
  marque: 'FICHE MARQUE', reference: 'RÉFÉRENCE VEILLE', brief: 'BRIEF',
  hypothese: 'HYPOTHÈSE', direction: 'DIRECTION CRÉATIVE',
  groupe: 'LOT', creation: 'CRÉATION',
  resultat: 'RÉSULTAT', apprentissage: 'APPRENTISSAGE',
  iteration: 'ITÉRATION', produit: 'ASSET',
};

export type ClassePastille = '' | 'c' | 'g' | 'w';

/** Un nœud tel que la vue le dessine · l'ordre des parties est celui de la maquette. */
export interface NoeudSpatial {
  id: string;
  etiquette: string;
  /** `sel` · nœud de la version ouverte ; `wn` · création gagnante mesurée. */
  classe: '' | 'sel' | 'wn';
  /** Aperçu réel (média livré, vignette de la source) · jamais une image d'exemple. */
  apercu: { src: string; bandeau: string; classe: '' | 'won' | 'v' } | null;
  titre: string | null;
  /** Texte libre sous le titre. */
  texte: string | null;
  /** Phrase mise en avant (`span`) · l'hypothèse, la consigne d'une itération. */
  phrase: string | null;
  /** Barres de résultat · seulement quand des mesures chiffrées existent. */
  barres: ReadonlyArray<{ libelle: string; part: number; valeur: string; gagnant: boolean }>;
  /** Source de la mesure (`span` sous les barres). */
  pied: string | null;
  pastille: { classe: ClassePastille; libelle: string } | null;
  /** Lien de CONSULTATION vers la donnée réelle (lecture), jamais une action simulée. */
  lien: { href: string; libelle: string; forme: 'pastille' | 'bouton' } | null;
  /** Création mesurée et battue · repliable. */
  perdant: boolean;
  /** La cible de proposition que « Cibler Jarvis » choisit depuis ce nœud · absente, le geste n'est pas offert. */
  cible?: CibleJarvisNoeud | null;
}

export interface CibleJarvisNoeud { cible: string; libelle: string }

export interface CouloirSpatial { cle: CleCouloir; titre: string; noeuds: NoeudSpatial[] }

const vide = (n: Partial<NoeudSpatial> & Pick<NoeudSpatial, 'id' | 'etiquette'>): NoeudSpatial => ({
  classe: '', apercu: null, titre: null, texte: null, phrase: null, barres: [], pied: null, pastille: null, lien: null, perdant: false, ...n,
});

const sansPrefixe = (titre: string, prefixe: string) => (titre.startsWith(prefixe) ? titre.slice(prefixe.length) : titre);

const varianteDe = (id: string) => id.slice(id.indexOf(':') + 1);

export interface ContexteNoeuds {
  /** Version OUVERTE à l'écran · ses nœuds d'hypothèse et d'itération sont mis en avant (`sel`). */
  versionVue: string | null;
  /** Aperçus réels par variante (`creation:<variante>` → URL du média livré). */
  apercusCreations?: Readonly<Record<string, string>>;
  /** Vignettes réelles par source (`reference:<source>` → URL). */
  apercusReferences?: Readonly<Record<string, string>>;
  /** Fiche marque lue (complétude réelle) · remplace le résumé générique du nœud marque. */
  fiche?: { titre: string; texte: string; href: string | null } | null;
  /** Hypothèse de la version ouverte, structurée (énoncé + mesure) · remplace le résumé aplati. */
  hypotheseVue?: { enonce: string; mesure: string | null } | null;
}

/** Les créations battues (résultat mesuré non gagnant) quand au moins un gagnant existe. */
function perdantes(m: ModeleLignee): Set<string> {
  const resultats = m.noeuds.filter((n) => n.type === 'resultat');
  if (!resultats.some((n) => n.badge === 'Gagnant')) return new Set();
  return new Set(resultats.filter((n) => n.badge !== 'Gagnant').map((n) => `creation:${varianteDe(n.id)}`));
}

function gagnantes(m: ModeleLignee): Set<string> {
  return new Set(m.noeuds.filter((n) => n.type === 'resultat' && n.badge === 'Gagnant').map((n) => `creation:${varianteDe(n.id)}`));
}

function noeudDeLignee(n: NoeudLignee, c: ContexteNoeuds, gagne: Set<string>, perd: Set<string>): NoeudSpatial {
  const base = { id: n.id, etiquette: ETIQUETTE_NOEUD[n.type] };
  const vue = c.versionVue !== null && n.id.endsWith(`:${c.versionVue}`);
  switch (n.type) {
    case 'marque':
      return c.fiche
        ? vide({ ...base, titre: c.fiche.titre, texte: c.fiche.texte, lien: c.fiche.href ? { href: c.fiche.href, libelle: 'Ouvrir la fiche', forme: 'pastille' } : null })
        : vide({ ...base, titre: sansPrefixe(n.titre, 'Marque · '), texte: n.resume });
    case 'reference': {
      const src = c.apercusReferences?.[n.id] ?? null;
      return vide({
        ...base, titre: sansPrefixe(n.titre, 'Référence · '), texte: src ? null : n.resume,
        apercu: src ? { src, bandeau: ' ', classe: '' } : null,
        lien: n.destination ? { href: n.destination, libelle: 'Voir la source', forme: 'pastille' } : null,
      });
    }
    case 'hypothese':
      if (vue && c.hypotheseVue) {
        return vide({
          ...base, classe: 'sel', titre: n.titre, phrase: c.hypotheseVue.enonce,
          pastille: c.hypotheseVue.mesure ? { classe: 'c', libelle: c.hypotheseVue.mesure } : null,
        });
      }
      return vide({ ...base, classe: vue ? 'sel' : '', titre: n.titre, phrase: n.resume });
    case 'creation': {
      const src = c.apercusCreations?.[n.id] ?? null;
      const gagnant = gagne.has(n.id);
      return vide({
        ...base, classe: gagnant ? 'wn' : '', titre: sansPrefixe(n.titre, 'Création · '),
        texte: src ? null : n.resume,
        apercu: src ? { src, bandeau: '', classe: gagnant ? 'won' : '' } : null,
        pastille: gagnant ? { classe: 'g', libelle: 'Gagnant' } : null,
        perdant: perd.has(n.id),
      });
    }
    case 'resultat':
      return vide({
        ...base, titre: sansPrefixe(n.titre, 'Résultat · '), texte: n.resume,
        pastille: n.badge ? { classe: 'g', libelle: n.badge } : null,
        lien: n.destination ? { href: n.destination, libelle: 'Ouvrir dans Adsmap', forme: 'pastille' } : null,
      });
    case 'iteration':
      return vide({
        ...base, classe: vue ? 'sel' : '', titre: n.titre, texte: n.resume,
        lien: n.destination && !vue ? { href: n.destination, libelle: 'Ouvrir cette version', forme: 'pastille' } : null,
      });
    default:
      return vide({ ...base, titre: n.titre, texte: n.resume });
  }
}

/** Les cinq couloirs depuis la lignée réelle · l'ordre de la lignée est gardé dans chaque couloir. */
export function couloirsDepuisLignee(m: ModeleLignee, c: ContexteNoeuds): CouloirSpatial[] {
  const gagne = gagnantes(m);
  const perd = perdantes(m);
  return COULOIRS.map((k) => ({
    ...k,
    noeuds: m.noeuds.filter((n) => COULOIR_DU_TYPE[n.type] === k.cle).map((n) => noeudDeLignee(n, c, gagne, perd)),
  }));
}

/** Ce que la fiche projet porte · le repli quand la lignée n'est pas lisible. */
export interface ProjetPourNoeuds {
  versionId: string;
  versionN: number;
  marque: string;
  objectif: string | null;
  hypothese: { enonce: string; mesure: string | null } | null;
  direction: string | null;
  produit: { nom: string; detail: string } | null;
  sources: ReadonlyArray<{ id: string; titre: string; detail: string; href: string | null; apercu: string | null }>;
  /** Médias livrés du projet (toutes versions) · la plus récente d'abord. */
  creations: ReadonlyArray<{ id: string; src: string; titre: string }>;
}

export function couloirsDepuisProjet(p: ProjetPourNoeuds, fiche: ContexteNoeuds['fiche'] = null): CouloirSpatial[] {
  const contexte: NoeudSpatial[] = [
    vide({ id: `brief:${p.versionId}`, etiquette: ETIQUETTE_NOEUD.brief, titre: `Brief · version ${p.versionN}`, texte: p.objectif ?? `Version ${p.versionN} · pas encore de brief rédigé.` }),
  ];
  if (fiche) contexte.push(vide({ id: 'marque', etiquette: ETIQUETTE_NOEUD.marque, titre: fiche.titre, texte: fiche.texte, lien: fiche.href ? { href: fiche.href, libelle: 'Ouvrir la fiche', forme: 'pastille' } : null }));
  for (const s of p.sources) {
    contexte.push(vide({
      id: `reference:${s.id}`, etiquette: ETIQUETTE_NOEUD.reference, titre: s.titre, texte: s.apercu ? null : s.detail,
      apercu: s.apercu ? { src: s.apercu, bandeau: ' ', classe: '' } : null,
      lien: s.href ? { href: s.href, libelle: 'Voir la source', forme: 'pastille' } : null,
    }));
  }
  if (p.produit) contexte.push(vide({ id: 'produit', etiquette: ETIQUETTE_NOEUD.produit, titre: p.produit.nom, texte: p.produit.detail }));
  const hypothese: NoeudSpatial[] = [];
  if (p.hypothese) {
    hypothese.push(vide({
      id: `hypothese:${p.versionId}`, etiquette: ETIQUETTE_NOEUD.hypothese, classe: 'sel', titre: `Hypothèse · version ${p.versionN}`,
      phrase: p.hypothese.enonce, pastille: p.hypothese.mesure ? { classe: 'c', libelle: p.hypothese.mesure } : null,
    }));
  }
  if (p.direction) hypothese.push(vide({ id: `direction:${p.versionId}`, etiquette: ETIQUETTE_NOEUD.direction, titre: `Direction · version ${p.versionN}`, texte: p.direction }));
  const creations = p.creations.map((x) => vide({ id: `media:${x.id}`, etiquette: 'IMAGE', titre: x.titre, apercu: { src: x.src, bandeau: '', classe: '' } }));
  return COULOIRS.map((k) => ({
    ...k,
    noeuds: k.cle === 'contexte' ? contexte : k.cle === 'hypothese' ? hypothese : k.cle === 'creations' ? creations : [],
  }));
}

/**
 * « Replier les perdants » · masque les créations battues. Le bouton n'a de sens
 * que si une mesure a désigné un gagnant · sinon il est inactif et le dit.
 */
export function repliPossible(couloirs: readonly CouloirSpatial[]): { possible: boolean; raison: string | null } {
  const aPerdant = couloirs.some((c) => c.noeuds.some((n) => n.perdant));
  return aPerdant ? { possible: true, raison: null } : { possible: false, raison: 'Aucune création battue par une mesure · rien à replier.' };
}

export function replierPerdants(couloirs: readonly CouloirSpatial[], replie: boolean): CouloirSpatial[] {
  if (!replie) return couloirs.map((c) => ({ ...c, noeuds: [...c.noeuds] }));
  return couloirs.map((c) => ({ ...c, noeuds: c.noeuds.filter((n) => !n.perdant) }));
}

/* ─────────────────────── « Cibler Jarvis » depuis un nœud ─────────────────────── */

const NOEUDS_DU_BRIEF = /^(brief|hypothese|direction):(.+)$/;

/**
 * La cible de proposition d'un nœud (geste « Cibler Jarvis » de la fiche V5,
 * porté dans les couloirs). Seuls les nœuds que le BRIEF porte (brief,
 * hypothèse, direction) de la VERSION COURANTE ont une cible · et seulement si
 * le formulaire de propositions la propose vraiment (`cibles`, vide pour un
 * rôle en lecture ou une version antérieure). Cibler ne demande rien à Jarvis ·
 * l'envoi, payant et annoncé, reste un clic séparé.
 */
export function cibleJarvisNoeud(id: string, o: { versionCourante: string | null; cibles: readonly CibleJarvisNoeud[] }): CibleJarvisNoeud | null {
  const m = NOEUDS_DU_BRIEF.exec(id);
  if (!m || o.versionCourante === null || m[2] !== o.versionCourante) return null;
  return o.cibles.find((c) => c.cible === 'brief') ?? null;
}

export function ciblerCouloirs(couloirs: readonly CouloirSpatial[], o: { versionCourante: string | null; cibles: readonly CibleJarvisNoeud[] }): CouloirSpatial[] {
  return couloirs.map((c) => ({ ...c, noeuds: c.noeuds.map((n) => ({ ...n, cible: cibleJarvisNoeud(n.id, o) })) }));
}

/** Ce que dit l'écran après « Cibler Jarvis » · rien n'est envoyé. */
export function annonceCibleJarvis(libelle: string, disponible: boolean): string {
  return disponible
    ? `Cible « ${libelle} » choisie dans les propositions · écris ta demande. Rien n’est envoyé avant ton clic sur « Demander à Jarvis ».`
    : `Les propositions ne proposent pas « ${libelle} » sur la version courante · choisis la cible à la main. Rien n’a été envoyé.`;
}
