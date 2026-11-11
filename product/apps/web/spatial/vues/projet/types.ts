import type { DroitsCommentaire, GesteIterationCommentaire, MembreMentionnable, ResultatCommentaire, SegmentCommentaire, JournalProjet, IterationProjetJarvis, PreparationTesterJarvis, VarianteEssaiJarvis, ClassePastille, CouloirSpatial, DispositionCanvas, EtatGeneration, ModeDispositionProjet, ModeleCanvas, ProtocoleTest, GrapheLibre, GroupeLignee, ModeleLignee } from '@tiktrends/core';
import type { ListePropositions, ReponseProposition } from '../../../lib/studios/propositions/types';

/**
 * Les props des écrans de la rubrique « projet » · données SÉRIALISABLES lues
 * par les pages serveur (`app/(spatial)/sp/studio/projets/[id]/…`). Types
 * seuls · aucun code ici (importable des deux côtés).
 */

export type OngletProjet = 'brief' | 'canvas' | 'crea' | 'activite';

export interface ActionConceptSpatiale {
  cle: string;
  libelle: string;
  etat: 'actif' | 'desactive';
  raison: string | null;
  /** Ce que le clic fait vraiment · dit avant la confirmation. */
  effet: string;
  genre: 'proposition' | 'preparation';
  /** Chemin du brief visé et nombre de propositions demandées (actions « proposition »). */
  cible: { chemin: string; nombre: number } | null;
}

export interface PropsJarvisProjet {
  projectId: string;
  marque: string;
  /** Sous le nom « Jarvis » · `Dans ce projet · Neva 72 %`. */
  sousTitre: string;
  /** Dernière réponse de Jarvis dans le fil du projet, ou l'invitation à commencer. */
  message: string;
  fil: { conversationId: string | null; tours: Array<{ id: string; role: 'user' | 'assistant'; texte: string }> } | null;
  erreurFil: string | null;
  /** La première proposition ouverte · relue et tranchée dans l'onglet Brief. */
  suggestion: { id: string; libelle: string; texte: string; apercu: { src: string; bandeau: string } | null } | null;
  actions: ActionConceptSpatiale[];
  /** Coût maximal d'une demande de proposition (Jarvis), annoncé avant le clic. */
  mentionCout: string | null;
  /** Ce que coûte un message dans le fil (aucun crédit, coût IA sous le plafond). */
  mentionConversation: string;
  versionCourante: { id: string; n: number } | null;
  preparerHref: string | null;
  /** La conversation est fermée (accès Jarvis absent) · les puces restent visibles, inactives. */
  conversationOuverte: boolean;
  /**
   * Lot 5 ter (PC E35, E38) · les variantes GAGNANTES du projet (verdict arbitré,
   * comparable) et les noms des autres, listes FERMÉES lues dans la portée · « Créer l'itération » n'apparaît
   * sous une réponse que si elle en désigne une sûrement (`gesteIterationProjet`).
   * Absent ou vide · aucun geste.
   */
  iteration?: IterationProjetJarvis | null;
  /**
   * Lot 5 quater (RJ G07) · les variantes du projet, liste FERMÉE lue dans la
   * portée · « Tester » et « Corriger le texte » n'apparaissent sous une
   * réponse que si elle en désigne une sûrement (`gestesEssaiTexteJarvis`).
   * Absent ou vide · aucun de ces gestes.
   */
  essai?: VarianteEssaiJarvis[] | null;
}

export interface ChampBrief { libelle: string; valeurs: string[]; options: boolean }

export interface PropsBriefProjet {
  projectId: string;
  versionId: string;
  versionN: number;
  ancienne: boolean;
  titreBrief: string;
  etatBrief: 'ok' | 'vide' | 'illisible';
  champs: ChampBrief[];
  references: Array<{
    id: string; titre: string; detail: string; apercu: string | null; href: string | null; libelleLien: string;
    /** Provenance de la fiche V5 · statut, droit, empreinte, ressources, absences, extrait (`provenanceSource`). */
    provenance?: { statut: string; etat: string; lignes: string[] };
  }>;
  /** Références illisibles ignorées · dites (`phraseSourcesIllisibles`). */
  sourcesIllisibles?: string | null;
  produit: { nom: string; faits: string[]; manques: string[]; instantane: string; photo: string | null; href: string | null } | null;
  veilleHref: string | null;
  fiche: { score: number; texte: string; href: string | null } | null;
  manques: Array<{ cle: string; libelle: string; bloquant: boolean }>;
  versions: Array<{ id: string; n: number; date: string; raison: string | null; courante: boolean; vue: boolean; href: string }>;
  atelier: Array<{ segment: string; libelle: string; href: string | null; mention: string | null }>;
  exportBrief: { autorise: boolean; possible: boolean };
  propositions: { initial: ReponseProposition<ListePropositions> | null; versionCourante: { id: string; n: number } | null };
}

export interface SortieSpatiale {
  assetId: string; libelle: string; apercu: string | null; detail: string; choisir: boolean; raison: string | null; varianteId: string | null;
  /** Le format RÉEL du fichier livré (`formatCreation` · « 4:5 », « 3:4 »…) · filtre local de la grille. Absent · inconnu. */
  format?: string | null;
}

export interface LotSpatial {
  jobId: string;
  titre: string;
  version: string;
  etat: EtatGeneration;
  qualite: string | null;
  message: string | null;
  sorties: SortieSpatiale[];
  /** Branche antérieure · ses résultats restent rangés ici (`vueVariantes`) · `null` pour la version courante. */
  note?: string | null;
}

export interface VarianteSpatiale {
  id: string;
  libelle: string;
  apercu: string | null;
  version: string;
  statut: string;
  hypothese: string;
  variable: string;
  comparaison: string;
  test: { href: string; resume: string; verdict: string; details?: Array<{ libelle: string; valeur: string }>; isolation?: string | null } | null;
  /** « Rangée dans Version 1 · la version courante n'est pas modifiée. » · `null` sur la version courante. */
  noteRangement?: string | null;
  /** Lien du test rattaché (`studio_test_links`) · la relecture de l'apprentissage le vise. */
  lienTest: string | null;
  lecture: { conclusion: string; phrase: string; prudence?: string; variableSuivante?: string } | null;
  gestes: { iterer: boolean; relire: boolean; rattacher: boolean };
  /** Ce que le formulaire « Rattacher au test » reprend de la variante (hypothèse, variable, parente). */
  rattachement: { hypothese: string | null; variable: string | null; aUnParent: boolean };
}

/** Ce qu'Adsmap offre au rattachement d'une variante · relu sous le droit Adsmap (offre, rôle). */
export interface AdsmapRattachement {
  acces: boolean;
  protocoleMarque: ProtocoleTest | null;
  offres: Array<{ id: string; libelle: string }>;
  pages: Array<{ id: string; libelle: string }>;
}

export interface TacheSpatiale {
  id: string; titre: string; classe: ClassePastille; detail: string; explication: string; interrompue: boolean;
  /** Avancement MESURÉ (0 à 100) · `null` ou absent, aucun pourcentage n'est montré. */
  progression?: number | null;
}

export interface PropsCreationsProjet {
  projectId: string;
  versionCouranteId: string | null;
  lots: LotSpatial[];
  messageVide: string;
  editeurHref: string | null;
  preparerHref: string | null;
  videoHref: string | null;
  variantes: VarianteSpatiale[];
  erreurVariantes: string | null;
  relecture: { disponible: boolean; mention: string | null; raison: string | null; coutMaxUsd: number | null };
  taches: TacheSpatiale[] | null;
  erreurTaches: string | null;
  /** Le rôle peut-il proposer (rattacher, préparer un lot d'essai) ? */
  peutProposer: boolean;
  /** Adsmap pour le rattachement · `null` quand les variantes n'ont pas pu être lues. */
  adsmap: AdsmapRattachement | null;
  /** Un travail est en cours · la page se relit d'elle-même. */
  relire: boolean;
  /**
   * Lot 5 quater · « Tester » depuis une réponse de Jarvis · relue au serveur ·
   * le formulaire de rattachement de la variante ouvert (ou le lot d'essai, elle
   * présélectionnée), la note dit ce qui est pré-rempli · rien n'est envoyé
   * sans le clic. Absent · l'écran d'avant.
   */
  jarvis?: PreparationTesterJarvis | null;
  /** Lot 10 · « Voir le journal » des tâches · l'onglet Activité existe (`#activite`). */
  journal?: boolean;
}

export interface PropsProjet {
  projet: { id: string; titre: string; sousTitre: string; kind: string };
  pastille: { classe: ClassePastille; libelle: string; icone: 'check' | 'lock' };
  exporterHref: string | null;
  generer: { href: string | null; libelle: string; raison: string | null };
  couloirs: CouloirSpatial[];
  /** Ce que dit le couloir « Itération » vide quand il a une raison (aucune gagnante arbitrée, Résultats fermé) · `noeudsIterationProjet`. */
  iterationVide?: string | null;
  aideCanvas: string;
  jarvis: PropsJarvisProjet;
  brief: PropsBriefProjet;
  creations: PropsCreationsProjet;
  ongletInitial?: OngletProjet;
  /**
   * La disposition LIBRE du canvas (canvas métier de la V5, même stockage) ·
   * `ok: false` quand la lecture est refusée (le contrôle reste visible,
   * inactif, avec sa raison). Absent · le contrôle n'est pas offert.
   */
  libre?: { ok: true; canvas: CanevasLibre } | { ok: false; raison: string };
  /** Projet né d'une carte de Veille · « Revenir à la recherche de Veille » (critères relus par `lienRetourVeille`). */
  retourVeille?: { href: string; terme: string | null } | null;
  /** Le mode lu dans l'adresse (`?disposition=libre`) · les couloirs par défaut. */
  dispositionInitiale?: ModeDispositionProjet;
  /**
   * « Demander à Jarvis » (lot 5 V5) · Jarvis en plein écran, CE projet joint
   * (son fil lié, son bloc concept), la question préparée, rien d'envoyé.
   * Absent (pas d'accès à la conversation), l'en-tête reste celui de la maquette.
   */
  demanderJarvis?: { href: string } | null;
  /**
   * Lot 10 · l'onglet « Activité » (journal et commentaires du projet) ·
   * absent, l'onglet n'est pas offert (la fiche reste celle de la maquette).
   */
  activite?: PropsActiviteProjet | null;
}

/** Le canvas métier d'une version et la disposition PERSONNELLE de la session (`lireCanvasProjet`). */
export interface CanevasLibre {
  projectId: string;
  version: { id: string; n: number; courante: boolean };
  modele: ModeleCanvas;
  apercus: Record<string, string>;
  disposition: DispositionCanvas;
  rev: number;
  /**
   * Lot 11 V5 · la LIGNÉE du projet, second graphe du canvas libre (`?graphe=lignee`) ·
   * mêmes positions personnelles (identifiants disjoints, `estIdLignee`). Absente
   * (lignée illisible ou réduite à la marque) · le choix « Lignée » est fermé et dit pourquoi.
   */
  lignee?: LigneeLibre | null;
  /** Le graphe lu dans l'adresse · la production par défaut. */
  grapheInitial?: GrapheLibre;
}

/** La lignée prête pour le canvas libre · projection du noyau, groupes calculés, aperçus réels, écrans existants. */
export interface LigneeLibre {
  modele: ModeleLignee;
  groupes: GroupeLignee[];
  apercus: Record<string, string>;
  /** L'écran d'un nœud quand le serveur le connaît mieux que la projection (fiche marque · admin seulement). */
  destinations: Record<string, string | null>;
  /**
   * PC E11 · les notes de la lignée (`lireNotesLigneePour`) · rangées par
   * l'écran sous leur nœud ou dans « Notes sans nœud » · `ok: false` · la
   * lecture a échoué, le canvas reste, la raison est dite. Absentes · rien.
   */
  notes?: { ok: true; vue: NotesLignee } | { ok: false; message: string } | null;
}

/** Une note de la lignée, telle que l'écran la rend · le texte est du TEXTE. */
export interface VueNoteLignee {
  id: string;
  /** La clé stable du nœud (identifiant de lignée) · la note se range sous lui s'il est dans la lignée. */
  noeud: string;
  /** Le libellé du nœud gardé avec la note · lisible quand le nœud a disparu. */
  libelleNoeud: string;
  auteur: string;
  quand: string;
  texte: string;
  modifie: string | null;
  /** Les textes remplacés, du plus ancien au plus récent · jamais perdus. */
  anciens: Array<{ texte: string; quand: string }>;
  resolu: { par: string; quand: string } | null;
  /** Règle du noyau (`droitsCommentaire`, phrases `TEXTES_NOTE`) · rejouée par le serveur au clic. */
  gestes: DroitsCommentaire;
  rowVersion: number;
}

export interface NotesLignee { peutEcrire: boolean; notes: VueNoteLignee[] }

/* ───────────────────────────── Lot 10 · activité et commentaires ───────────────────────────── */

/** Ce qu'on peut commenter · une version du projet, ou une création (sortie livrée d'un lot). */
export interface CibleCommentable { cle: string; type: 'version' | 'creation'; id: string; libelle: string }

export interface VueCommentaire {
  id: string;
  cible: { type: 'version' | 'creation'; id: string; libelle: string };
  auteur: string;
  quand: string;
  /** Le texte tel qu'écrit · rendu comme du TEXTE (jamais du HTML), retours à la ligne gardés. */
  texte: string;
  /**
   * Le texte découpé pour l'écran (`segmentsCommentaire`) · chaque mention sous
   * le nom COURANT du membre, « @un ancien membre » s'il ne voit plus le projet ·
   * des segments de texte, jamais du HTML.
   */
  segments: SegmentCommentaire[];
  /** « Modifié le 08/11/2026 · 14:32 · 2 fois » · `null` jamais modifié. */
  modifie: string | null;
  resolu: { par: string; quand: string } | null;
  /** Règle du noyau (`droitsCommentaire`) · rejouée par le serveur au clic. */
  gestes: DroitsCommentaire;
  /**
   * « Itérer depuis ce commentaire » (`gesteIterationCommentaire`) · `null` sans
   * pub testée dont partir (version, création non testée) · fermé avec sa raison
   * sinon · un lien vers l'écran Itérer, qui relit tout, jamais une écriture.
   */
  iterer: GesteIterationCommentaire | null;
  /**
   * Le résultat des itérations nées de ce commentaire (`resultatsCommentaire`) ·
   * calculé à chaque lecture depuis la conclusion de leur lot · « en test » tant
   * qu'il n'est pas conclu · vide sans itération ou Résultats fermé.
   */
  resultats: ResultatCommentaire[];
  rowVersion: number;
}

export interface CommentairesProjet {
  commentaires: VueCommentaire[];
  cibles: CibleCommentable[];
  peutCommenter: boolean;
  /** Les membres que la session peut mentionner (`membresMentionnables`) · vide si elle ne peut pas commenter. */
  mentionnables: MembreMentionnable[];
}

/** L'onglet « Activité » · journal (lecture seule) et commentaires, lus par la page serveur. */
export interface PropsActiviteProjet {
  projectId: string;
  journal: { ok: true; journal: JournalProjet; tronque: boolean } | { ok: false; message: string };
  commentaires: { ok: true; liste: CommentairesProjet } | { ok: false; message: string };
}
