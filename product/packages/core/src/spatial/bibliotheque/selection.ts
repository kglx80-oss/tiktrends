import { estDroitAsset, libelleDroit, type DroitAsset } from '../../bibliotheque-dossiers';
import { selectionATaguer, type DonneesDrive, type FichierDrive, type SectionDrive } from './drive';
import { TAG_SELECTION_MAX } from './tags-couleur';

/**
 * Bibliothèque · la BARRE DE SÉLECTION · RÈGLES PURES (ni base, ni réseau).
 *
 * La maquette (`bibliotheque`, `vBib` · `chk(k)` sur chaque carte de fichier et
 * chaque ligne de la liste) sélectionne les DOSSIERS et les FICHIERS. Ce module
 * dit, pour une sélection donnée, ce qui est sélectionnable, sa composition
 * (dossiers seuls, fichiers seuls, mixte) et les gestes de la barre · chacun
 * ouvert, ou fermé avec la phrase dite à l'écran. Le JSX ne décide rien.
 *
 * Les gestes OUVERTS sont exactement ceux qui ont une action serveur, à l'unité
 * ET groupée :
 *  · « Mettre à la corbeille » / « Restaurer » · les dossiers (`supprimerDossierAction`,
 *    `restaurerDossierAction`) et les fichiers (`mettreAssetsCorbeilleAction`,
 *    `restaurerAssetsAction` · tout ou rien, réversible, aucun objet du bucket effacé) ;
 *  · « Tag de couleur » · les dossiers (`definirTagDossiersAction`) ;
 *  · « Déplacer vers… » · les fichiers (`affecterAssetsDossierAction`) ;
 *  · « Droits d'usage » · les fichiers (`definirDroitsAssetsAction`) ;
 *  · « Servir à l'IA » · les fichiers (`basculerAssetsIaAction`) ;
 *  · « Utiliser dans un projet » · les fichiers, versés dans les références
 *    d'un projet Studios (`verserSelectionDansProjet` · règles dans `versement.ts`).
 *
 * « Télécharger » (fichiers et dossiers, en archive ZIP · route `/api/bibliotheque/archive`)
 * est une LECTURE · son geste est décidé à part (`gesteTelechargement`, `archive.ts`).
 *
 * Les gestes de la maquette SANS action serveur restent fermés, avec leur
 * raison (`GESTES_SANS_ACTION`) · rien n'est simulé. Ne sont PAS groupés, par
 * décision : la suppression DÉFINITIVE d'un fichier (réservée à un fichier déjà
 * dans la corbeille, à l'unité et confirmée dans l'aperçu), l'analyse d'image
 * (payante, prix annoncé à l'unité) et le rangement en template (coulisses de
 * l'agence, à l'unité).
 */

/** Un fichier de la bibliothèque (ni sortie Studios, ni ancienne création) · le seul qui se sélectionne. */
export function fichierSelectionnable(f: Pick<FichierDrive, 'lectureSeule'>): boolean {
  return !f.lectureSeule;
}

export type CompositionSelection = 'vide' | 'dossiers' | 'fichiers' | 'mixte';
export type CleGesteSelection = 'corbeille' | 'restaurer' | 'tag' | 'ranger' | 'droits' | 'ia' | 'projet';

export interface GesteSelection {
  cle: CleGesteSelection;
  libelle: string;
  ouvert: boolean;
  /** Pourquoi le geste est fermé · null quand il est ouvert. */
  raison: string | null;
}

/**
 * « Partager au client » · FERMÉ par décision. Un lecteur client (`client_viewer`)
 * n'a pas la lecture de la Bibliothèque, et le lien interne (« Copier le lien »)
 * ne s'ouvre que pour un membre connecté de l'espace · un vrai partage hors de
 * l'espace demande un lien public signé, son expiration et sa révocation,
 * à décider par le propriétaire.
 */
export const RAISON_PARTAGE_CLIENT = 'Le partage au client demande un lien public signé, avec expiration et révocation · en attente de la décision du propriétaire. « Copier le lien » donne un lien interne, réservé aux membres de l’espace.';

/** Les gestes de la barre de la maquette qu'aucune action serveur ne porte · fermés, avec leur raison. */
export const GESTES_SANS_ACTION: ReadonlyArray<{ cle: 'partager' | 'favori'; libelle: string; icone: string; raison: string }> = [
  { cle: 'partager', libelle: 'Partager au client', icone: 'users', raison: RAISON_PARTAGE_CLIENT },
  { cle: 'favori', libelle: 'Favori', icone: 'bookmark', raison: 'Les favoris n’existent pas encore · aucune donnée ne les porte.' },
];

export const RAISONS_SELECTION = {
  corbeilleVide: 'Rien à mettre à la corbeille dans la sélection.',
  tagFichiers: 'Les fichiers ne portent pas de tag · seuls les dossiers en portent un.',
  rangerDossiers: 'Un dossier ne se déplace pas · seuls les fichiers se rangent dans un dossier.',
  droitsDossiers: 'Un dossier ne porte pas de droits d’usage · seuls les fichiers en portent.',
  iaDossiers: 'Un dossier n’a pas de réglage IA · seuls les fichiers servent à l’IA.',
  projetDossiers: 'Un dossier ne se verse pas dans un projet · seules les images deviennent des références.',
  restaurerVide: 'Aucun élément de la corbeille dans la sélection.',
} as const;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** La phrase du refus de borne pour les fichiers · la même avant le clic (écran) et après (action). */
export function refusSelectionFichiersTropLarge(n: number): string {
  return `${n} fichiers sélectionnés · ${TAG_SELECTION_MAX} au plus par geste, rien n’a été modifié.`;
}

export interface SelectionDrive {
  composition: CompositionSelection;
  /** Les dossiers RÉELS sélectionnés · vivants hors corbeille, en corbeille dans la section « Corbeille ». */
  dossiers: Array<{ id: string; nom: string }>;
  /** Les fichiers de la bibliothèque sélectionnés (jamais une sortie Studios ni une ancienne création) · vivants hors corbeille, en corbeille dans la section « Corbeille ». */
  fichiers: Array<{ id: string; nom: string; droit: string | null; utilisable: boolean | null }>;
  /** Les gestes de la barre, dans son ordre. */
  gestes: GesteSelection[];
  /** « Servir à l'IA » · ce que le geste écrira (`false` quand TOUS les fichiers y servent déjà · il les en retire). */
  iaCible: boolean;
  /** Le droit porté par TOUS les fichiers (pré-choisi dans la liste) · `undefined` s'ils diffèrent. */
  droitCommun: string | null | undefined;
  /** L'invite de la liste « Droits d'usage » · le droit commun quand il y en a un. */
  inviteDroits: string;
  /** La phrase de la barre · ce que la composition laisse hors des gestes. Null sans rien à dire. */
  note: string | null;
}

export interface ContexteSelection {
  section: SectionDrive;
  /** La raison de la lecture seule · null = écriture ouverte. Tous les gestes se ferment avec elle. */
  lectureSeule: string | null;
  /** L'écran porte les gestes d'usage par l'IA (écran V5 porté) · sans eux, « Servir à l'IA » n'apparaît pas. */
  ia: boolean;
}

/**
 * La barre de sélection · les identifiants inconnus (disparus depuis), les
 * racines, les projets Studios, les dossiers verrouillés (système) et les
 * fichiers en lecture seule ne comptent pas · ils ne sont jamais envoyés.
 */
export function gestesSelection(d: DonneesDrive, selection: Iterable<string>, ctx: ContexteSelection): SelectionDrive {
  const ids = new Set(selection);
  const parDossier = new Map(d.dossiers.map((x) => [x.id, x] as const));
  const corbeille = ctx.section === 'corbeille';
  // Vivant · ni lui ni un ancêtre en corbeille (même règle que la vue).
  const vivant = (id: string): boolean => {
    const vus = new Set<string>();
    let cur = parDossier.get(id);
    while (cur && !vus.has(cur.id)) { if (cur.supprime) return false; vus.add(cur.id); cur = cur.parent ? parDossier.get(cur.parent) : undefined; }
    return !!parDossier.get(id);
  };
  const dossiers: SelectionDrive['dossiers'] = [];
  for (const id of ids) {
    const x = parDossier.get(id);
    if (!x?.reel || x.verrouille) continue;
    if (corbeille ? x.supprime : vivant(id)) dossiers.push({ id, nom: x.nom });
  }
  const fichiers: SelectionDrive['fichiers'] = d.fichiers
    .filter((f) => ids.has(f.id) && fichierSelectionnable(f) && (corbeille ? !!f.supprime : !f.supprime && vivant(f.parent)))
    .map((f) => ({ id: f.id, nom: f.nom, droit: f.droit, utilisable: f.ia ? f.ia.utilisable : null }));

  const nd = dossiers.length, nf = fichiers.length;
  const composition: CompositionSelection = nd && nf ? 'mixte' : nd ? 'dossiers' : nf ? 'fichiers' : 'vide';
  const ls = ctx.lectureSeule;
  const geste = (cle: CleGesteSelection, libelle: string, raison: string | null): GesteSelection => {
    const r = ls ?? raison;
    return { cle, libelle, ouvert: r === null, raison: r };
  };
  const bornes = nf > TAG_SELECTION_MAX ? refusSelectionFichiersTropLarge(nf) : null;
  const pourFichiers = (vide: string) => (!nf ? vide : bornes);

  let gestes: GesteSelection[];
  // Le refus de BORNE du tag (trop de dossiers) · dit aussi dans la phrase de la barre.
  let borneTag: string | null = null;
  if (corbeille) {
    gestes = [geste('restaurer', 'Restaurer', nf ? bornes : nd ? null : RAISONS_SELECTION.restaurerVide)];
  } else {
    const tag = selectionATaguer(d, ids);
    borneTag = tag.dossiers.length ? tag.refus : null;
    gestes = [
      geste('corbeille', 'Mettre à la corbeille', nf ? bornes : nd ? null : RAISONS_SELECTION.corbeilleVide),
      geste('tag', 'Tag de couleur', composition === 'fichiers' ? RAISONS_SELECTION.tagFichiers : tag.refus),
      geste('ranger', 'Déplacer vers…', pourFichiers(RAISONS_SELECTION.rangerDossiers)),
      geste('droits', 'Droits d’usage', pourFichiers(RAISONS_SELECTION.droitsDossiers)),
      ...(ctx.ia ? [geste('ia', fichiers.length && fichiers.every((f) => f.utilisable === true) ? 'Ne plus servir à l’IA' : 'Servir à l’IA', pourFichiers(RAISONS_SELECTION.iaDossiers))] : []),
      geste('projet', 'Utiliser dans un projet', pourFichiers(RAISONS_SELECTION.projetDossiers)),
    ];
  }

  const iaCible = !(fichiers.length > 0 && fichiers.every((f) => f.utilisable === true));
  const premier = fichiers[0]?.droit ?? null;
  const droitCommun = fichiers.length && fichiers.every((f) => f.droit === premier) ? premier : undefined;

  const inviteDroits = droitCommun === undefined ? 'Droits d’usage…'
    : `Droits d’usage · ${droitCommun && estDroitAsset(droitCommun) ? libelleDroit(droitCommun) : 'non classés'}`;

  const gestesFichiers = ctx.ia ? 'déplacer, droits et IA' : 'déplacer et droits';
  const note = ls ? ls
    : bornes ? bornes
      : borneTag ? borneTag
      : corbeille || composition === 'vide' ? null
        : composition === 'mixte' ? `Sélection mixte · corbeille pour tous, tag pour ${pluriel(nd, 'dossier')}, ${gestesFichiers} pour ${pluriel(nf, 'fichier')}.`
          : composition === 'fichiers' ? 'Les fichiers ne portent pas de tag · à la corbeille, ils restent restaurables.'
            : `Les gestes des fichiers (${gestesFichiers}) ne s’appliquent pas à un dossier.`;

  return { composition, dossiers, fichiers, gestes, iaCible, droitCommun, inviteDroits, note };
}

/* ───────────────────────────── Ce que les actions acceptent ───────────────────────────── */

/** Un identifiant de média · `assets.id` est un UUID (une autre forme ferait échouer la requête). */
const ID_MEDIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La liste d'une action groupée sur les FICHIERS · des UUID, dédoublonnés,
 * entre 1 et `TAG_SELECTION_MAX` (même borne, même raison que le tag d'une
 * sélection de dossiers · la sélection se fait à la main, une case par carte,
 * dans une vue). Tout écart refuse le geste ENTIER, avec la phrase dite à
 * l'écran · jamais une liste tronquée en silence.
 */
export function validerSelectionFichiers(ids: unknown): { ok: true; ids: string[] } | { ok: false; raison: string } {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' || !ID_MEDIA.test(x))) return { ok: false, raison: 'Sélection illisible · rien n’a été modifié.' };
  const uniques = [...new Set((ids as string[]).map((x) => x.toLowerCase()))];
  if (!uniques.length) return { ok: false, raison: 'Aucun fichier sélectionné.' };
  if (uniques.length > TAG_SELECTION_MAX) return { ok: false, raison: refusSelectionFichiersTropLarge(uniques.length) };
  return { ok: true, ids: uniques };
}

/** Le droit d'usage posé sur une sélection · une clé du catalogue normatif, ou `null` (non classé). */
export function validerDroitSelection(ids: unknown, droit: unknown): { ok: true; ids: string[]; droit: DroitAsset | null } | { ok: false; raison: string } {
  if (droit !== null && !estDroitAsset(droit)) return { ok: false, raison: 'Droit d’usage inconnu.' };
  const v = validerSelectionFichiers(ids);
  return v.ok ? { ok: true, ids: v.ids, droit: (droit ?? null) as DroitAsset | null } : v;
}

/** L'usage par l'IA posé sur une sélection · un booléen, rien d'autre. */
export function validerIaSelection(ids: unknown, useForAi: unknown): { ok: true; ids: string[]; useForAi: boolean } | { ok: false; raison: string } {
  if (typeof useForAi !== 'boolean') return { ok: false, raison: 'Réglage IA illisible · rien n’a été modifié.' };
  const v = validerSelectionFichiers(ids);
  return v.ok ? { ok: true, ids: v.ids, useForAi } : v;
}

/** Le message dit après un geste groupé sur les fichiers. */
export function messageGesteFichiers(geste: 'ranger' | 'droits' | 'ia', n: number, detail?: { dossier?: string; useForAi?: boolean }): string {
  const s = n > 1 ? 's' : '';
  if (geste === 'ranger') return `${pluriel(n, 'fichier')} rangé${s} dans « ${detail?.dossier ?? ''} »`;
  if (geste === 'droits') return `Droits d’usage enregistrés pour ${pluriel(n, 'fichier')}`;
  return detail?.useForAi ? `${pluriel(n, 'fichier')} ${n > 1 ? 'peuvent' : 'peut'} servir à l’IA` : `${pluriel(n, 'fichier')} ne ${n > 1 ? 'serviront' : 'servira'} plus à l’IA`;
}
