import { droitAutorisePub } from '../../bibliotheque-dossiers';
import { OBJECTIFS_V5, validerFormeBrief, type BriefCanonique, type ObjectifType, type PorteeReference, type ReferenceBrief, type RoleReference } from '../../studios/brief';
import { OBJECTIF_MAX } from '../../studios/anciennes-adresses';
import type { ViolationStudio } from '../../studios/document';
import { idBibliotheque, type FichierCatalogue } from '../../studios/produit/catalogue';
import type { ReferenceProduitEpinglee } from '../../studios/produit/epinglage';
import { ajouterAssociation, estPortee, estRole, LIBELLES_ROLE, ROLES_REFERENCE } from '../../studios/produit/references';
import { construireBriefV5, saisieBriefVide, type SaisieBriefV5 } from '../../studios/ux/assistant-projet';
import { verifierNouveauProjet, type TypeNouveauProjet } from '../../studios/ux/nouveau-projet';
import type { DonneesDrive } from './drive';
import { gestesSelection, validerSelectionFichiers } from './selection';

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
 *  · la phrase dite après (`messageVersement`) ;
 *  · le geste depuis l'APERÇU d'un seul fichier (`versementApercu`) · la règle
 *    de la barre de sélection appliquée à ce fichier ;
 *  · la création d'un projet depuis la fenêtre (`validerCreationVersement`,
 *    `briefCreationVersement`, `messageCreationVersement`) · même règle de nom
 *    que « Nouveau projet » (`verifierNouveauProjet`), puis le même versement ;
 *  · l'intention saisie dès cette création (`validerIntentionCreation`,
 *    `phraseBriefCreation`) · trois champs FACULTATIFS de l'étape brief de
 *    l'assistant, mêmes bornes, même composition (`construireBriefV5`) ;
 *  · ce qui manque avant de pouvoir verser (`raisonVersement`).
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
  const g = validerGeste(x);
  if (!g.ok) return g;
  return { ...g, projectId: x.projectId.toLowerCase() };
}

/** Fichiers, rôle et portée · la part commune au versement dans un projet existant et à la création suivie du versement. */
function validerGeste(x: Record<string, unknown>): { ok: true; ids: string[]; role: RoleReference; scope: PorteeReference } | { ok: false; raison: string } {
  const v = validerSelectionFichiers(x.ids);
  if (!v.ok) return v;
  if (x.role === 'product') return { ok: false, raison: RAISONS_VERSEMENT.roleProduit };
  if (!estRole(x.role) || !ROLES_VERSEMENT.includes(x.role)) return { ok: false, raison: RAISONS_VERSEMENT.role };
  if (!estPortee(x.scope)) return { ok: false, raison: RAISONS_VERSEMENT.portee };
  return { ok: true, ids: v.ids, role: x.role, scope: x.scope };
}

export const RAISON_MARQUE_CREATION = 'Choisis la marque du projet.';

/**
 * L'intention saisie dès la création depuis la fenêtre · les TROIS premiers
 * champs de l'étape brief de l'assistant de création (`SaisieBriefV5`, écran
 * « Nouveau projet ») qui disent ce que le projet doit prouver : « Ton
 * intention » (devient `objective`, le seul champ que la complétude du projet
 * exige), l'objectif typé (`objectifType`, valeurs `OBJECTIFS_V5`) et l'angle
 * (l'idée testée, première pierre d'une hypothèse). Tous FACULTATIFS · vides,
 * le brief reste celui d'avant (`briefCreationVersement()`).
 */
export type IntentionCreation = Pick<SaisieBriefV5, 'intention' | 'objectifType' | 'angle'>;

export function intentionCreationVide(): IntentionCreation {
  return { intention: '', objectifType: null, angle: '' };
}

/** Au moins un champ de l'intention est renseigné · sinon la création reste celle d'avant. */
export function intentionRenseignee(s: IntentionCreation): boolean {
  return s.intention.trim().length > 0 || s.objectifType !== null || s.angle.trim().length > 0;
}

/**
 * Les bornes · celles des champs de l'étape brief (`OBJECTIF_MAX` · « Ton
 * intention » et « Angle » de l'écran « Nouveau projet »), les valeurs
 * autorisées de l'objectif (`OBJECTIFS_V5`). Aucune seconde règle.
 */
export const RAISONS_INTENTION = {
  forme: 'L’intention du projet est illisible · recommence la saisie.',
  intention: `Intention trop longue · ${OBJECTIF_MAX} caractères au plus.`,
  objectif: 'Choisis un objectif de la liste · notoriété, considération, conversion ou fidélisation.',
  angle: `Angle trop long · ${OBJECTIF_MAX} caractères au plus.`,
  brief: 'Le brief n’a pas la forme attendue · vérifie les champs saisis.',
} as const;

/**
 * Ce que la création accepte comme intention · absente (`undefined`/`null`) =
 * vide ; sinon des textes dans la borne de l'écran et un objectif de la liste
 * (ou aucun). Une valeur hors règle est REFUSÉE (jamais tronquée ni ignorée en
 * silence) · rien n'est créé.
 */
export function validerIntentionCreation(x: unknown): { ok: true; intention: IntentionCreation } | { ok: false; raison: string } {
  if (x === undefined || x === null) return { ok: true, intention: intentionCreationVide() };
  if (typeof x !== 'object' || Array.isArray(x)) return { ok: false, raison: RAISONS_INTENTION.forme };
  const o = x as Record<string, unknown>;
  const texte = (v: unknown): string | null => (v === undefined || v === null ? '' : typeof v === 'string' ? v : null);
  const intention = texte(o.intention);
  if (intention === null) return { ok: false, raison: RAISONS_INTENTION.forme };
  if (intention.length > OBJECTIF_MAX) return { ok: false, raison: RAISONS_INTENTION.intention };
  const angle = texte(o.angle);
  if (angle === null) return { ok: false, raison: RAISONS_INTENTION.forme };
  if (angle.length > OBJECTIF_MAX) return { ok: false, raison: RAISONS_INTENTION.angle };
  const ot = o.objectifType;
  if (ot !== undefined && ot !== null && ot !== '' && !(OBJECTIFS_V5 as readonly unknown[]).includes(ot)) return { ok: false, raison: RAISONS_INTENTION.objectif };
  const objectifType = ot === undefined || ot === null || ot === '' ? null : (ot as ObjectifType);
  return { ok: true, intention: { intention, objectifType, angle } };
}

export type EntreeCreationVersementValide = {
  ok: true; brandId: string; titre: string; type: TypeNouveauProjet; ids: string[]; role: RoleReference; scope: PorteeReference;
  /** L'intention relue · vide quand rien n'est saisi (le brief d'avant). */
  intention: IntentionCreation;
};

/**
 * « Nouveau projet » depuis la fenêtre de versement · ce que l'action accepte
 * AVANT de créer quoi que ce soit : la marque (UUID · sa PORTÉE est revérifiée
 * par la création canonique `creerProjet`), le titre et le type par la règle de
 * « Nouveau projet » (`verifierNouveauProjet`), l'intention facultative
 * (`validerIntentionCreation`, puis la forme du brief composé · la vérification
 * de l'assistant), puis les fichiers, le rôle et la portée par la règle du
 * versement. Un seul écart et RIEN n'est créé.
 */
export function validerCreationVersement(e: unknown): EntreeCreationVersementValide | { ok: false; raison: string } {
  const x = (typeof e === 'object' && e !== null ? e : {}) as Record<string, unknown>;
  if (typeof x.brandId !== 'string' || !UUID.test(x.brandId)) return { ok: false, raison: RAISON_MARQUE_CREATION };
  const n = verifierNouveauProjet({ titre: typeof x.titre === 'string' ? x.titre : '', type: typeof x.type === 'string' ? x.type : '' });
  if (!n.ok) return { ok: false, raison: n.message };
  const i = validerIntentionCreation(x.saisie);
  if (!i.ok) return i;
  if (validerFormeBrief(briefCreationVersement(i.intention)).length) return { ok: false, raison: RAISONS_INTENTION.brief };
  const g = validerGeste(x);
  if (!g.ok) return g;
  return { ...g, brandId: x.brandId.toLowerCase(), titre: n.titre, type: n.type, intention: i.intention };
}

/**
 * Le brief écrit à la création depuis la fenêtre · le brief de l'assistant
 * (`construireBriefV5`, les treize champs canoniques) composé depuis
 * l'intention saisie, VIDE si rien n'est saisi · sans lui, le projet n'aurait
 * pas de brief où ranger ses références et le versement serait refusé. Ce qui
 * n'est pas saisi reste à préciser dans le projet (la complétude le dit), rien
 * n'est inventé.
 */
export function briefCreationVersement(intention: IntentionCreation = intentionCreationVide()): BriefCanonique {
  return construireBriefV5({ ...saisieBriefVide(), intention: intention.intention, objectifType: intention.objectifType, angle: intention.angle });
}

/** La phrase sous les champs de création · ce que le brief emporte, et ce qui restera à préciser. */
export function phraseBriefCreation(marque: string, s: IntentionCreation): string {
  const tete = `Projet de la marque ${marque}`;
  if (s.intention.trim()) return `${tete} · ton intention ouvre son brief, le reste se précise dans le projet.`;
  if (intentionRenseignee(s)) return `${tete} · sans intention, l’objectif de son brief reste à préciser dans le projet.`;
  return `${tete} · son brief reste à préciser dans le projet.`;
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

/**
 * La phrase dite après « Créer le projet et verser » · le projet est créé dans
 * les deux cas (création voulue par la personne, jamais défaite). Si le
 * versement a échoué, on le DIT, avec sa raison, et le projet reste choisi
 * pour réessayer le seul versement.
 */
export function messageCreationVersement(
  titre: string,
  v: { ok: true; ajoutes: number; dejaPresents: number; role: RoleReference } | { ok: false; raison: string },
): string {
  const t = `« ${titre.trim() || 'Projet sans titre'} »`;
  if (v.ok) return `Projet ${t} créé · ${messageVersement(v.ajoutes, v.dejaPresents, titre, v.role)}`;
  return `Projet ${t} créé, mais aucune image n’y a été versée · ${v.raison.replace(/[.\s]+$/, '')}. Le projet reste · réessaie le versement ou ouvre-le.`;
}

export type ModeVersement = 'existant' | 'nouveau';

/**
 * Ce qui manque avant de pouvoir verser · null = le bouton est ouvert. Dans un
 * projet existant : un projet ; dans un nouveau projet : la marque (état
 * « prêt » de « Nouveau projet »), le titre et le type (`verifierNouveauProjet`),
 * l'intention facultative dans ses bornes (`validerIntentionCreation`).
 * Puis le rôle et la portée, jamais déduits.
 */
export function raisonVersement(e: {
  occupe: boolean; selection: Pick<VersementSelection, 'versables' | 'phrase'>; mode: ModeVersement;
  projectId: string; creation: { marque: boolean; titre: string; type: string; saisie?: unknown }; role: string; scope: string;
}): string | null {
  if (e.occupe) return 'Versement en cours…';
  if (!e.selection.versables.length) return e.selection.phrase;
  if (e.mode === 'existant' && !e.projectId) return RAISONS_VERSEMENT.projet;
  if (e.mode === 'nouveau') {
    if (!e.creation.marque) return RAISON_MARQUE_CREATION;
    const n = verifierNouveauProjet({ titre: e.creation.titre, type: e.creation.type });
    if (!n.ok) return n.message;
    const i = validerIntentionCreation(e.creation.saisie);
    if (!i.ok) return i.raison;
  }
  if (!e.role) return RAISONS_VERSEMENT.role;
  if (!e.scope) return RAISONS_VERSEMENT.portee;
  return null;
}

export interface GesteVersementApercu {
  /** Le libellé du geste de la barre · le même mot aux deux endroits. */
  libelle: string;
  ouvert: boolean;
  /** Pourquoi le geste est fermé · la lecture seule, ou la raison d'écart du fichier. */
  raison: string | null;
  /** Ce que la fenêtre reçoit · le seul fichier de l'aperçu. */
  fichiers: Array<{ id: string }>;
}

/**
 * « Utiliser dans un projet » depuis l'APERÇU d'un fichier · la règle de la
 * barre de sélection (`gestesSelection`) appliquée à ce seul fichier : il n'est
 * PROPOSÉ (non null) que pour un fichier vivant de la bibliothèque · ni en
 * corbeille (ni sous un dossier en corbeille), ni sortie Studios, ni ancienne
 * création. En lecture seule, il est FERMÉ avec sa raison ; un fichier qui ne
 * peut pas devenir une référence (pas une image, droits) le ferme avec la
 * raison d'écart de `versementSelection`.
 */
export function versementApercu(d: DonneesDrive, fichierId: string, lectureSeule: string | null): GesteVersementApercu | null {
  const s = gestesSelection(d, [fichierId], { section: 'drive', lectureSeule: null, ia: false });
  const g = s.gestes.find((x) => x.cle === 'projet');
  if (s.fichiers.length !== 1 || !g?.ouvert) return null;
  const fichiers = [{ id: s.fichiers[0]!.id }];
  const libelle = g.libelle;
  if (lectureSeule !== null) return { libelle, ouvert: false, raison: lectureSeule, fichiers };
  const v = versementSelection(d, fichiers);
  if (!v.versables.length) return { libelle, ouvert: false, raison: v.ecartes[0]?.raison ?? v.phrase, fichiers };
  return { libelle, ouvert: true, raison: null, fichiers };
}
