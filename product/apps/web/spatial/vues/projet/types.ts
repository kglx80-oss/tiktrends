import type { ClassePastille, CouloirSpatial, EtatGeneration } from '@tiktrends/core';
import type { ListePropositions, ReponseProposition } from '../../../lib/studios/propositions/types';

/**
 * Les props des écrans de la rubrique « projet » · données SÉRIALISABLES lues
 * par les pages serveur (`app/(spatial)/sp/studio/projets/[id]/…`). Types
 * seuls · aucun code ici (importable des deux côtés).
 */

export type OngletProjet = 'brief' | 'canvas' | 'crea';

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
  references: Array<{ id: string; titre: string; detail: string; apercu: string | null; href: string | null; libelleLien: string }>;
  produit: { nom: string; faits: string[]; manques: string[]; instantane: string; photo: string | null; href: string | null } | null;
  veilleHref: string | null;
  fiche: { score: number; texte: string; href: string | null } | null;
  manques: Array<{ cle: string; libelle: string; bloquant: boolean }>;
  versions: Array<{ id: string; n: number; date: string; raison: string | null; courante: boolean; vue: boolean; href: string }>;
  atelier: Array<{ segment: string; libelle: string; href: string | null; mention: string | null }>;
  exportBrief: { autorise: boolean; possible: boolean };
  propositions: { initial: ReponseProposition<ListePropositions> | null; versionCourante: { id: string; n: number } | null };
}

export interface SortieSpatiale { assetId: string; libelle: string; apercu: string | null; detail: string; choisir: boolean; raison: string | null; varianteId: string | null }

export interface LotSpatial {
  jobId: string;
  titre: string;
  version: string;
  etat: EtatGeneration;
  qualite: string | null;
  message: string | null;
  sorties: SortieSpatiale[];
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
  test: { href: string; resume: string; verdict: string } | null;
  /** Lien du test rattaché (`studio_test_links`) · la relecture de l'apprentissage le vise. */
  lienTest: string | null;
  lecture: { conclusion: string; phrase: string } | null;
  gestes: { iterer: boolean; relire: boolean; rattacher: boolean };
}

export interface TacheSpatiale { id: string; titre: string; classe: ClassePastille; detail: string; explication: string; interrompue: boolean }

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
  /** Le panneau V5 complet (rattachement d'un test, lot d'essai) · pas encore porté. */
  panneauCompletHref: string;
  /** Un travail est en cours · la page se relit d'elle-même. */
  relire: boolean;
}

export interface PropsProjet {
  projet: { id: string; titre: string; sousTitre: string; kind: string };
  pastille: { classe: ClassePastille; libelle: string; icone: 'check' | 'lock' };
  exporterHref: string | null;
  generer: { href: string | null; libelle: string; raison: string | null };
  couloirs: CouloirSpatial[];
  aideCanvas: string;
  jarvis: PropsJarvisProjet;
  brief: PropsBriefProjet;
  creations: PropsCreationsProjet;
  ongletInitial?: OngletProjet;
}
