import { cheminProjetStudio } from '../../studios/bibliotheque';
import { estRole, LIBELLES_ROLE } from '../../studios/produit/references';
import type { FichierDrive } from './drive';

/**
 * Bibliothèque · « UTILISÉ DANS » · RÈGLES PURES (ni base, ni réseau).
 *
 * L'aperçu d'un fichier de la bibliothèque dit quels projets Studios le
 * CITENT. Une seule source le permet : les RÉFÉRENCES TYPÉES du brief de la
 * VERSION COURANTE d'un projet (`brief.references[].assetId = bib_<uuid>`,
 * écrites par l'écran « Produit et références » ou par « Utiliser dans un
 * projet »). Les autres traces d'un projet ne citent jamais un fichier de la
 * bibliothèque · `studio_projects.source_refs` porte des annonces observées
 * ou sauvegardées et des créations (`src_<hex>` opaques), `productRef` les
 * photos du catalogue produit, le catalogue du projet n'est qu'une lecture de
 * la bibliothèque (il ne cite rien).
 *
 * La page lit les projets que la session VOIT (même lecture que la page
 * Studios · garde, capacité « projets », portée espace et marques), bornée
 * aux `PROJETS_UTILISATION_MAX` plus récemment modifiés dont la version
 * courante cite au moins un fichier de la bibliothèque · ce module en tire,
 * pour chaque fichier, les projets qui le citent et les rôles qu'il y tient,
 * et ce que l'aperçu affiche. Rien n'est déduit · une référence illisible ne
 * compte pas.
 */

/** Projets lus au plus (les plus récemment modifiés qui citent la bibliothèque) · la même borne que la lecture des cartes Studios. */
export const PROJETS_UTILISATION_MAX = 200;
/** Références lues au plus par brief · la même borne que le catalogue (`uuidsBibliothequeCites`). */
export const REFERENCES_LUES_MAX = 200;
/** Projets montrés dans l'aperçu · le reste est compté (« et N autres »). */
export const PROJETS_APERCU_MAX = 6;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un projet relu dans la portée de la session, avec les références BRUTES de sa version courante. */
export interface LigneProjetUtilisation {
  id: string;
  titre: string;
  marque: string;
  statut: 'active' | 'archived';
  /** `content.brief.references` de la version courante · jamais pris du navigateur. */
  references: unknown;
}

export interface ProjetCitant {
  id: string;
  titre: string;
  marque: string;
  /** L'écran « Produit et références » du projet · là où la référence se voit et se retire. */
  href: string;
  /** Les rôles que le fichier tient dans ce projet (libellés), dans l'ordre du brief. */
  roles: string[];
  archive: boolean;
}

export interface UtilisationsBibliotheque {
  /** uuid du fichier (minuscules) → projets qui le citent · actifs d'abord, puis l'ordre de lecture (plus récents). */
  parFichier: Record<string, ProjetCitant[]>;
  /** La lecture a atteint `PROJETS_UTILISATION_MAX` · un projet plus ancien peut manquer, l'aperçu le dit. */
  borne: boolean;
}

/** uuid de bibliothèque → rôles (dédoublonnés, ordre du brief) · seules les références lisibles comptent. */
export function rolesBibliothequeCites(references: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!Array.isArray(references)) return out;
  for (const r of references.slice(0, REFERENCES_LUES_MAX)) {
    if (typeof r !== 'object' || r === null) continue;
    const { assetId, role } = r as { assetId?: unknown; role?: unknown };
    if (typeof assetId !== 'string' || !assetId.startsWith('bib_') || !UUID.test(assetId.slice(4)) || !estRole(role)) continue;
    const id = assetId.slice(4).toLowerCase();
    const roles = out.get(id) ?? [];
    if (!roles.includes(LIBELLES_ROLE[role])) roles.push(LIBELLES_ROLE[role]);
    out.set(id, roles);
  }
  return out;
}

/**
 * Les projets qui citent chaque fichier · `lignes` dans l'ordre de lecture
 * (plus récemment modifiés d'abord), déjà relues dans la portée de la session.
 * Un identifiant de projet en double ne compte qu'une fois.
 */
export function utilisationsBibliotheque(lignes: readonly LigneProjetUtilisation[], o: { borne: boolean }): UtilisationsBibliotheque {
  const parFichier: Record<string, ProjetCitant[]> = {};
  const vus = new Set<string>();
  const ordonnees = [...lignes.filter((l) => l.statut === 'active'), ...lignes.filter((l) => l.statut !== 'active')];
  for (const l of ordonnees) {
    if (vus.has(l.id)) continue;
    vus.add(l.id);
    for (const [id, roles] of rolesBibliothequeCites(l.references)) {
      (parFichier[id] ??= []).push({
        id: l.id, titre: l.titre.trim() || 'Projet sans titre', marque: l.marque, href: `${cheminProjetStudio(l.id)}/produit`, roles, archive: l.statut !== 'active',
      });
    }
  }
  return { parFichier, borne: o.borne };
}

export interface VueUtiliseDans {
  libelle: 'Utilisé dans';
  /** Les projets montrés · au plus `PROJETS_APERCU_MAX`. */
  projets: ProjetCitant[];
  /** Les projets qui le citent aussi, au-delà de ceux montrés. */
  reste: number;
  /** La phrase sous la liste (ou à sa place) · null sans rien à dire. */
  phrase: string | null;
}

export const PHRASES_UTILISE_DANS = {
  aucun: 'Aucun projet Studios que tu vois ne le cite dans sa version courante.',
  borne: `Lecture limitée aux ${PROJETS_UTILISATION_MAX} projets les plus récemment modifiés qui citent la bibliothèque.`,
} as const;

/**
 * Ce que l'aperçu d'un fichier montre sous « Utilisé dans » · `null` quand
 * l'aperçu ne le montre pas : la lecture des projets n'est pas ouverte à la
 * session (garde ou capacité Studios refusée · ne rien dire plutôt que « aucun
 * projet »), ou le fichier n'est pas un fichier de la bibliothèque (une sortie
 * Studios mène déjà à son projet, une ancienne création n'est citée par aucun).
 */
export function vueUtiliseDans(u: UtilisationsBibliotheque | null, f: Pick<FichierDrive, 'id' | 'lectureSeule'>): VueUtiliseDans | null {
  if (!u || f.lectureSeule) return null;
  const tous = u.parFichier[f.id.toLowerCase()] ?? [];
  const projets = tous.slice(0, PROJETS_APERCU_MAX);
  const reste = tous.length - projets.length;
  const phrase = !tous.length
    ? (u.borne ? `${PHRASES_UTILISE_DANS.aucun} ${PHRASES_UTILISE_DANS.borne}` : PHRASES_UTILISE_DANS.aucun)
    : [reste ? `Et ${reste} autre${reste > 1 ? 's' : ''} projet${reste > 1 ? 's' : ''}.` : '', u.borne ? PHRASES_UTILISE_DANS.borne : ''].filter(Boolean).join(' ') || null;
  return { libelle: 'Utilisé dans', projets, reste, phrase };
}

/** La ligne d'un projet dans l'aperçu · marque, rôles, archivé. */
export function detailProjetCitant(p: Pick<ProjetCitant, 'marque' | 'roles' | 'archive'>): string {
  return [p.marque, p.roles.join(', '), p.archive ? 'archivé' : ''].filter(Boolean).join(' · ');
}
