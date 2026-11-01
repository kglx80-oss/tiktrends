import { droitAutorisePub } from '../../bibliotheque-dossiers';
import type { PorteeReference, ReferenceBrief, RoleReference } from '../../studios/brief';
import type { ViolationStudio } from '../../studios/document';
import { idBibliotheque, type FichierCatalogue } from '../../studios/produit/catalogue';
import type { ReferenceProduitEpinglee } from '../../studios/produit/epinglage';
import { ajouterAssociation, estPortee, estRole, LIBELLES_ROLE, ROLES_REFERENCE } from '../../studios/produit/references';
import type { DonneesDrive } from './drive';
import { validerSelectionFichiers } from './selection';

/**
 * Bibliothèque · « UTILISER DANS UN PROJET » · RÈGLES PURES (ni base, ni réseau).
 *
 * Le geste verse les fichiers sélectionnés dans les RÉFÉRENCES TYPÉES d'un
 * projet Studios (`brief.references`) · le MÊME chemin que l'écran « Produit et
 * références » d'un projet (`associerReference`) : même catalogue serveur (les
 * images de la bibliothèque, communes ou de la marque du projet, hors corbeille,
 * droits autorisés en publicité), même règle par association
 * (`ajouterAssociation`), même rôle et même portée EXPLICITES (aucun rôle n'est
 * déduit), même écriture (une nouvelle version, verrou, 409, audit). Aucune
 * seconde liste de références n'est inventée.
 *
 * Ce module dit :
 *  · ce qui part et ce qui est écarté AVANT le clic, et pourquoi
 *    (`versementSelection`) · les références d'un projet sont des images ;
 *  · ce que l'action accepte (`validerVersement`) ;
 *  · pourquoi un fichier est refusé côté serveur (`refusFichiersVersement`) ·
 *    un seul refus et RIEN n'est versé (tout ou rien) ;
 *  · les références après versement (`verserReferences`) · les doublons
 *    (même fichier, même rôle) ne sont pas ajoutés une seconde fois ;
 *  · la phrase dite après (`messageVersement`).
 */

/** Le rôle Produit est réservé aux photos du produit épinglé (`violationsAssociation`) · jamais à une image de la bibliothèque. */
export const ROLES_VERSEMENT: readonly RoleReference[] = ROLES_REFERENCE.filter((r) => r !== 'product');

export const RAISONS_ECART_VERSEMENT = {
  type: 'Pas une image · les références d’un projet sont des images.',
  droits: 'Droits d’usage qui n’autorisent pas la publicité · précise-les d’abord.',
} as const;

export interface FichierVersable { id: string; nom: string }
export interface FichierEcarte { id: string; nom: string; raison: string }

export interface VersementSelection {
  versables: FichierVersable[];
  ecartes: FichierEcarte[];
  /** La phrase de la fenêtre · ce qui part, ce qui reste et pourquoi. */
  phrase: string;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Ce que le geste versera · parmi les FICHIERS de la sélection (déjà filtrés
 * par `gestesSelection` · jamais un dossier, jamais un fichier en lecture
 * seule), les images dont les droits autorisent la publicité. Les autres sont
 * écartés, nommés, avec leur raison · rien n'est retiré en silence.
 */
export function versementSelection(d: DonneesDrive, fichiers: ReadonlyArray<{ id: string }>): VersementSelection {
  const parId = new Map(d.fichiers.map((f) => [f.id, f] as const));
  const versables: FichierVersable[] = [];
  const ecartes: FichierEcarte[] = [];
  for (const { id } of fichiers) {
    const f = parId.get(id);
    if (!f) continue;
    if (f.type !== 'image') ecartes.push({ id, nom: f.nom, raison: RAISONS_ECART_VERSEMENT.type });
    else if (!droitAutorisePub(f.droit)) ecartes.push({ id, nom: f.nom, raison: RAISONS_ECART_VERSEMENT.droits });
    else versables.push({ id, nom: f.nom });
  }
  const nv = versables.length, ne = ecartes.length;
  const phrase = !nv
    ? `Aucune image à verser · ${ne > 1 ? `les ${ne} fichiers sont écartés` : 'le fichier est écarté'}.`
    : `${pluriel(nv, 'image')} ${nv > 1 ? 'deviendront des références' : 'deviendra une référence'} du projet${ne ? ` · ${pluriel(ne, 'fichier')} ${ne > 1 ? 'écartés' : 'écarté'}` : ''}.`;
  return { versables, ecartes, phrase };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RAISONS_VERSEMENT = {
  projet: 'Choisis un projet.',
  role: 'Choisis un rôle · aucun rôle n’est déduit du fichier.',
  roleProduit: 'Le rôle Produit est réservé aux photos du produit épinglé · choisis un autre rôle.',
  portee: 'Choisis une portée.',
} as const;

export type EntreeVersementValide = { ok: true; projectId: string; ids: string[]; role: RoleReference; scope: PorteeReference };

/**
 * Ce que l'action accepte · un projet (UUID), une liste de fichiers (mêmes
 * bornes que les autres gestes groupés · `validerSelectionFichiers`), un rôle
 * de versement et une portée. Tout écart refuse le geste ENTIER.
 */
export function validerVersement(e: unknown): EntreeVersementValide | { ok: false; raison: string } {
  const x = (typeof e === 'object' && e !== null ? e : {}) as Record<string, unknown>;
  if (typeof x.projectId !== 'string' || !UUID.test(x.projectId)) return { ok: false, raison: RAISONS_VERSEMENT.projet };
  const v = validerSelectionFichiers(x.ids);
  if (!v.ok) return v;
  if (x.role === 'product') return { ok: false, raison: RAISONS_VERSEMENT.roleProduit };
  if (!estRole(x.role) || !ROLES_VERSEMENT.includes(x.role)) return { ok: false, raison: RAISONS_VERSEMENT.role };
  if (!estPortee(x.scope)) return { ok: false, raison: RAISONS_VERSEMENT.portee };
  return { ok: true, projectId: x.projectId.toLowerCase(), ids: v.ids, role: x.role, scope: x.scope };
}

/** Une ligne `assets` relue dans l'espace de la session (jamais prise du navigateur). */
export interface LigneMediaVersement {
  id: string;
  name: string;
  kind: string;
  brandId: string | null;
  rights: string | null;
  supprime: boolean;
}

/**
 * Pourquoi chaque fichier demandé ne peut PAS devenir une référence du projet ·
 * même règle que le catalogue du projet (image, commune ou de la marque du
 * projet, hors corbeille, droits autorisés en publicité). Un identifiant sans
 * ligne (autre espace, inconnu) est « introuvable » · la même phrase dans les
 * deux cas, rien ne fuit d'un autre espace. Liste vide = tout est versable.
 */
export function refusFichiersVersement(lignes: readonly LigneMediaVersement[], ids: readonly string[], brandProjet: string): ViolationStudio[] {
  const parId = new Map(lignes.map((l) => [l.id.toLowerCase(), l] as const));
  const out: ViolationStudio[] = [];
  ids.forEach((id, i) => {
    const l = parId.get(id.toLowerCase());
    const chemin = `fichiers/${i}`;
    if (!l) { out.push({ chemin, raison: 'Un fichier sélectionné est introuvable dans cet espace.' }); return; }
    const nom = `« ${l.name.slice(0, 80) || 'Fichier'} »`;
    if (l.supprime) out.push({ chemin, raison: `${nom} est à la corbeille.` });
    else if (l.kind !== 'image') out.push({ chemin, raison: `${nom} n’est pas une image · les références d’un projet sont des images.` });
    else if (l.brandId !== null && l.brandId !== brandProjet) out.push({ chemin, raison: `${nom} appartient à une autre marque que le projet.` });
    else if (!droitAutorisePub(l.rights)) out.push({ chemin, raison: `${nom} a des droits d’usage qui n’autorisent pas la publicité.` });
  });
  return out;
}

export type ResultatVersement =
  | { ok: true; references: ReferenceBrief[]; ajoutes: string[]; dejaPresents: string[] }
  | { ok: false; violations: ViolationStudio[] };

/**
 * Les références du brief après versement · chaque fichier passe par
 * `ajouterAssociation` (la règle de l'écran « Produit et références »), avec
 * le rôle et la portée choisis. Un fichier qui porte DÉJÀ ce rôle n'est pas
 * ajouté une seconde fois (`dejaPresents`) ; une seule violation et rien n'est
 * versé.
 */
export function verserReferences(
  refs: readonly ReferenceBrief[], uuids: readonly string[], role: RoleReference, scope: PorteeReference,
  fichiers: ReadonlyMap<string, FichierCatalogue>, produit: ReferenceProduitEpinglee | null,
): ResultatVersement {
  let courantes: ReferenceBrief[] = [...refs];
  const ajoutes: string[] = [];
  const dejaPresents: string[] = [];
  for (const u of uuids) {
    const assetId = idBibliotheque(u);
    if (courantes.some((r) => r.assetId === assetId && r.role === role)) { dejaPresents.push(u); continue; }
    const r = ajouterAssociation(courantes, { assetId, role, scope }, fichiers, produit);
    if (!r.ok) return { ok: false, violations: r.violations };
    courantes = r.references;
    ajoutes.push(u);
  }
  return { ok: true, references: courantes, ajoutes, dejaPresents };
}

/** La phrase dite après un versement réussi. */
export function messageVersement(ajoutes: number, dejaPresents: number, projet: string, role: RoleReference): string {
  const titre = `« ${projet.trim() || 'Projet sans titre'} »`;
  const deja = dejaPresents ? `${pluriel(dejaPresents, 'image')} ${dejaPresents > 1 ? 'y étaient' : 'y était'} déjà avec ce rôle` : '';
  if (!ajoutes) return `Rien de nouveau dans ${titre} · ${deja || 'aucune image versée'}.`;
  return `${pluriel(ajoutes, 'image')} ${ajoutes > 1 ? 'versées' : 'versée'} dans ${titre} · rôle ${LIBELLES_ROLE[role]}${deja ? ` · ${deja}` : ''}.`;
}

/** Les médias de la bibliothèque CITÉS par les références d'un brief (`bib_<uuid>`) · le catalogue les garde lisibles. */
export function uuidsBibliothequeCites(brief: unknown): string[] {
  const refs = typeof brief === 'object' && brief !== null ? (brief as { references?: unknown }).references : undefined;
  if (!Array.isArray(refs)) return [];
  const out = new Set<string>();
  for (const r of refs.slice(0, 200)) {
    const a = typeof r === 'object' && r !== null ? (r as { assetId?: unknown }).assetId : undefined;
    if (typeof a === 'string' && a.startsWith('bib_') && UUID.test(a.slice(4))) out.add(a.slice(4).toLowerCase());
  }
  return [...out];
}
