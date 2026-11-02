'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  vueDrive, cheminVers, dossiersRangement, pastilleDroit, formatTaille, libelleJour, ETAT_DRIVE_INITIAL, SECTIONS_DRIVE, DROITS_ASSET,
  LIBELLE_TYPE_FICHIER, FILTRES_TYPE_DRIVE, resumeImportDrive, TYPES_IMPORT_LIEN, type FiltreTypeDrive, lireImportLiens, type TypeImportLien, type DonneesDrive, type EtatDrive, type ConnexionDriveSpatiale, type FichierDrive, type DroitAsset, type SectionDrive, type TriDrive,
  TAGS_COULEUR, messageTagPose, messageTagSelection, noteSelectionTag, selectionATaguer, type CarteDossierDrive, type CleTagCouleur,
  gestesSelection, fichierSelectionnable, messageGesteFichiers, GESTES_SANS_ACTION, type CleGesteSelection,
  actionsApercuFichier, compteCorbeille, confirmationCorbeille, messageCorbeille, versementApercu,
  menuFichier, destinationsDeplacement, vueUtiliseDans, type CleMenuFichier, type UtilisationsBibliotheque,
  menuDossier, optionsTagDossier, boutonTagSurCarte, gesteTelechargement, type CleMenuDossier,
  destinationsDeplacementDossier, validerNomDossier,
  validerNomFichier, baseNomFichier, extensionNomFichier, messageFichierRenomme, destinationsDeplacementSelection, messageDossiersDeplaces,
  lienInterneFichier, lienInterneDossier, rechercheSansLien, MESSAGE_LIEN_COPIE, DETAIL_LIEN_INTERNE, type OuvertureLienInterne,
  ATTRIBUT_ZONE_TACTILE,
} from '@tiktrends/core';
import { uploadImageAssetsAction, presignAssetUploadAction, registerUploadedAssetAction, deleteAssetAction, importAssetAction, toggleAssetAiAction, basculerTemplateAction, tagAssetAction, tagUntaggedImagesAction, basculerAssetsIaAction, mettreAssetsCorbeilleAction, restaurerAssetsAction, renommerAssetAction } from '../../../app/actions/assets';
import { creerDossierAction, supprimerDossierAction, restaurerDossierAction, affecterAssetDossierAction, definirDroitsAssetAction, definirTagDossierAction, definirTagDossiersAction, affecterAssetsDossierAction, definirDroitsAssetsAction, renommerDossierAction, deplacerDossierAction, deplacerDossiersAction } from '../../../app/actions/bibliotheque-dossiers';
import { syncDriveNowAction } from '../../../app/actions/drive';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { LogoApp, ICONE_TYPE } from './logos';
import { useSelecteurDrive } from './selecteur-drive';
import { DialogueSpatial } from '../marque/interactifs';
import { FenetreVersement } from './verser-projet';
import { BoutonTelecharger, useArchive } from './telecharger-selection';
import { MenuFichier } from './menu-fichier';
import { UtiliseDans } from './utilise-dans';
import { useGlisserDeposer } from './glisser-deposer';

/**
 * « Bibliothèque » · `docs/spatial/reference/bibliotheque.html`, balisage à
 * l'identique. Ce que montre l'écran (onglets, arbre, fil d'Ariane, dossiers,
 * fichiers, vide) est décidé par le noyau (`vueDrive`) · ici, l'état de
 * navigation et les gestes, chacun branché sur une action serveur EXISTANTE :
 * créer, mettre à la corbeille, restaurer un dossier (`bibliotheque-dossiers`),
 * ranger un média et fixer ses droits, téléverser (`assets` · bucket ou image
 * compressée), mettre un média à la corbeille et l'en restaurer
 * (`mettreAssetsCorbeilleAction`, `restaurerAssetsAction` · réversible, aucun
 * objet du bucket effacé), le supprimer définitivement une fois dans la
 * corbeille seulement (`deleteAssetAction`, confirmé),
 * connecter et synchroniser Google Drive (`drive`), poser ou retirer le tag de
 * couleur d'un dossier (`definirTagDossierAction`, `library_folders.color_tag`)
 * ou de toute une sélection de dossiers depuis la barre de sélection
 * (`definirTagDossiersAction`, tout ou rien · les fichiers n'en portent pas),
 * et filtrer par tag (puces de l'arbre, adresse `?tag=`) · en grille comme en
 * liste, où chaque dossier tagué porte son étiquette.
 *
 * La SÉLECTION · dossiers ET fichiers, comme la maquette (une case sur chaque
 * carte et chaque ligne). Les gestes de la barre et la phrase de ceux qui ne
 * s'appliquent pas sont décidés au noyau (`gestesSelection`) · corbeille pour
 * tous, tag pour les dossiers ; déplacer, droits d'usage et usage par l'IA pour les
 * fichiers, chacun en UNE action groupée, tout ou rien (`affecterAssetsDossierAction`,
 * `definirDroitsAssetsAction`, `basculerAssetsIaAction`). Les gestes de la
 * barre de la maquette sans action serveur (téléchargement groupé, partage,
 * favori) restent fermés avec leur raison. « Utiliser dans un projet » verse
 * les images sélectionnées dans les références d'un projet Studios
 * (`FenetreVersement`, `verserSelectionDansProjet` · tout ou rien), depuis la
 * barre ou depuis l'aperçu d'un seul fichier (`versementApercu`, noyau), avec
 * création d'un projet dans la fenêtre (`creerProjetEtVerser`). Aucune
 * suppression définitive groupée · un fichier de la corbeille se supprime à
 * l'unité, confirmé, dans l'aperçu (`actionsApercuFichier`, noyau).
 *
 * Le menu « … » d'une carte de fichier (grille) et d'une ligne (liste) porte,
 * à l'unité, les gestes existants · aperçu, « Déplacer vers… », « Utiliser dans
 * un projet », télécharger, corbeille ou restauration · décidés au noyau par la
 * règle de la barre appliquée à ce seul fichier (`menuFichier`). L'aperçu dit
 * dans quels projets Studios le fichier est cité (« Utilisé dans »,
 * `vueUtiliseDans` · lu par la page, lecture seule).
 *
 * Le menu « … » d'une carte de DOSSIER (grille, dans ses actions `facts`) et
 * d'une ligne (liste) · même composant, même clavier · porte à l'unité Ouvrir,
 * Renommer (petite fenêtre · Entrée valide, Échap annule · `renommerDossierAction`),
 * Déplacer vers… (la liste de rangement des fichiers, destinations interdites
 * fermées avec leur raison · `deplacerDossierAction`), Télécharger (l'archive
 * du dossier, `useArchive`), Mettre à la corbeille ou Restaurer, et le tag de
 * couleur là où la carte n'a pas son bouton (la liste) · décidés au noyau
 * (`menuDossier`, `destinationsDeplacementDossier`).
 *
 * Un FICHIER se renomme depuis son aperçu et depuis son menu « … » · la même
 * fenêtre que le dossier (la base du nom présélectionnée, l'extension connue
 * conservée · `validerNomFichier`, puis `renommerAssetAction`). « Déplacer
 * vers… » de la barre déplace aussi une sélection de DOSSIERS, en une action
 * tout ou rien (`deplacerDossiersAction`), chaque destination jugée par la
 * règle de l'action (`destinationsDeplacementSelection`) · une sélection mixte
 * le ferme avec sa raison.
 *
 * « Copier le lien » (menu « … » d'un fichier ou d'un dossier) copie le lien
 * INTERNE de l'écran (`lienInterneFichier`, `lienInterneDossier`) dans le
 * presse-papiers, et le dit. Ouvert par ce lien, l'écran reçoit de la page ce
 * que l'adresse ouvre (`ouverture`, résolu côté serveur dans les données de la
 * session) · l'aperçu du fichier ou le dossier ; quittée la cible, l'adresse
 * perd ses paramètres (`rechercheSansLien`).
 *
 * Glisser-déposer (souris, `useGlisserDeposer`) · un fichier, la sélection de
 * fichiers qu'il emporte ou un dossier, sur un dossier de l'arbre, de la grille
 * ou de la liste · ce qui part et ce qui reçoit est jugé au noyau
 * (`chargeGlissee`, `verdictDepot` · anti-cycle compris), puis la MÊME action
 * que « Déplacer vers… », qui reste la voie clavier.
 *
 * Absents faute de source réelle · Favoris et « Partagés avec le client »
 * (aucune donnée), Dropbox (aucun connecteur · rendu désactivé), le quota
 * (aucun quota n'existe · le volume réellement mesuré est affiché), « Exports
 * Meta » (aucun export conservé). Un projet Studios (dossier virtuel de
 * « Créations ») ne porte pas de tag · ce n'est pas un dossier de la bibliothèque.
 */


export interface PropsBibliotheque {
  donnees: DonneesDrive;
  /** Raison de la lecture seule (offre ou rôle) · null = écriture ouverte. */
  lectureSeule: string | null;
  stockage: boolean;
  drive: ConnexionDriveSpatiale;
  maintenant: string;
  /** Message de retour de la connexion Google (succès ou erreur client). */
  retourDrive?: string | null;
  /** Le filtre par tag lu dans l'adresse (`?tag=`, validé au noyau) · null = aucun. */
  filtreTag?: CleTagCouleur | null;
  /**
   * Les gestes de l'écran V5 `/assets` sans fragment de maquette (vague 2) ·
   * import par lien, asset commun à toutes les marques, usage par l'IA et
   * template, analyse des images (payante, prix annoncé), sélecteur Google
   * Drive. Absents, l'écran est celui de la maquette (garde de parité).
   */
  gestion?: GestionBibliotheque;
  /**
   * « Utilisé dans » · les projets Studios visibles qui citent chaque fichier
   * (`lireUtilisationsBibliotheque`). `null` ou absent · la session ne lit pas
   * les projets, l'aperçu n'en dit rien.
   */
  utilisations?: UtilisationsBibliotheque | null;
  /**
   * Ce que l'adresse ouvre (« Copier le lien » · `?fichier=`, `?dossier=`),
   * résolu par la page dans les données de la session (`ouvertureLienInterne`) ·
   * null ou absent, l'écran s'ouvre comme d'habitude.
   */
  ouverture?: OuvertureLienInterne | null;
}

export interface GestionBibliotheque {
  /** L'analyse d'images par l'IA · `cout` par image (`null` · illimité), `raison` quand elle est fermée. */
  analyse: { cout: number | null; raison: string | null; sansTags: number; maxLot: number };
  /** Le sélecteur Google Drive est configuré sur la plateforme. */
  selecteurDrive: boolean;
  /** Administrateur de l'espace · seul à ranger un fichier en template (coulisses, garde serveur identique). */
  admin: boolean;
  /**
   * Google Drive pas activé (ou son sélecteur) pour l'espace · ce qui manque,
   * qui agit, le repli par lien et le ticket interne (copie client, recette #106).
   */
  messageDrive: { constat: string; suite: string; action: { libelle: string; href: string } | null } | null;
}

const style = (s: Record<string, string | number>) => s as CSSProperties;

/** `tagOuvert` vaut ceci quand c'est le menu de la BARRE DE SÉLECTION qui est ouvert (jamais un id de dossier). */
const MENU_SELECTION = ':selection';
/** Valeurs des listes de la barre de sélection · « Assets de la marque · non classé » et « Non classé » (jamais un id). */
const RACINE_RANGEMENT = ':racine';
const SANS_DROIT = ':aucun';
/**
 * La zone tactile d'une case de sélection (règles · `cibles-tactiles`, mode
 * `zone`) · un enfant vide, sans style ici donc sans effet au bureau ; au
 * téléphone la coquille le porte à la taille de la cible, centré sur la case,
 * sans toucher à son dessin.
 */
const ZONE_TACTILE = <span {...{ [ATTRIBUT_ZONE_TACTILE]: '' }} aria-hidden="true" />;

/** Compresse une image navigateur en data URI léger (sans bucket) · même règle que l'écran V5. */
function fichierEnDataUri(file: File, cote = 1400, qualite = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture impossible.'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const k = Math.min(1, cote / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const ctx = c.getContext('2d'); if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', qualite));
      };
      img.src = lecteur.result as string;
    };
    lecteur.readAsDataURL(file);
  });
}

/**
 * Le `Content-Type` envoyé est celui que le serveur a retenu et SIGNÉ (`decisionDepot`) · un autre type, le bucket refuse.
 * Le `Content-Length` est signé lui aussi, à la taille déclarée (`file.size`) · on envoie le fichier ENTIER, dont le
 * navigateur pose seul la longueur (en-tête interdit au script) ; un autre corps, le bucket refuse.
 */
function envoyerVersBucket(url: string, file: File, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', contentType);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('HTTP ' + x.status)));
    x.onerror = () => reject(new Error('Réseau'));
    x.send(file);
  });
}

function Vignette({ f }: { f: FichierDrive }) {
  if (f.vignette && (f.type === 'image' || f.type === 'video')) {
    return <div className="dth img"><img src={f.vignette} alt="" style={{ objectPosition: '50% 50%' }} /></div>;
  }
  const k = ICONE_TYPE[f.type]!;
  return <div className="dth file" style={style({ '--fc': k.couleur })}><span className="fi"><Ic n={k.icone} s={false} /></span><b>{k.libelle}</b></div>;
}

const IconeFichier = ({ f }: { f: FichierDrive }) => {
  const k = ICONE_TYPE[f.type]!;
  return <span className="dfold" style={style({ '--fc': k.couleur })}><Ic n={k.icone} /></span>;
};

function PastilleFichier({ f }: { f: FichierDrive }) {
  if (f.lectureSeule) return <span className="pill c">{f.projet ? 'Studios' : 'Ancien studio'}</span>;
  const p = pastilleDroit(f.droit);
  return <span className={`pill ${p.classe}`}>{p.libelle}</span>;
}

export function Bibliotheque(p: PropsBibliotheque) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [etat, setEtat] = useState<EtatDrive>(() => ({
    ...ETAT_DRIVE_INITIAL, tag: p.filtreTag ?? null,
    ...(p.ouverture ? { chemin: p.ouverture.chemin, ouverts: new Set([...ETAT_DRIVE_INITIAL.ouverts, ...p.ouverture.chemin]) } : {}),
  }));
  const [tagOuvert, setTagOuvert] = useState<string | null>(null);
  const [affichage, setAffichage] = useState<'grille' | 'liste'>('grille');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [apercu, setApercu] = useState<string | null>(p.ouverture?.fichier ?? null);
  const [menu, setMenu] = useState(false);
  const [glisse, setGlisse] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [commun, setCommun] = useState(false);
  const [dialogueLien, setDialogueLien] = useState(false);
  const [versement, setVersement] = useState(false);
  const [versementFichier, setVersementFichier] = useState<string | null>(null);
  /** Le fichier ou le dossier dont le menu « … » est ouvert · un seul à la fois. */
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);
  /** Le dossier ou le fichier en cours de renommage · la saisie et le refus éventuel (règle du noyau ou du serveur). */
  const [renommage, setRenommage] = useState<{ cible: 'dossier' | 'fichier'; id: string; nom: string; saisie: string; erreur: string | null; depuisApercu?: true } | null>(null);
  const [lien, setLien] = useState<{ texte: string; nom: string; type: TypeImportLien }>({ texte: '', nom: '', type: 'video' });
  const fichierRef = useRef<HTMLInputElement>(null);
  const maintenant = useMemo(() => new Date(p.maintenant), [p.maintenant]);
  const ecriture = p.lectureSeule === null;

  // Ouvert par un lien interne · la cible quittée (aperçu fermé, autre dossier), l'adresse perd ses paramètres.
  const cibleLien = useRef(p.ouverture ?? null);
  useEffect(() => {
    const c = cibleLien.current;
    if (!c || (apercu === c.fichier && etat.chemin.join('/') === c.chemin.join('/'))) return;
    cibleLien.current = null;
    try {
      const u = new URL(window.location.href);
      window.history.replaceState(null, '', `${u.pathname}${rechercheSansLien(u.search)}${u.hash}`);
    } catch { /* adresse inchangée · l'écran a déjà quitté la cible */ }
  }, [apercu, etat.chemin]);

  /** « Copier le lien » · l'adresse complète dans le presse-papiers, et le toast qui le dit (ou le refus du navigateur). */
  async function copierLien(chemin: string, quoi: 'fichier' | 'dossier') {
    try {
      await navigator.clipboard.writeText(new URL(chemin, window.location.origin).toString());
      toast(MESSAGE_LIEN_COPIE[quoi]);
    } catch { toast(MESSAGE_LIEN_COPIE.echec); }
  }

  // Le retour de la connexion Google · dit une fois, à l'arrivée.
  const retourDit = useRef(false);
  useEffect(() => { if (p.retourDrive && !retourDit.current) { retourDit.current = true; toast(p.retourDrive); } }, [p.retourDrive, toast]);

  const v = vueDrive(p.donnees, etat);
  const rangements = useMemo(() => dossiersRangement(p.donnees), [p.donnees]);
  const tagSel = useMemo(() => selectionATaguer(p.donnees, selection), [p.donnees, selection]);
  const sel = useMemo(() => gestesSelection(p.donnees, selection, { section: etat.section, lectureSeule: p.lectureSeule, ia: !!p.gestion }), [p.donnees, selection, etat.section, p.lectureSeule, p.gestion]);
  const gesteSel = (cle: CleGesteSelection) => sel.gestes.find((x) => x.cle === cle);
  const fichierApercu = apercu ? p.donnees.fichiers.find((f) => f.id === apercu) ?? null : null;
  const dossierDe = (id: string) => p.donnees.dossiers.find((d) => d.id === id);
  const corbeille = etat.section === 'corbeille';
  const nTrash = compteCorbeille(p.donnees);
  const rafraichir = () => router.refresh();
  const g = p.gestion;
  const selecteur = useSelecteurDrive(toast, rafraichir);
  const archiver = useArchive();
  const glisser = useGlisserDeposer({
    donnees: p.donnees, section: etat.section, lectureSeule: p.lectureSeule, selection, occupe,
    deposer: (c, destination, nom) => {
      if (c.type === 'dossier') { void deplacerDossier(c, destination, nom); return; }
      void deplacerFichiers(c.ids, destination, nom).then((ok) => { if (ok) setSelection((x) => { const n = new Set(x); c.ids.forEach((id) => n.delete(id)); return n; }); });
    },
  });
  const prixImage = (n: number) => (g?.analyse.cout != null ? ` · ${g.analyse.cout * n} crédit${g.analyse.cout * n > 1 ? 's' : ''}` : '');

  /** L'adresse suit le filtre par tag (`?tag=`) · un lien copié rouvre l'écran filtré, sans recharger la page. */
  const ecrireTagAdresse = (tag: CleTagCouleur | null) => {
    try {
      const u = new URL(window.location.href);
      if (tag) u.searchParams.set('tag', tag); else u.searchParams.delete('tag');
      window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* adresse inchangée · le filtre reste appliqué à l'écran */ }
  };
  const aller = (id: string) => {
    const chemin = cheminVers(p.donnees, id);
    if (etat.tag) ecrireTagAdresse(null);
    setEtat((e) => ({ ...e, section: 'drive', recherche: '', tag: null, chemin, ouverts: new Set([...e.ouverts, ...chemin]) }));
    setSelection(new Set()); setApercu(null);
  };
  const section = (s: SectionDrive) => {
    if (etat.tag) ecrireTagAdresse(null);
    setEtat((e) => ({ ...e, section: s, recherche: '', tag: null, chemin: s === 'drive' ? [] : e.chemin }));
    setSelection(new Set()); setApercu(null);
  };
  /** Une puce de l'arbre · filtre sur ce tag, ou retire le filtre si c'est déjà lui (maquette). */
  const filtrerTag = (tag: CleTagCouleur | null) => {
    const suivant = tag && tag !== etat.tag ? tag : null;
    ecrireTagAdresse(suivant);
    setEtat((e) => ({ ...e, section: 'drive', recherche: '', tag: suivant }));
    setSelection(new Set()); setApercu(null); setTagOuvert(null);
  };

  // Le menu « Tag de couleur » se ferme d'un clic ailleurs ou d'Échap (maquette).
  useEffect(() => {
    if (!tagOuvert) return;
    const clic = (e: PointerEvent) => { const t = e.target as Element | null; if (!t?.closest?.('.ftpop, .ftb, [data-geste="tag-selection"]')) setTagOuvert(null); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setTagOuvert(null); };
    document.addEventListener('pointerdown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('pointerdown', clic); document.removeEventListener('keydown', touche); };
  }, [tagOuvert]);
  const basculerNoeud = (id: string) => setEtat((e) => { const o = new Set(e.ouverts); if (o.has(id)) o.delete(id); else o.add(id); return { ...e, ouverts: o }; });
  const basculerSel = (id: string) => setSelection((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function nouveauDossier() {
    setMenu(false);
    if (!ecriture || occupe) return;
    const nom = window.prompt('Nom du nouveau dossier', 'Nouveau dossier');
    if (nom == null) return;
    const parentId = v.nouveau?.parentId ?? null;
    setOccupe(true);
    const r = await creerDossierAction({ nom, parentId });
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(`Dossier créé dans « ${v.nouveau?.dans ?? v.depot} »`);
    rafraichir();
  }

  async function importer(files: File[]) {
    if (!ecriture || !files.length || occupe) return;
    setOccupe(true);
    let ok = 0; const echecs: string[] = [];
    try {
      if (p.stockage) {
        for (const f of files) {
          const pre = await presignAssetUploadAction({ filename: f.name, contentType: f.type || 'application/octet-stream', sizeBytes: f.size });
          if (pre.error || !pre.uploadUrl || !pre.publicUrl || !pre.contentType) { echecs.push(pre.error ?? f.name); continue; }
          try { await envoyerVersBucket(pre.uploadUrl, f, pre.contentType); } catch { echecs.push(f.name); continue; }
          const reg = await registerUploadedAssetAction({ name: f.name, url: pre.publicUrl, mimeType: f.type, sizeBytes: f.size, common: commun });
          if (reg.error) echecs.push(reg.error); else ok++;
        }
      } else {
        const images = files.filter((f) => f.type.startsWith('image/'));
        if (images.length < files.length) echecs.push('sans stockage, seules les images se téléversent');
        if (images.length) {
          const items = await Promise.all(images.map(async (f) => ({ name: f.name, dataUri: await fichierEnDataUri(f) })));
          const r = await uploadImageAssetsAction({ items, common: commun });
          if (r.error) echecs.push(r.error); else ok = r.count ?? images.length;
        }
      }
    } catch { echecs.push('échec du téléversement'); }
    setOccupe(false);
    toast(ok ? `${ok} fichier${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''} dans « ${v.depot} »${echecs.length ? ` · ${echecs[0]}` : ''}` : (echecs[0] ?? 'Aucun fichier importé'));
    if (ok) { setEtat((e) => ({ ...e, section: 'drive', recherche: '', chemin: ['r:assets'] })); rafraichir(); }
  }

  async function importerLiens() {
    if (!ecriture || occupe) return;
    const lu = lireImportLiens(lien.texte, lien.nom);
    if (!lu.liens.length) { toast(lu.erreur ?? 'Aucun lien à importer'); return; }
    setOccupe(true);
    let ok = 0; let echec: string | null = null;
    for (const l of lu.liens) {
      const r = await importAssetAction({ name: l.nom, url: l.url, kind: lien.type, common: commun }).catch(() => ({ error: 'L’import a échoué.' }));
      if (r.error) echec = echec ?? r.error; else ok++;
    }
    setOccupe(false);
    toast(ok ? `${ok} élément${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}${echec ? ` · ${echec}` : lu.erreur ? ` · ${lu.erreur}` : ''}` : (echec ?? 'Aucun élément importé'));
    if (ok) { setDialogueLien(false); setLien({ texte: '', nom: '', type: lien.type }); setEtat((e) => ({ ...e, section: 'drive', recherche: '', chemin: ['r:assets'] })); rafraichir(); }
  }

  async function analyserLot() {
    setMenu(false);
    if (!g || g.analyse.raison || occupe) return;
    setOccupe(true);
    const r = await tagUntaggedImagesAction().catch(() => ({ error: 'L’analyse a échoué.' } as { tagged?: number; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(`${r.tagged ?? 0} image${(r.tagged ?? 0) > 1 ? 's' : ''} analysée${(r.tagged ?? 0) > 1 ? 's' : ''}`);
    rafraichir();
  }

  async function analyserUne(f: FichierDrive) {
    if (!g || g.analyse.raison || occupe) return;
    setOccupe(true);
    const r = await tagAssetAction({ id: f.id }).catch(() => ({ error: 'L’analyse a échoué.' } as { tags?: string[]; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(r.tags?.length ? `Tags posés · ${r.tags.slice(0, 4).join(', ')}` : 'Aucun tag retenu pour cette image');
    rafraichir();
  }

  async function basculerIa(f: FichierDrive, cle: 'utilisable' | 'template') {
    if (!f.ia || occupe) return;
    setOccupe(true);
    const r = cle === 'utilisable'
      ? await toggleAssetAiAction({ id: f.id, useForAi: !f.ia.utilisable }).catch(() => ({ error: 'L’enregistrement a échoué.' }))
      : await basculerTemplateAction({ id: f.id, on: !f.ia.template }).catch(() => ({ error: 'L’enregistrement a échoué.' }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(cle === 'utilisable' ? (f.ia.utilisable ? 'Ce fichier ne servira plus à l’IA' : 'Ce fichier peut servir à l’IA') : (f.ia.template ? 'Retiré des templates' : 'Rangé dans les templates'));
    rafraichir();
  }

  async function synchroniser() {
    if (occupe) return;
    setOccupe(true); setMenu(false);
    const r = await syncDriveNowAction();
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    // Le résumé commun (N09) · trouvés, importés, déjà là, en erreur · un dossier vide s'explique.
    toast(`Google Drive synchronisé · ${resumeImportDrive({ found: r.found ?? 0, added: r.added ?? 0, skipped: r.skipped ?? 0 })}`);
    rafraichir();
  }

  async function corbeilleOuRestaurer() {
    // Les dossiers ET les fichiers de la sélection (noyau) · les fichiers en UNE action, tout ou rien, d'abord.
    const idsD = sel.dossiers.map((d) => d.id);
    const idsF = sel.fichiers.map((f) => f.id);
    if ((!idsD.length && !idsF.length) || occupe || !gesteSel(corbeille ? 'restaurer' : 'corbeille')?.ouvert) return;
    if (!corbeille && !window.confirm(confirmationCorbeille(idsD.length, idsF.length))) return;
    setOccupe(true);
    let nf = 0;
    if (idsF.length) {
      const r = await (corbeille ? restaurerAssetsAction({ ids: idsF }) : mettreAssetsCorbeilleAction({ ids: idsF })).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; n?: number; error?: string }));
      // Refus des fichiers · rien n'a été écrit, les dossiers ne partent pas non plus · la sélection est gardée.
      if (r.error) { setOccupe(false); toast(r.error); return; }
      nf = r.n ?? idsF.length;
    }
    const res = await Promise.all(idsD.map((id) => (corbeille ? restaurerDossierAction({ id }) : supprimerDossierAction({ id }))));
    setOccupe(false);
    const err = res.find((r) => r.error)?.error;
    const nd = res.filter((r) => r.ok).length;
    setSelection(new Set());
    if (nd || nf) toast(messageCorbeille(corbeille ? 'restaurer' : 'corbeille', nd, nf));
    if (err) toast(err);
    if (apercu && idsF.includes(apercu)) setApercu(null);
    rafraichir();
  }

  /** L'aperçu · un fichier à la corbeille, ou restauré · une seule action, l'aperçu se ferme. */
  async function corbeilleFichier(f: FichierDrive, geste: 'corbeille' | 'restaurer') {
    if (occupe) return;
    setOccupe(true);
    const r = await (geste === 'corbeille' ? mettreAssetsCorbeilleAction({ ids: [f.id] }) : restaurerAssetsAction({ ids: [f.id] })).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; n?: number; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    setApercu((a) => (a === f.id ? null : a));
    setSelection((x) => { const n = new Set(x); n.delete(f.id); return n; });
    toast(messageCorbeille(geste, 0, 1));
    rafraichir();
  }

  /** « Déplacer vers… » du menu « … » d'un fichier, ou un dépôt glissé · l'action groupée de la barre (même borne, même refus). */
  async function deplacerFichiers(ids: string[], folderId: string | null, nom?: string): Promise<boolean> {
    if (!ecriture || occupe || !ids.length) return false;
    setOccupe(true);
    const r = await affecterAssetsDossierAction({ ids, folderId }).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; n?: number; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return false; }
    toast(messageGesteFichiers('ranger', r.n ?? ids.length, { dossier: nom ?? rangements.find((x) => x.id === folderId)?.nom ?? v.depot }));
    rafraichir();
    return true;
  }

  /** Un geste du menu « … » · revérifié au noyau (ouvert) avant l'action existante. */
  function agirMenu(f: FichierDrive, cle: CleMenuFichier, dossier?: string | null) {
    const e = menuFichier(p.donnees, f.id, { section: etat.section, lectureSeule: p.lectureSeule }).find((x) => x.cle === cle);
    if (!e?.ouvert) return;
    if (cle === 'apercu') setApercu(f.id);
    else if (cle === 'renommer') setRenommage({ cible: 'fichier', id: f.id, nom: f.nom, saisie: f.nom, erreur: null });
    else if (cle === 'ranger') void deplacerFichiers([f.id], dossier ?? null);
    else if (cle === 'projet') setVersementFichier(f.id);
    else if (cle === 'copier-lien') { const l = lienInterneFichier(p.donnees, f.id); if (l) void copierLien(l, 'fichier'); }
    else if (cle === 'corbeille' || cle === 'restaurer') void corbeilleFichier(f, cle);
  }

  /** Le menu « … » d'un dossier · à la corbeille (confirmé, comme la barre) ou restauré · une seule action. */
  async function corbeilleDossier(d: CarteDossierDrive, geste: 'corbeille' | 'restaurer') {
    if (occupe) return;
    if (geste === 'corbeille' && !window.confirm(confirmationCorbeille(1, 0))) return;
    setOccupe(true);
    const r = await (geste === 'corbeille' ? supprimerDossierAction({ id: d.id }) : restaurerDossierAction({ id: d.id })).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    setSelection((x) => { const n = new Set(x); n.delete(d.id); return n; });
    toast(messageCorbeille(geste, 1, 0));
    rafraichir();
  }

  /** Un geste du menu « … » d'un dossier · revérifié au noyau (ouvert) avant l'action existante. */
  async function agirMenuDossier(d: CarteDossierDrive, variante: 'grille' | 'liste', cle: CleMenuDossier, option?: string | null) {
    const e = menuDossier(p.donnees, d.id, { section: etat.section, lectureSeule: p.lectureSeule, variante }).find((x) => x.cle === cle);
    if (!e?.ouvert || occupe) return;
    if (cle === 'ouvrir') aller(d.id);
    else if (cle === 'renommer') setRenommage({ cible: 'dossier', id: d.id, nom: d.nom, saisie: d.nom, erreur: null });
    else if (cle === 'deplacer') {
      const o = destinationsDeplacementDossier(p.donnees, d.id).find((x) => x.id === (option ?? null));
      if (o && !o.actuel && !o.raison) await deplacerDossier(d, o.id, o.nom);
    } else if (cle === 'tag') {
      const o = optionsTagDossier(p.donnees, d.id).find((x) => x.id === (option ?? null));
      if (o && !o.actuel) await poserTag(d, o.id as CleTagCouleur | null);
    } else if (cle === 'telecharger') {
      const g = gesteTelechargement(p.donnees, gestesSelection(p.donnees, [d.id], { section: etat.section, lectureSeule: p.lectureSeule, ia: false }), p.lectureSeule);
      if (!g.ouvert) return;
      setOccupe(true);
      try { await archiver(g); } finally { setOccupe(false); }
    } else if (cle === 'copier-lien') {
      const l = lienInterneDossier(p.donnees, d.id);
      if (l) await copierLien(l, 'dossier');
    } else await corbeilleDossier(d, cle);
  }

  /** « Déplacer vers… » d'un dossier (menu ou dépôt glissé) · une seule action (relue et jugée en base, dans sa transaction). */
  async function deplacerDossier(d: Pick<CarteDossierDrive, 'id' | 'nom'>, parentId: string | null, dans: string) {
    if (!ecriture || occupe) return;
    setOccupe(true);
    const r = await deplacerDossierAction({ id: d.id, parentId }).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(`« ${d.nom} » déplacé dans « ${dans} »`);
    rafraichir();
  }

  /** Ferme la fenêtre de renommage · le focus revient d'où elle s'est ouverte (le « … » du dossier ou du fichier, ou le bouton de l'aperçu). */
  const fermerRenommage = () => {
    const x = renommage;
    setRenommage(null);
    if (!x) return;
    const retour = x.depuisApercu ? document.querySelector<HTMLElement>('[data-geste="renommer-fichier"]')
      : [...document.querySelectorAll<HTMLElement>(`[data-menu-${x.cible}]`)].find((b) => b.getAttribute('aria-label') === `Actions sur ${x.nom}`);
    retour?.focus();
  };

  /**
   * « Renommer » · la règle de nom du noyau d'abord (aucun appel pour un nom refusé), puis l'action · son refus reste dans la fenêtre.
   * Un fichier · seule la base de son nom est présélectionnée (l'extension connue est conservée de toute façon).
   */
  async function renommer() {
    if (!renommage || !ecriture || occupe) return;
    const fichier = renommage.cible === 'fichier';
    const v = fichier ? validerNomFichier(renommage.nom, renommage.saisie) : validerNomDossier(renommage.saisie);
    if (!v.ok) { setRenommage({ ...renommage, erreur: v.raison }); return; }
    if (v.nom === renommage.nom) { fermerRenommage(); return; }
    setOccupe(true);
    const appel = fichier ? renommerAssetAction({ id: renommage.id, nom: v.nom }) : renommerDossierAction({ id: renommage.id, nom: v.nom });
    const r = await appel.catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; nom?: string; error?: string }));
    setOccupe(false);
    if (r.error) { setRenommage((x) => (x ? { ...x, erreur: r.error! } : x)); return; }
    fermerRenommage();
    toast(fichier ? messageFichierRenomme(r.nom ?? v.nom) : `Dossier renommé en « ${r.nom ?? v.nom} »`);
    rafraichir();
  }

  /** La barre · « Déplacer vers… » d'une sélection de DOSSIERS · une seule action, tout ou rien (relue et jugée en base, dans sa transaction). */
  async function deplacerSelectionDossiers(valeur: string) {
    const ids = sel.dossiers.map((d) => d.id);
    if (!ecriture || occupe || !ids.length || sel.composition !== 'dossiers' || !gesteSel('ranger')?.ouvert) return;
    const parentId = valeur === RACINE_RANGEMENT ? null : valeur;
    const o = destinationsDeplacementSelection(p.donnees, ids).find((x) => x.id === parentId);
    if (!o || o.actuel || o.raison) return;
    setOccupe(true);
    const r = await deplacerDossiersAction({ ids, parentId }).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; n?: number; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(messageDossiersDeplaces(r.n ?? ids.length, o.nom));
    setSelection(new Set());
    rafraichir();
  }

  async function poserTag(d: CarteDossierDrive, tag: CleTagCouleur | null) {
    setTagOuvert(null);
    if (!ecriture || occupe) return;
    setOccupe(true);
    const r = await definirTagDossierAction({ id: d.id, tag }).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(messageTagPose(tag, d.nom));
    rafraichir();
  }

  /** La barre de sélection · le même tag sur chaque DOSSIER sélectionné, en un geste (tout ou rien côté serveur). */
  async function poserTagSelection(tag: CleTagCouleur | null) {
    setTagOuvert(null);
    if (!ecriture || occupe || tagSel.refus) return;
    setOccupe(true);
    const r = await definirTagDossiersAction({ ids: tagSel.dossiers.map((d) => d.id), tag }).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; n?: number; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(messageTagSelection(tag, r.n ?? tagSel.dossiers.length, tagSel.fichiers));
    setSelection(new Set());
    rafraichir();
  }

  /** Un geste groupé sur les FICHIERS de la sélection · une seule action, tout ou rien côté serveur. */
  async function gesteFichiers(cle: 'ranger' | 'droits' | 'ia', valeur?: string) {
    const ids = sel.fichiers.map((f) => f.id);
    if (!ecriture || occupe || !ids.length || !gesteSel(cle)?.ouvert) return;
    setOccupe(true);
    const echec = { error: 'L’enregistrement a échoué.' } as { ok?: true; n?: number; error?: string };
    let r: { ok?: true; n?: number; error?: string };
    let message: string;
    if (cle === 'ranger') {
      const folderId = valeur === RACINE_RANGEMENT ? null : (valeur ?? null);
      r = await affecterAssetsDossierAction({ ids, folderId }).catch(() => echec);
      message = messageGesteFichiers('ranger', r.n ?? ids.length, { dossier: rangements.find((x) => x.id === folderId)?.nom ?? v.depot });
    } else if (cle === 'droits') {
      const droit = valeur === SANS_DROIT ? null : (valeur as DroitAsset);
      r = await definirDroitsAssetsAction({ ids, droit }).catch(() => echec);
      message = messageGesteFichiers('droits', r.n ?? ids.length);
    } else {
      r = await basculerAssetsIaAction({ ids, useForAi: sel.iaCible }).catch(() => echec);
      message = messageGesteFichiers('ia', r.n ?? ids.length, { useForAi: sel.iaCible });
    }
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(message);
    setSelection(new Set());
    rafraichir();
  }

  async function changerDroit(f: FichierDrive, valeur: string) {
    const r = await definirDroitsAssetAction({ assetId: f.id, droit: valeur ? (valeur as DroitAsset) : null });
    if (r.error) { toast(r.error); return; }
    toast('Droits d’usage enregistrés');
    rafraichir();
  }

  async function ranger(f: FichierDrive, valeur: string) {
    const r = await affecterAssetDossierAction({ assetId: f.id, folderId: valeur || null });
    if (r.error) { toast(r.error); return; }
    toast('Fichier rangé');
    rafraichir();
  }

  async function supprimerFichier(f: FichierDrive) {
    if (!window.confirm(`Supprimer définitivement « ${f.nom} » ? Il quittera la corbeille et ne pourra plus être restauré.`)) return;
    const r = await deleteAssetAction({ id: f.id });
    if (r.error) { toast(r.error); return; }
    setApercu(null);
    setSelection((x) => { const n = new Set(x); n.delete(f.id); return n; });
    toast('Fichier supprimé définitivement');
    rafraichir();
  }

  // La zone d'import (fichiers de l'ordinateur) · un glisser INTERNE (déplacement) ne l'ouvre pas et n'importe rien.
  const surDepot = (e: DragEvent) => { if (!ecriture || glisser.enCours()) return; e.preventDefault(); setGlisse(true); };
  const deposer = (e: DragEvent) => { if (!ecriture || glisser.enCours()) return; e.preventDefault(); setGlisse(false); void importer([...e.dataTransfer.files]); };

  const boutonDrive = p.drive.etat === 'connecte'
    ? <span className="pill g"><Ic n="check" />Google Drive connecté</span>
    : <button type="button" className="btn" disabled={p.drive.etat !== 'a-connecter' || !ecriture} title={p.drive.etat === 'a-connecter' ? undefined : p.drive.resume} onClick={() => { window.location.href = '/api/oauth/google'; }}><LogoApp app="gdrive" taille={28} interieur={16} />Connecter Google Drive</button>;

  const tuileDrive = p.drive.etat === 'connecte' ? (
    <div className="dapp on">
      <LogoApp app="gdrive" taille={30} interieur={18} />
      <div className="dapp-t"><strong>Google Drive</strong><small>{p.drive.resume}</small></div>
      {!p.drive.peutSynchroniser && g?.selecteurDrive
        ? <button className="dapp-ic" type="button" onClick={selecteur.choisirDossier} disabled={!!selecteur.occupe || !ecriture} aria-label="Choisir le dossier Google Drive" title="Choisir le dossier à synchroniser"><Ic n="folder" /></button>
        : <button className="dapp-ic" type="button" onClick={() => void synchroniser()} disabled={!p.drive.peutSynchroniser || occupe || !ecriture} aria-label="Synchroniser Google Drive" title={p.drive.peutSynchroniser ? 'Synchroniser maintenant' : 'Choisis d’abord un dossier Drive'}><Ic n="loop" /></button>}
    </div>
  ) : (
    <button type="button" className="dapp" disabled={p.drive.etat !== 'a-connecter' || !ecriture} title={p.drive.etat === 'a-connecter' ? undefined : p.drive.resume} onClick={() => { window.location.href = '/api/oauth/google'; }}>
      <LogoApp app="gdrive" taille={30} interieur={18} />
      <div className="dapp-t"><strong>Google Drive</strong><small>{p.drive.etat === 'a-connecter' ? 'Connecter' : p.drive.resume}</small></div>
      <span className="dapp-ic"><Ic n="plus" /></span>
    </button>
  );

  /** Le menu « … » d'un fichier · ses entrées ne sont calculées que pour le menu ouvert. */
  const menuDe = (f: FichierDrive, variante: 'grille' | 'liste') => {
    const ouvert = menuOuvert === f.id;
    return (
      <MenuFichier
        nom={f.nom} variante={variante} occupe={occupe} ouvert={ouvert}
        entrees={ouvert ? menuFichier(p.donnees, f.id, { section: etat.section, lectureSeule: p.lectureSeule }) : []}
        destinations={ouvert ? destinationsDeplacement(p.donnees, f.id) : []}
        basculer={(o) => setMenuOuvert((m) => (o ? f.id : m === f.id ? null : m))}
        agir={(cle, dossier) => agirMenu(f, cle, dossier)}
      />
    );
  };

  /** Le menu « … » d'un dossier · ses entrées ne sont calculées que pour le menu ouvert. */
  const menuDossierDe = (d: CarteDossierDrive, variante: 'grille' | 'liste', placer?: (bouton: ReactNode, panneau: ReactNode) => ReactNode) => {
    const ouvert = menuOuvert === d.id;
    return (
      <MenuFichier<CleMenuDossier>
        nom={d.nom} variante={variante === 'grille' ? 'dossier' : 'liste'} cible="dossier" occupe={occupe} ouvert={ouvert} placer={placer}
        entrees={ouvert ? menuDossier(p.donnees, d.id, { section: etat.section, lectureSeule: p.lectureSeule, variante }) : []}
        destinations={[]}
        listes={ouvert ? {
          tag: { options: optionsTagDossier(p.donnees, d.id), libelle: `Tag de couleur de ${d.nom}`, dejaIci: 'Le dossier porte déjà ce tag.' },
          deplacer: { options: destinationsDeplacementDossier(p.donnees, d.id), libelle: `Déplacer ${d.nom} vers`, dejaIci: 'Le dossier est déjà ici.' },
        } : undefined}
        basculer={(o) => setMenuOuvert((m) => (o ? d.id : m === d.id ? null : m))}
        agir={(cle, option) => void agirMenuDossier(d, variante, cle, option)}
      />
    );
  };

  const fsel = (id: string) => { const on = selection.has(id); return <button type="button" className={`fsel ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`Sélectionner ${p.donnees.dossiers.find((d) => d.id === id)?.nom ?? ''}`} onClick={() => basculerSel(id)}>{on && <Ic n="check" />}</button>; };

  /** La case d'un FICHIER (maquette `chk(k)`) · carte de la grille et ligne de la liste. */
  const fchk = (f: FichierDrive) => {
    if (!ecriture || !fichierSelectionnable(f)) return null;
    const on = selection.has(f.id);
    return <button type="button" className={`dchk ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`Sélectionner ${f.nom}`} onClick={() => basculerSel(f.id)}>{on && <Ic n="check" />}{ZONE_TACTILE}</button>;
  };

  const grille = (
    <>
      {(v.dossiers.length > 0 || v.nouveau) && (
        <>
          <div className="dsub">Dossiers</div>
          <div className="fgrid2">
            {v.dossiers.map((d) => {
              const sel = selection.has(d.id);
              const tagueur = boutonTagSurCarte(d, p.lectureSeule);
              // Le menu ouvert passe au-dessus des cartes voisines (comme la carte de fichier).
              const devant = menuOuvert === d.id ? { zIndex: 7 } : null;
              return (
                <div className={`fcard ${sel ? 'sel' : ''}`} key={d.id} style={glisser.style(d.id, d.tag || devant ? { ...(d.tag ? style({ '--tc': d.tag.teinte }) : {}), ...devant } : undefined)} {...glisser.source(d.id)} {...glisser.cible(d.id)}>
                  <button type="button" className="fopen" onClick={() => (corbeille ? d.selectionnable && basculerSel(d.id) : aller(d.id))}>
                    <span className="fic"><Ic n="folder" s={false} /></span>
                    <span className="ftx"><strong>{d.nom}</strong><small>{d.compte} élément{d.compte > 1 ? 's' : ''}{d.sousDossiers ? ` · ${d.sousDossiers} sous-dossier${d.sousDossiers > 1 ? 's' : ''}` : ''}{corbeille ? ' · restaurable' : ''}</small>{d.tag && <span className="ftag"><i />{d.tag.libelle}</span>}</span>
                    <span className="fths">
                      {d.vignettes.map((t, i) => (t.url
                        ? <i key={i} className="fth" style={{ backgroundImage: `url(${JSON.stringify(t.url)})`, backgroundPosition: '50% 50%' }} />
                        : <i key={i} className="fth fi" style={style({ '--fc': ICONE_TYPE[t.type]!.couleur })}><Ic n={ICONE_TYPE[t.type]!.icone} /></i>))}
                    </span>
                  </button>
                  {/* Le menu « … » · dans les actions de la carte, après la case et le tag (le panneau hors des actions, comme le menu du tag). */}
                  {menuDossierDe(d, 'grille', (bouton, panneau) => (
                    <>
                      <div className="facts">
                        {d.selectionnable && ecriture && fsel(d.id)}
                        {tagueur && <button type="button" className={`ftb ${d.tag ? 'has' : ''}`} aria-label="Tag de couleur" aria-expanded={tagOuvert === d.id} disabled={occupe} onClick={() => setTagOuvert((o) => (o === d.id ? null : d.id))}><Ic n="tag" /></button>}
                        {bouton}
                      </div>
                      {panneau}
                    </>
                  ))}
                  {tagueur && tagOuvert === d.id && (
                    <div className="ftpop glass" role="menu" aria-label={`Tag de couleur de ${d.nom}`}>
                      <span className="lbl" style={{ margin: '0 2px 4px' }}>Tag de couleur</span>
                      <div className="ftsw">
                        {TAGS_COULEUR.map((t) => <button type="button" role="menuitemradio" aria-checked={d.tag?.cle === t.cle} key={t.cle} style={style({ '--tc': t.teinte })} disabled={occupe} onClick={() => void poserTag(d, t.cle)}><i />{t.libelle}</button>)}
                      </div>
                      {d.tag && <button type="button" className="ftrm" disabled={occupe} onClick={() => void poserTag(d, null)}><Ic n="x" />Retirer le tag</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {v.nouveau && ecriture && (
              <button type="button" className="fcard fnew" onClick={() => void nouveauDossier()} disabled={occupe}>
                <span className="fic"><Ic n="plus" s={false} /></span>
                <span className="ftx"><strong>Nouveau sous-dossier</strong><small>dans « {v.nouveau.dans} »</small></span>
              </button>
            )}
          </div>
        </>
      )}
      {v.fichiers.length > 0 && (
        <>
          <div className="dsub">Fichiers</div>
          <div className="dfiles">
            {v.fichiers.map((f) => (
              <div className={`dcard ${selection.has(f.id) ? 'sel' : ''} ${apercu === f.id ? 'cur' : ''}`} key={f.id} style={menuOuvert === f.id ? { zIndex: 7 } : undefined} {...glisser.source(f.id)}>
                {fchk(f)}
                <button type="button" className="dopen" onClick={() => setApercu(apercu === f.id ? null : f.id)} aria-label={`Aperçu de ${f.nom}`}><Vignette f={f} /></button>
                <div className="dmeta"><IconeFichier f={f} /><span className="nm" title={f.nom}>{f.nom}</span></div>
                <div className="dsub2"><PastilleFichier f={f} /><span className="faint">{formatTaille(f.tailleOctets)}</span></div>
                {/* Le menu « … » · en coin (`dstar`, position absolue), APRÈS la case et la vignette (ordre de la maquette `chk(k)` puis `dopen`). */}
                {menuDe(f, 'grille')}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  const liste = (
    <div className="dtbl">
      <div className="dtr h"><span /><span>Nom</span><span>Origine</span><span>Ajouté</span><span>Taille</span><span>Droits</span><span /></div>
      {v.dossiers.map((d) => (
        <div className={`dtr ${selection.has(d.id) ? 'sel' : ''}`} key={d.id} style={glisser.style(d.id)} {...glisser.source(d.id)} {...glisser.cible(d.id)}>
          {d.selectionnable && ecriture ? <button type="button" className={`dchk ${selection.has(d.id) ? 'on' : ''}`} aria-pressed={selection.has(d.id)} aria-label={`Sélectionner ${d.nom}`} onClick={() => basculerSel(d.id)}>{selection.has(d.id) && <Ic n="check" />}{ZONE_TACTILE}</button> : <span />}
          <button type="button" className="dname" onClick={() => (corbeille ? undefined : aller(d.id))}><span className="dfold" style={style({ '--fc': '#94a3b8' })}><Ic n="folder" /></span><span className="nm">{d.nom}</span>{d.tag && <span className="ftag" style={style({ '--tc': d.tag.teinte, marginTop: 0, flexShrink: 0 })}><i />{d.tag.libelle}</span>}</button>
          <span className="downer">Bibliothèque</span>
          <span className="faint" />
          <span className="faint num">{d.compte} élém.</span>
          <span />
          {menuDossierDe(d, 'liste')}
        </div>
      ))}
      {v.fichiers.map((f) => (
        <div className={`dtr ${selection.has(f.id) ? 'sel' : ''} ${apercu === f.id ? 'cur' : ''}`} key={f.id} {...glisser.source(f.id)}>
          {fchk(f) ?? <span />}
          <button type="button" className="dname" onClick={() => setApercu(apercu === f.id ? null : f.id)}><IconeFichier f={f} /><span className="nm">{f.nom}</span></button>
          <span className="downer">{f.source}</span>
          <span className="faint">{libelleJour(f.creeLe, maintenant)}</span>
          <span className="faint num">{formatTaille(f.tailleOctets)}</span>
          <span><PastilleFichier f={f} /></span>
          {menuDe(f, 'liste')}
        </div>
      ))}
    </div>
  );

  const fa = fichierApercu;
  const dossierFichier = fa ? dossierDe(fa.parent) : undefined;
  const gestesFa = fa ? actionsApercuFichier(fa, ecriture) : null;
  const versementFa = fa ? versementApercu(p.donnees, fa.id, p.lectureSeule) : null;
  const utiliseFa = fa ? vueUtiliseDans(p.utilisations ?? null, fa) : null;
  // « Copier le lien » de l'aperçu · même règle que le menu « … » (le lien seulement s'il rouvre ce fichier).
  const lienFa = fa ? lienInterneFichier(p.donnees, fa.id) : null;
  const fichiersVersement = versementFichier ? [{ id: versementFichier }] : sel.fichiers;

  return (
    <Vue>
      <EnTete titre="Bibliothèque" sous="Assets de la marque, créations et exports, rangés comme dans un drive" />
      <nav className="btabs" aria-label="Espaces">
        {v.onglets.map((o) => (
          <button type="button" className={o.actif ? 'on' : ''} key={o.id} onClick={() => aller(o.id)}><Ic n={o.icone} /><span>{o.nom}</span><b>{o.compte}</b></button>
        ))}
      </nav>
      <div className="bpre">
        {v.filtreTag && (
          <div className="bbanner tagb" style={style({ '--tc': v.filtreTag.teinte })}>
            <i className="tgdot big" />
            <p><b>Dossiers tagués « {v.filtreTag.libelle} »</b> · dans tout le drive</p>
            <button type="button" className="btn sm" onClick={() => filtrerTag(null)}><Ic n="x" />Retirer le filtre</button>
          </div>
        )}
        {p.lectureSeule && <div className="bbanner"><Ic n="lock" /><p><b>Lecture seule.</b> {p.lectureSeule}</p></div>}
        {g?.messageDrive && (
          <div className="bbanner" data-geste="drive-inactif">
            <LogoApp app="gdrive" taille={28} interieur={16} />
            <p><b>{g.messageDrive.constat}</b> {g.messageDrive.suite}</p>
            {g.messageDrive.action && <Lien className="btn sm" href={g.messageDrive.action.href}>{g.messageDrive.action.libelle}</Lien>}
          </div>
        )}
        {v.banniere && (
          <div className="bbanner">
            <Ic n="shield" />
            <p><b>Les assets de la marque alimentent les Studios.</b> Seuls les fichiers aux droits autorisés servent dans une publicité · « À préciser » les bloque.</p>
            {boutonDrive}
          </div>
        )}
      </div>
      <div className={`drive ${fa ? 'withprev' : ''}`}>
        <aside className="dside tile">
          <div className="dnew">
            <button className="btn pri" type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} disabled={!ecriture}><Ic n="plus" />Nouveau</button>
            {menu && ecriture && (
              <div className="dmenu glass">
                <button type="button" onClick={() => void nouveauDossier()}><Ic n="folder" />Nouveau dossier</button>
                <button type="button" onClick={() => { setMenu(false); fichierRef.current?.click(); }}><Ic n="down" />Importer des fichiers</button>
                {p.drive.etat === 'connecte' && p.drive.peutSynchroniser && <button type="button" onClick={() => void synchroniser()}><LogoApp app="gdrive" taille={18} interieur={12} />Synchroniser Google Drive</button>}
                {p.drive.etat === 'a-connecter' && <button type="button" onClick={() => { window.location.href = '/api/oauth/google'; }}><LogoApp app="gdrive" taille={18} interieur={12} />Connecter Google Drive</button>}
                {g && (
                  <>
                    <button type="button" onClick={() => { setMenu(false); setDialogueLien(true); }}><Ic n="plus" />Importer par lien</button>
                    {p.drive.etat === 'connecte' && g.selecteurDrive && <button type="button" onClick={() => { setMenu(false); selecteur.choisirDossier(); }} disabled={!!selecteur.occupe}><LogoApp app="gdrive" taille={18} interieur={12} />{p.drive.peutSynchroniser ? 'Changer de dossier Drive' : 'Choisir le dossier Drive'}</button>}
                    {p.drive.etat === 'connecte' && g.selecteurDrive && <button type="button" onClick={() => { setMenu(false); selecteur.choisirFichiers(); }} disabled={!!selecteur.occupe}><LogoApp app="gdrive" taille={18} interieur={12} />Importer des fichiers Drive</button>}
                    {g.analyse.sansTags > 0 && <button type="button" onClick={() => void analyserLot()} disabled={!!g.analyse.raison || occupe} title={g.analyse.raison ?? undefined}><Ic n="spark" />Analyser {Math.min(g.analyse.sansTags, g.analyse.maxLot)} image{Math.min(g.analyse.sansTags, g.analyse.maxLot) > 1 ? 's' : ''} sans tags{g.analyse.cout != null ? ` · jusqu’à ${g.analyse.cout * Math.min(g.analyse.sansTags, g.analyse.maxLot)} crédits` : ''}</button>}
                    <button type="button" aria-pressed={commun} onClick={() => setCommun((c) => !c)}><Ic n={commun ? 'check' : 'users'} />{commun ? 'Import commun à toutes les marques · activé' : 'Importer comme commun à toutes les marques'}</button>
                  </>
                )}
              </div>
            )}
          </div>
          <nav className="dsec" aria-label="Sections">
            {SECTIONS_DRIVE.map((s) => (
              <button type="button" key={s.cle} className={etat.section === s.cle && !etat.recherche.trim() ? 'on' : ''} onClick={() => section(s.cle)}>
                <Ic n={s.icone} /><span>{s.nom}</span>{s.cle === 'corbeille' && nTrash > 0 && <span className="faint">{nTrash}</span>}
              </button>
            ))}
          </nav>
          <div className="dconn">
            <span className="g">Importer tes assets</span>
            {tuileDrive}
            <button type="button" className="dapp" disabled title="Dropbox · bientôt, aucun connecteur n’existe encore">
              <LogoApp app="dropbox" taille={30} interieur={18} />
              <div className="dapp-t"><strong>Dropbox</strong><small>Bientôt</small></div>
              <span className="dapp-ic"><Ic n="plus" /></span>
            </button>
            <Lien className="dmore" href="/connections">Toutes les connexions <Ic n="arrow" /></Lien>
          </div>
          <div className="dtree">
            {v.arbre.map((n) => (
              <Fragment key={n.id}>
                {n.separateurAvant && <span className="tnsep" />}
                <div className={`tnr lv${Math.min(n.niveau, 2)} ${n.actif ? 'on' : ''}`} style={style({ '--lv': n.niveau })}>
                  {n.aEnfants
                    ? <button type="button" className={`tnc ${n.ouvert ? 'op' : ''}`} aria-label={`${n.ouvert ? 'Replier' : 'Déplier'} ${n.nom}`} aria-expanded={n.ouvert} onClick={() => basculerNoeud(n.id)}><i className="tchev" /></button>
                    : <span className="tnc" />}
                  <button type="button" className="tnb" onClick={() => aller(n.id)} style={glisser.style(n.id)} {...glisser.cible(n.id)}>
                    {n.racine ? <span className="tni"><Ic n={n.icone} /></span> : <span className="tno"><Ic n="folder" /></span>}
                    <span className="tnn">{n.nom}</span>{n.tag && <i className="tgdot" style={{ background: n.tag.teinte }} title={n.tag.libelle} />}<span className="tnk">{n.compte}</span>
                  </button>
                </div>
              </Fragment>
            ))}
            <div className="tgf">
              <span className="g">Tags</span>
              <div className="tgl">
                {v.tags.length
                  ? v.tags.map((t) => <button type="button" className={`tgchip ${t.actif ? 'on' : ''}`} key={t.cle} style={style({ '--tc': t.teinte })} aria-pressed={t.actif} onClick={() => filtrerTag(t.cle)}><i />{t.libelle}<span>{t.compte}</span></button>)
                  : <small className="faint">Ajoute un tag depuis un dossier.</small>}
              </div>
            </div>
          </div>
          <div className="dquota"><small className="faint">{v.volume}</small></div>
        </aside>
        <section className="dmain" id="dmain" onDragOver={surDepot} onDrop={deposer}>
          <div className="dbar">
            <nav className="crumb" aria-label="Emplacement">
              {v.fil.map((c, i) => (i < v.fil.length - 1
                ? <Fragment key={i}><button type="button" onClick={() => setEtat((e) => ({ ...e, chemin: e.chemin.slice(0, c.index ?? 0) }))}>{c.libelle}</button><span className="faint">›</span></Fragment>
                : <strong key={i}>{c.libelle}</strong>))}
            </nav>
            <label className="dsearch"><Ic n="search" /><input id="libq" value={etat.recherche} onChange={(e) => { const q = e.target.value; setEtat((x) => ({ ...x, recherche: q })); }} placeholder="Rechercher dans le drive" autoComplete="off" /></label>
            <div className="seg" role="group" aria-label="Affichage">
              <button type="button" aria-pressed={affichage === 'grille'} aria-label="Grille" onClick={() => setAffichage('grille')}><Ic n="grid" /></button>
              <button type="button" aria-pressed={affichage === 'liste'} aria-label="Liste" onClick={() => setAffichage('liste')}><Ic n="text" /></button>
            </div>
            <select className="dsort" id="dsort" aria-label="Trier" value={etat.tri} onChange={(e) => { const tri = e.target.value as TriDrive; setEtat((x) => ({ ...x, tri })); }}>
              <option value="nom">Trier : Nom</option><option value="date">Trier : Ajouté</option><option value="taille">Trier : Taille</option>
            </select>
            {g && (
              <select className="dsort" aria-label="Type de fichier" value={etat.type ?? 'tous'} onChange={(e) => { const type = e.target.value as FiltreTypeDrive; setEtat((x) => ({ ...x, type })); }}>
                {FILTRES_TYPE_DRIVE.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
              </select>
            )}
          </div>
          {selection.size > 0 && (
            <div className="dbulk">
              <strong>{selection.size} sélectionné{selection.size > 1 ? 's' : ''}</strong>
              {(() => { const x = gesteSel(corbeille ? 'restaurer' : 'corbeille')!; return <button className="btn sm" type="button" data-geste={x.cle} onClick={() => void corbeilleOuRestaurer()} disabled={occupe || !x.ouvert} title={x.raison ?? undefined}><Ic n={corbeille ? 'check' : 'x'} />{x.libelle}</button>; })()}
              {!corbeille && ecriture && (
                <span data-geste="tag-selection" style={{ position: 'relative' }}>
                  <button className="btn sm" type="button" aria-expanded={tagOuvert === MENU_SELECTION} disabled={occupe || !gesteSel('tag')?.ouvert} title={gesteSel('tag')?.raison ?? undefined} onClick={() => setTagOuvert((o) => (o === MENU_SELECTION ? null : MENU_SELECTION))}><Ic n="tag" />Tag de couleur</button>
                  {tagOuvert === MENU_SELECTION && gesteSel('tag')?.ouvert && (
                    <div className="ftpop glass" role="menu" aria-label="Tag de couleur de la sélection" style={{ left: 0, right: 'auto' }}>
                      <span className="lbl" style={{ margin: '0 2px 4px' }}>Tag de couleur · {tagSel.dossiers.length} dossier{tagSel.dossiers.length > 1 ? 's' : ''}</span>
                      <div className="ftsw">
                        {TAGS_COULEUR.map((t) => <button type="button" role="menuitemradio" aria-checked={tagSel.commun === t.cle} key={t.cle} style={style({ '--tc': t.teinte })} disabled={occupe} onClick={() => void poserTagSelection(t.cle)}><i />{t.libelle}</button>)}
                      </div>
                      {tagSel.retirable && <button type="button" className="ftrm" disabled={occupe} onClick={() => void poserTagSelection(null)}><Ic n="x" />Retirer le tag</button>}
                      <small className="faint" style={{ margin: '2px 2px 0' }}>{noteSelectionTag(tagSel.fichiers)}</small>
                    </div>
                  )}
                </span>
              )}
              {!corbeille && ecriture && (() => {
                const ranger = gesteSel('ranger')!, droits = gesteSel('droits')!, ia = gesteSel('ia'), projet = gesteSel('projet')!;
                return (
                  <>
                    {sel.composition === 'dossiers' ? (
                      <select className="dsort" data-geste="ranger" aria-label="Déplacer les dossiers sélectionnés vers un dossier" value="" disabled={occupe || !ranger.ouvert} title={ranger.raison ?? undefined} onChange={(e) => void deplacerSelectionDossiers(e.target.value)}>
                        <option value="" disabled>{ranger.libelle}</option>
                        {destinationsDeplacementSelection(p.donnees, sel.dossiers.map((d) => d.id)).map((r) => <option key={r.id ?? 'racine'} value={r.id ?? RACINE_RANGEMENT} disabled={r.actuel || !!r.raison} title={r.actuel ? 'Les dossiers sont déjà ici.' : (r.raison ?? undefined)}>{r.nom}</option>)}
                      </select>
                    ) : (
                      <select className="dsort" data-geste="ranger" aria-label="Déplacer les fichiers sélectionnés vers un dossier" value="" disabled={occupe || !ranger.ouvert} title={ranger.raison ?? undefined} onChange={(e) => void gesteFichiers('ranger', e.target.value)}>
                        <option value="" disabled>{ranger.libelle}</option>
                        {rangements.map((r) => <option key={r.id ?? 'racine'} value={r.id ?? RACINE_RANGEMENT}>{r.nom}</option>)}
                      </select>
                    )}
                    <select className="dsort" data-geste="droits" aria-label="Droits d’usage des fichiers sélectionnés" value="" disabled={occupe || !droits.ouvert} title={droits.raison ?? undefined} onChange={(e) => void gesteFichiers('droits', e.target.value)}>
                      <option value="" disabled>{sel.inviteDroits}</option>
                      <option value={SANS_DROIT}>Non classé</option>
                      {DROITS_ASSET.map((d) => <option key={d.cle} value={d.cle}>{d.libelle}</option>)}
                    </select>
                    {ia && <button className="btn sm" type="button" data-geste="ia" disabled={occupe || !ia.ouvert} title={ia.raison ?? undefined} onClick={() => void gesteFichiers('ia')}><Ic n="spark" />{ia.libelle}</button>}
                    <button className="btn sm" type="button" data-geste="projet" disabled={occupe || !projet.ouvert} title={projet.raison ?? undefined} onClick={() => setVersement(true)}><Ic n="brush" />{projet.libelle}</button>
                    <BoutonTelecharger donnees={p.donnees} sel={sel} lectureSeule={p.lectureSeule} occupe={occupe} />
                    {GESTES_SANS_ACTION.map((x) => <button className="btn sm" type="button" key={x.cle} data-ferme={x.cle} disabled title={x.raison}><Ic n={x.icone} />{x.libelle}</button>)}
                  </>
                );
              })()}
              {sel.note && <small className="faint" data-geste="note-selection">{sel.note}</small>}
              <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setSelection(new Set())}>Désélectionner</button>
            </div>
          )}
          {v.vide && <div className="dempty"><span className="ico"><Ic n={v.vide.icone} s={false} /></span><h3>{v.vide.titre}</h3><p className="muted">{v.vide.texte}</p></div>}
          {affichage === 'grille' ? grille : liste}
          <input type="file" id="dfile" ref={fichierRef} multiple accept={p.stockage ? 'image/*,video/*,audio/*,application/pdf' : 'image/*'} hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void importer(l); }} />
          <div className="ddrop" id="ddrop" hidden={!glisse} onDragLeave={() => setGlisse(false)}><Ic n="down" s={false} /><strong>Dépose pour importer dans « {v.depot} »</strong></div>
        </section>
        {fa && (
          <aside className="tile dprev" aria-label="Aperçu">
            <div className="sech" style={{ margin: 0 }}><strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fa.nom}</strong><button className="btn icon sm" style={{ width: 34, marginLeft: 'auto' }} type="button" onClick={() => setApercu(null)} aria-label="Fermer l’aperçu"><Ic n="x" /></button></div>
            <div className="dbig"><Vignette f={fa} /></div>
            <div className="kc"><PastilleFichier f={fa} />{fa.ia?.template && <span className="pill c" data-badge="template">Template</span>}</div>
            {gestesFa?.note && <div className="banner" style={{ margin: 0 }} data-geste="note-corbeille"><Ic n="x" /><span>{gestesFa.note}</span></div>}
            {fa.droit === 'a_preciser' && !fa.supprime && <div className="banner" style={{ margin: 0 }}><Ic n="warn" /><span>Droits à préciser : ce fichier ne peut pas encore servir dans une publicité.</span></div>}
            <dl className="kv2" style={{ gridTemplateColumns: '110px minmax(0,1fr)', margin: 0 }}>
              <dt>Type</dt><dd>{LIBELLE_TYPE_FICHIER[fa.type]}</dd>
              <dt>Taille</dt><dd>{formatTaille(fa.tailleOctets)}</dd>
              <dt>Ajouté</dt><dd>{libelleJour(fa.creeLe, maintenant)}</dd>
              <dt>Source</dt><dd>{fa.source}</dd>
              <dt>Dossier</dt><dd>{dossierFichier?.nom ?? v.depot}</dd>
            </dl>
            {utiliseFa && <UtiliseDans vue={utiliseFa} />}
            <div style={{ display: 'grid', gap: 8 }}>
              {gestesFa?.edition && (
                <>
                  <span className="lbl" style={{ margin: 0 }}>Droits d’usage</span>
                  <select className="dsort" aria-label="Droits d’usage" value={fa.droit ?? ''} onChange={(e) => void changerDroit(fa, e.target.value)}>
                    <option value="">Non classé</option>
                    {DROITS_ASSET.map((d) => <option key={d.cle} value={d.cle}>{d.libelle}</option>)}
                  </select>
                  <span className="lbl" style={{ margin: 0 }}>Ranger dans</span>
                  <select className="dsort" aria-label="Ranger dans un dossier" value={dossierFichier?.reel ? fa.parent : ''} onChange={(e) => void ranger(fa, e.target.value)}>
                    {rangements.map((r) => <option key={r.id ?? 'racine'} value={r.id ?? ''}>{r.nom}</option>)}
                  </select>
                </>
              )}
              {fa.ia && gestesFa?.edition && g && (
                <div data-geste="ia-fichier" style={{ display: 'grid', gap: 8 }}>
                  <span className="lbl" style={{ margin: 0 }}>Usage par l’IA</span>
                  <label className="npr" style={{ cursor: 'pointer' }}><input type="checkbox" checked={fa.ia.utilisable} disabled={occupe} onChange={() => void basculerIa(fa, 'utilisable')} /><div><strong>Utilisable par l’IA</strong><small>Les Studios peuvent s’en servir pour composer</small></div></label>
                  {g.admin && <label className="npr" style={{ cursor: 'pointer' }}><input type="checkbox" checked={fa.ia.template} disabled={occupe} onChange={() => void basculerIa(fa, 'template')} /><div><strong>Template</strong><small>Visible du client comme modèle</small></div></label>}
                  {fa.ia.tags.length > 0 && <div className="chips" style={{ marginTop: 0 }}>{fa.ia.tags.map((t) => <span className="pill" key={t}>{t}</span>)}</div>}
                  {fa.type === 'image' && (
                    <button className="btn" type="button" onClick={() => void analyserUne(fa)} disabled={!!g.analyse.raison || occupe} title={g.analyse.raison ?? undefined}><Ic n="spark" />{fa.ia.tags.length ? 'Analyser à nouveau' : 'Analyser l’image'}{prixImage(1)}</button>
                  )}
                </div>
              )}
              {gestesFa?.edition && <button className="btn" type="button" data-geste="renommer-fichier" aria-disabled={occupe || undefined} onClick={() => { if (!occupe) setRenommage({ cible: 'fichier', id: fa.id, nom: fa.nom, saisie: fa.nom, erreur: null, depuisApercu: true }); }}><Ic n="text" />Renommer</button>}
              {versementFa && <button className="btn" type="button" data-geste="projet-fichier" disabled={occupe || !versementFa.ouvert} title={versementFa.raison ?? undefined} onClick={() => setVersementFichier(fa.id)}><Ic n="brush" />{versementFa.libelle}</button>}
              {fa.projet && <Lien className="btn pri" href={fa.projet.href}><Ic n="brush" />Ouvrir le projet</Lien>}
              <a className="btn" href={fa.telecharger ?? fa.url} target="_blank" rel="noopener noreferrer" download><Ic n="down" />Télécharger</a>
              {lienFa && <button className="btn" type="button" data-geste="copier-lien-fichier" title={DETAIL_LIEN_INTERNE} onClick={() => void copierLien(lienFa, 'fichier')}><Ic n="copy" />Copier le lien</button>}
              {gestesFa?.corbeille && <button className="btn" type="button" data-geste="corbeille-fichier" disabled={occupe} onClick={() => void corbeilleFichier(fa, 'corbeille')}><Ic n="x" />Mettre à la corbeille</button>}
              {gestesFa?.restaurer && <button className="btn pri" type="button" data-geste="restaurer-fichier" disabled={occupe} onClick={() => void corbeilleFichier(fa, 'restaurer')}><Ic n="check" />Restaurer</button>}
              {gestesFa?.supprimerDefinitivement && <button className="btn" type="button" data-geste="supprimer-definitivement" disabled={occupe} onClick={() => void supprimerFichier(fa)}><Ic n="x" />Supprimer définitivement</button>}
            </div>
          </aside>
        )}
      </div>
      {ecriture && (
        <DialogueSpatial titre={renommage?.cible === 'fichier' ? 'Renommer le fichier' : 'Renommer le dossier'} ouvert={renommage !== null} fermer={fermerRenommage}>
          {renommage && (
            <form style={{ display: 'grid', gap: 10 }} {...{ [`data-renommer-${renommage.cible}`]: renommage.id }} onSubmit={(e) => { e.preventDefault(); void renommer(); }}>
              <input value={renommage.saisie} autoFocus aria-label={`Nouveau nom de ${renommage.nom}`} aria-invalid={renommage.erreur ? true : undefined}
                onFocus={(e) => { if (renommage.cible === 'fichier') e.currentTarget.setSelectionRange(0, baseNomFichier(e.currentTarget.value).length); else e.currentTarget.select(); }}
                onChange={(e) => { const saisie = e.target.value; setRenommage((x) => (x ? { ...x, saisie, erreur: null } : x)); }}
                style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)' }} />
              {renommage.cible === 'fichier' && extensionNomFichier(renommage.nom) && <small className="faint" data-extension-conservee="">L’extension {extensionNomFichier(renommage.nom)} est conservée · le type du fichier ne change pas.</small>}
              {renommage.erreur && <p role="alert" style={{ fontSize: '12.5px', margin: 0, color: 'var(--bad)' }}>{renommage.erreur}</p>}
              <div className="pbtns"><button className="btn" type="button" onClick={fermerRenommage}>Annuler</button><button className="btn pri" type="submit" disabled={occupe}>Renommer</button></div>
            </form>
          )}
        </DialogueSpatial>
      )}
      {ecriture && <FenetreVersement ouvert={versement || versementFichier !== null} fermer={() => { setVersement(false); setVersementFichier(null); }} donnees={p.donnees} fichiers={fichiersVersement} />}
      {g && (
        <DialogueSpatial titre="Importer par lien" ouvert={dialogueLien} fermer={() => setDialogueLien(false)}>
          <form style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void importerLiens(); }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Une adresse par ligne · rushs, vidéos ou liens de partage Google Drive (« Tous les utilisateurs disposant du lien »). Ils arrivent dans « {v.depot} »{commun ? ', communs à toutes les marques' : ''}.</p>
            <textarea value={lien.texte} onChange={(e) => setLien((x) => ({ ...x, texte: e.target.value }))} rows={4} required aria-label="Adresses à importer" placeholder="https://…" style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', resize: 'vertical' }} />
            <input value={lien.nom} onChange={(e) => setLien((x) => ({ ...x, nom: e.target.value }))} aria-label="Nom (une seule adresse)" placeholder="Nom (facultatif, pour une seule adresse)" style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)' }} />
            <select className="dsort" aria-label="Type de fichier" value={lien.type} onChange={(e) => setLien((x) => ({ ...x, type: e.target.value as TypeImportLien }))}>
              {TYPES_IMPORT_LIEN.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
            <div className="pbtns"><button className="btn" type="button" onClick={() => setDialogueLien(false)}>Annuler</button><button className="btn pri" type="submit" disabled={occupe || !lien.texte.trim()}>Importer</button></div>
          </form>
        </DialogueSpatial>
      )}
    </Vue>
  );
}
