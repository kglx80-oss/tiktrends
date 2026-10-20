import { LIBELLES_TYPE_PROJET } from '../brief';

/**
 * « Nouveau projet » depuis la liste des projets · ce que l'écran PROPOSE, et
 * ce qu'il vérifie avant d'appeler le serveur. Pur · ni base, ni réseau.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * L'action serveur `creerProjet` existait et n'était appelée par AUCUNE
 * interface · on ne créait un projet qu'en partant d'une annonce de la Veille.
 * La liste des projets n'offrait qu'un lien vers la Veille.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Jamais de bouton mort. Le geste n'est proposé que s'il peut aboutir :
 *
 *  - rôle en lecture seule (`studio.propose` absent) · on le DIT, sans bouton ;
 *  - aucune marque active · le projet n'aurait pas de marque · on le dit, avec
 *    la porte vers les marques ;
 *  - sinon · le bouton, pour la marque ACTIVE (comme le reste de l'application).
 *
 * La capacité `projets` coupée n'arrive pas jusqu'ici · la page entière dit
 * alors « non activé pour cet espace » (`CapaciteNonActive`). Si elle est
 * coupée entre l'affichage et le clic, le serveur refuse et l'écran affiche son
 * message.
 */

/** Les types offerts à la création directe · les mêmes que « Préparer une création ». */
export const TYPES_NOUVEAU_PROJET = ['ads', 'image', 'video', 'text'] as const;
export type TypeNouveauProjet = (typeof TYPES_NOUVEAU_PROJET)[number];

/** Recopie de la borne du dépôt (`TITRE_MAX`, lib/studios/depot.ts) · le serveur la revérifie. */
export const TITRE_NOUVEAU_PROJET_MAX = 200;

export type EtatNouveauProjet =
  | { etat: 'pret'; marque: { id: string; nom: string }; libelle: string }
  | { etat: 'lecture-seule'; message: string }
  | { etat: 'sans-marque'; message: string; lien: { href: string; libelle: string } };

export function etatNouveauProjet(e: {
  peutProposer: boolean;
  marqueActive: { id: string; name: string } | null;
}): EtatNouveauProjet {
  if (!e.peutProposer) {
    return { etat: 'lecture-seule', message: 'Ton rôle permet de lire les projets, pas d’en créer · demande un rôle Membre à un administrateur de l’espace.' };
  }
  if (!e.marqueActive) {
    return {
      etat: 'sans-marque',
      message: 'Un projet appartient à une marque · choisis une marque active pour en créer un.',
      lien: { href: '/brands', libelle: 'Choisir une marque' },
    };
  }
  return { etat: 'pret', marque: { id: e.marqueActive.id, nom: e.marqueActive.name }, libelle: 'Nouveau concept créatif' };
}

/**
 * Le « concept créatif » (vocabulaire CLIENT, mandat Kevin du 20/10) EST le
 * projet studio · même objet, même table, même route de reprise. Seul le mot vu
 * à l'écran change · aucune migration de vocabulaire en base.
 *
 * L'écran de création conversationnelle · le CTA y NAVIGUE (il n'ouvre plus la
 * modale Titre/Type). L'écran est en LECTURE SEULE à l'ouverture : ni projet, ni
 * conversation, ni appel modèle au GET · la création réelle démarre au premier
 * message (différée, hors de ce périmètre).
 */
export const CHEMIN_NOUVEAU_CONCEPT = '/studio/projets/nouveau/concept';

/** La première accroche de l'écran de concept · texte UI, pur et testable. */
export function accrocheNouveauConcept(marque: string): string {
  return `Que veux-tu créer pour ${marque} ?`;
}

/**
 * Ce qu'un message au concept coûte VRAIMENT · la vérité de la route.
 *
 * Le composeur du concept envoie à `/api/jarvis/chat`, qui passe par
 * `guardedAnthropic` (le plafond $ IA) et ne débite AUCUN crédit du solde.
 * Annoncer « coûte 1 crédit » serait trompeur : le catalogue porte bien
 * `chat: 1`, mais cette route ne le débite pas · seul l'ancien assistant
 * (`app/actions/assistant.ts`) débite ce crédit, et ce n'est pas ce chemin.
 * On énonce donc le coût réel (fournisseur IA sous plafond), et on ne promet
 * jamais la gratuité · un appel au modèle est bien consommé à chaque envoi.
 * Pur et testable · la copie ne vit pas dans le JSX.
 */
export const MENTION_COUT_MESSAGE_CONCEPT =
  'Aucun crédit débité pour la conversation · le coût IA fournisseur est comptabilisé sous le plafond IA à chaque envoi · la génération se facture à part, par un devis.';

/** Titre proposé à l'ouverture · modifiable, jamais vide. */
export function titreNouveauProjetParDefaut(type: TypeNouveauProjet, marque: string): string {
  return `${LIBELLES_TYPE_PROJET[type] ?? 'Projet'} · ${marque}`.slice(0, TITRE_NOUVEAU_PROJET_MAX);
}

/**
 * Le type par défaut d'un concept créatif (mandat Kevin du 20/10) · l'entrée
 * conversationnelle crée un projet studio `ads`, le cœur de l'outil (créatives
 * winneuses). Pur · le serveur (`demarrerConcept`) le lit pour appeler
 * l'écriture canonique `creerProjet` SANS redécider le type dans du JSX.
 */
export const KIND_CONCEPT_DEFAUT: TypeNouveauProjet = 'ads';

/**
 * Ce que le PREMIER message du concept crée · le type et le titre dérivé de la
 * marque, pour l'écriture canonique `creerProjet`. Pur et testable · la décision
 * ne vit pas dans le composeur ni dans l'action serveur.
 */
export function conceptParDefaut(marque: string): { kind: TypeNouveauProjet; title: string } {
  return { kind: KIND_CONCEPT_DEFAUT, title: titreNouveauProjetParDefaut(KIND_CONCEPT_DEFAUT, marque) };
}

/** Vérification avant envoi · le message dit quoi corriger. Le serveur revérifie tout. */
export function verifierNouveauProjet(e: { titre: string; type: string }):
  | { ok: true; titre: string; type: TypeNouveauProjet }
  | { ok: false; message: string } {
  const titre = e.titre.trim();
  if (!titre) return { ok: false, message: 'Donne un titre au projet.' };
  if (titre.length > TITRE_NOUVEAU_PROJET_MAX) return { ok: false, message: `Titre trop long · ${TITRE_NOUVEAU_PROJET_MAX} caractères au plus.` };
  if (!(TYPES_NOUVEAU_PROJET as readonly string[]).includes(e.type)) return { ok: false, message: 'Choisis un type de projet.' };
  return { ok: true, titre, type: e.type as TypeNouveauProjet };
}
