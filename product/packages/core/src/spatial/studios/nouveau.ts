import type { TypeNouveauProjet } from '../../studios/ux/nouveau-projet';

/**
 * Spatial · « Nouveau projet » (`/studio/projets/nouveau`, maquette `nouveau`). Pur.
 *
 * La maquette enchaîne Que créer ? → Style → Brief → Format & devis, puis
 * « Lancer » débite des crédits en local. Le parcours RÉEL est différent et on
 * le suit : le projet se crée gratuitement à partir du type et du brief
 * (`creerProjetDepuisContexte` / `creerProjet`), puis la direction (style) et
 * le format se décident DANS le projet, où le devis serveur est annoncé avant
 * toute génération. Les deux premières étapes vivent ici ; les deux suivantes
 * sont montrées, désactivées, avec le lieu où elles se font.
 */

export interface LivrableSpatial { type: TypeNouveauProjet; icone: string; titre: string; sous: string }

/** Les quatre livrables de la maquette, sur les quatre types RÉELS d'un projet (`TYPES_NOUVEAU_PROJET`). */
export const LIVRABLES_SPATIAL: readonly LivrableSpatial[] = [
  { type: 'ads', icone: 'spark', titre: 'Publicité', sous: 'Visuel + textes d’annonce, Meta et TikTok' },
  { type: 'image', icone: 'img', titre: 'Image', sous: 'Visuel produit ou lifestyle' },
  { type: 'text', icone: 'text', titre: 'Textes', sous: 'Accroches, texte principal, CTA' },
  { type: 'video', icone: 'phone', titre: 'Vidéo', sous: 'Storyboard, plans et voix · devis avant génération' },
];

export type CleDepartSpatial = 'zero' | 'veille' | 'test';

export interface DepartSpatial { cle: CleDepartSpatial; icone: string; titre: string; sous: string; href: string | null }

/**
 * Les trois points de départ · « zéro » reste ici (le brief s'écrit à l'étape
 * suivante) ; la Veille et le test mènent aux VRAIS écrans d'où un projet part
 * avec sa source (« Préparer une création » dans la Veille, le plan
 * d'itération pour un test). Rien n'est simulé.
 */
export const DEPARTS_SPATIAL: readonly DepartSpatial[] = [
  { cle: 'zero', icone: 'brush', titre: 'Partir de zéro', sous: 'Tu écris le brief, le projet garde tout', href: null },
  { cle: 'veille', icone: 'eye', titre: 'Depuis la Veille', sous: 'Choisis une annonce, puis « Préparer une création »', href: '/veille' },
  { cle: 'test', icone: 'loop', titre: 'Itérer sur un test', sous: 'Reprend l’apprentissage d’une gagnante arbitrée', href: '/studio/iterer' },
];

export interface EtapeNouveauSpatial { n: number; libelle: string; classe: '' | 'on' | 'done' }

/** Les quatre étapes · l'ordre RÉEL (brief avant direction), les deux dernières dans le projet. */
export const LIBELLES_ETAPES_NOUVEAU = ['Que créer ?', 'Brief', 'Style · dans le projet', 'Format & devis · dans le projet'] as const;

export function etapesNouveauSpatial(courante: 1 | 2): EtapeNouveauSpatial[] {
  return LIBELLES_ETAPES_NOUVEAU.map((libelle, i) => ({ n: i + 1, libelle, classe: i + 1 < courante ? 'done' : i + 1 === courante ? 'on' : '' }));
}

/** La phrase de la barre d'action, par étape. */
export function infoEtapeNouveau(courante: 1 | 2): string {
  return courante === 1 ? 'Étape 1 sur 4' : 'Étape 2 sur 4 · gratuit, rien n’est généré';
}

/** Le bandeau Jarvis · ce que Jarvis fait VRAIMENT, et où (proposition payante annoncée, dans le projet). */
export const JARVIS_NOUVEAU = {
  titre: 'Jarvis propose ensuite pour toi',
  sous: 'Une fois le projet créé, Jarvis propose la stratégie et la direction depuis ta fiche marque et tes sources · chaque proposition annonce son prix avant le clic.',
} as const;
